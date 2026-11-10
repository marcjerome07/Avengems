import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';
import { cents, only } from './checkout.js';
import { CHANNELS } from './xendit.js';

const disabled = () => new ApiError(503, 'PAYMENTS_DISABLED', 'Online payments are awaiting validated Test Mode deployment. Choose Cash on Delivery.');
const mismatch = () => new ApiError(422, 'PAYMENT_MISMATCH', 'Provider payment details require reconciliation.');
export function publicPayment(row) {
  return { status: row.status, currency: row.currency, amount: Number(row.amount_cents) / 100,
    refundedAmount: Number(row.refunded_cents ?? 0) / 100,
    expiresAt: row.expires_at, paidAt: row.paid_at, lastAttemptStatus: row.last_attempt_status,
    requiresReview: ['unknown','review','creating'].includes(row.status) };
}
export function createPayments({ client, provider, origin }) {
  async function rpc(name, args) {
    let result;
    try { result = await client.rpc(name, args); } catch { /* Report uncertainty below, never replay a write. */ }
    if (!result || result.error) {
      const code = result?.error?.code;
      if (code === 'P4005') throw new ApiError(404, 'NOT_FOUND', 'Payment not found.');
      if (code === 'P4004') throw new ApiError(403, 'CUSTOMER_REQUIRED', 'A customer account is required.');
      if (['P4001','P4002','P4003'].includes(code)) throw new ApiError(409, 'PAYMENT_CONFLICT', 'Payment or inventory state prevents this action. Refresh the order.');
      throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Payment state could not be confirmed. Check the same order before retrying.');
    }
    return result.data;
  }
  async function capabilities() {
    if (!provider.enabled) return { online: false, methods: ['cod'] };
    try {
      const result = await client.rpc('xendit_payment_version');
      if (!result.error && result.data === 1) {
        const url = new URL(origin);
        if (url.origin === origin && url.protocol === 'https:') return { online: true, methods: ['cod', ...provider.methods] };
      }
    } catch { /* Missing migration/configuration is unavailable, never a fallback charge. */ }
    return { online: false, methods: ['cod'] };
  }
  async function requireMethod(method) {
    if (!(await capabilities()).methods.includes(method) || method === 'cod') throw disabled();
  }
  async function record(orderId, ownerId) {
    let query = client.from('order_payments').select('*').eq('order_id', orderId);
    if (ownerId) query = query.eq('customer_id', ownerId);
    let result;
    try { result = await query.maybeSingle(); } catch { /* Fail closed. */ }
    if (!result || result.error) throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Payment information is temporarily unavailable.');
    if (!result.data) throw new ApiError(404, 'NOT_FOUND', 'Payment not found.');
    return result.data;
  }
  function observation(row, session, request) {
    if (session.reference_id !== row.reference_id || session.business_id !== provider.businessId
      || (row.session_id && session.payment_session_id !== row.session_id) || session.session_type !== 'PAY'
      || session.mode !== 'PAYMENT_LINK' || session.capture_method !== 'AUTOMATIC'
      || session.currency !== 'PHP' || session.country !== 'PH' || cents(session.amount) !== Number(row.amount_cents)
      || !Array.isArray(session.allowed_payment_channels) || session.allowed_payment_channels.length !== 1
      || session.allowed_payment_channels[0] !== CHANNELS[row.method]
      || !Number.isFinite(Date.parse(session.expires_at))
      || Date.parse(session.expires_at) > Date.parse(row.expires_at) + 1000) throw mismatch();
    const requestId = session.payment_request_id ?? session.latest_payment_request_id;
    if (requestId && (!request || request.payment_request_id !== requestId
      || request.business_id !== provider.businessId || request.currency !== 'PHP' || request.country !== 'PH'
      || request.customer_id !== session.customer_id || request.capture_method !== 'AUTOMATIC'
      || request.channel_code !== CHANNELS[row.method] || cents(request.request_amount) !== Number(row.amount_cents))) throw mismatch();
    let state;
    if (session.status === 'COMPLETED') state = request?.status === 'SUCCEEDED' ? 'paid' : 'pending';
    else if (session.status === 'ACTIVE') state = 'pending'; // Failed attempts can retry in the SAME session.
    else if (['EXPIRED','CANCELED'].includes(session.status)) {
      if (request?.status === 'SUCCEEDED') state = 'review';
      else if (!requestId || ['FAILED','CANCELED'].includes(request?.status)) state = session.status === 'EXPIRED' ? 'expired' : 'cancelled';
      else state = 'review'; // Never release stock while a payment attempt may still settle.
    } else throw mismatch();
    return { referenceId: row.reference_id, businessId: session.business_id, sessionId: session.payment_session_id,
      amountCents: cents(session.amount), currency: session.currency, state, sessionStatus: session.status,
      paymentRequestId: requestId ?? null, requestStatus: request?.status ?? null,
      paymentId: request?.latest_payment_id ?? session.payment_id ?? null };
  }
  async function apply(row, session, source) {
    const requestId = session.payment_request_id ?? session.latest_payment_request_id;
    const request = requestId ? await provider.getRequest(requestId) : null;
    const data = observation(row, session, request);
    const key = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    let result = await rpc('payment_observe', { p_order_id: row.order_id, p_event_key: key, p_source: source, p_observation: data });
    if (result.rejected) throw mismatch();
    if (result.payment_id && result.paid_at) {
      const refunds = await provider.getRefunds(result.payment_id);
      if (!Array.isArray(refunds) || refunds.length > 1000) throw mismatch();
      const seen = new Set();
      const verified = refunds.map((refund) => {
        if (!/^rfd-[0-9a-f-]{36}$/.test(refund.refund_id ?? '') || seen.has(refund.refund_id)
          || refund.payment_id !== result.payment_id || refund.business_id !== provider.businessId
          || refund.currency !== 'PHP' || refund.channel_code !== CHANNELS[row.method]
          || !['PENDING','FAILED','SUCCEEDED'].includes(refund.status) || cents(refund.amount) <= 0) throw mismatch();
        seen.add(refund.refund_id);
        return { id: refund.refund_id, amountCents: cents(refund.amount), status: refund.status };
      });
      if (verified.length) result = await rpc('payment_refund_observe', { p_order_id: row.order_id,
        p_payment_id: result.payment_id, p_refunds: verified });
    }
    return result;
  }
  async function initiate(orderId, ownerId) {
    const owned = await record(orderId, ownerId);
    await requireMethod(owned.method);
    const row = await rpc('payment_claim', { p_user_id: ownerId, p_order_id: orderId, p_business_id: provider.businessId });
    if (!row.claimed) return { payment: publicPayment(row),
      ...(row.status === 'pending' && row.checkout_url && Date.parse(row.expires_at) > Date.now() ? { checkoutUrl: provider.checkoutUrl(row.checkout_url) } : {}) };
    try {
      const path = `${origin}/order-confirmation/${encodeURIComponent(orderId)}`;
      const session = await provider.create({ reference_id: row.reference_id, session_type: 'PAY', mode: 'PAYMENT_LINK',
        amount: Number(row.amount_cents) / 100, currency: 'PHP', country: 'PH', capture_method: 'AUTOMATIC',
        allowed_payment_channels: [CHANNELS[row.method]], expires_at: row.expires_at,
        customer: { reference_id: `cust_${row.reference_id}`, type: 'INDIVIDUAL', email: row.customer_email,
          individual_detail: { given_names: row.customer_name } },
        success_return_url: `${path}?payment_return=1`, cancel_return_url: `${path}?payment_return=cancelled` });
      const url = provider.checkoutUrl(session.payment_link_url);
      // Verify the response before persisting its link; reconcile any immediate outcome.
      const updated = await apply(row, session, 'create');
      await rpc('payment_attach_link', { p_order_id: orderId, p_claim_token: row.claim_token,
        p_session_id: session.payment_session_id, p_url: url });
      return { payment: publicPayment(updated), ...(updated.status === 'pending' ? { checkoutUrl: url } : {}) };
    } catch (error) {
      try { await rpc('payment_creation_unknown', { p_order_id: orderId, p_claim_token: row.claim_token }); } catch { /* Durable creating state already prevents duplicate POST. */ }
      throw error;
    }
  }
  async function reconcile(orderId, ownerId, sessionId) {
    const row = await record(orderId, ownerId);
    const id = row.session_id ?? sessionId;
    if (!id) {
      if (row.status === 'created') await rpc('payment_expire_unstarted', { p_order_id: orderId });
      return publicPayment(await record(orderId, ownerId));
    }
    const session = await provider.getSession(id);
    const updated = await apply(row, session, 'reconciliation');
    if (!row.checkout_url && row.claim_token && session.status === 'ACTIVE') {
      await rpc('payment_attach_link', { p_order_id: orderId, p_claim_token: row.claim_token,
        p_session_id: session.payment_session_id, p_url: provider.checkoutUrl(session.payment_link_url) });
    }
    return publicPayment(updated);
  }
  async function cancel(orderId, ownerId) {
    const row = await record(orderId, ownerId);
    if (row.status === 'paid' || row.paid_at) throw new ApiError(409, 'REFUND_REVIEW_REQUIRED', 'Paid orders require a separate refund review. Inventory is not restored by a refund.');
    if (!row.session_id) {
      if (row.status === 'created') {
        await rpc('payment_cancel_unstarted', { p_order_id: orderId });
        return publicPayment(await record(orderId, ownerId));
      }
      // No create was claimed: a timed-out reservation can release locally. A
      // claimed/unknown create must first be located in the provider dashboard.
      return reconcile(orderId, ownerId);
    }
    const session = await provider.getSession(row.session_id);
    if (session.status === 'ACTIVE') await provider.cancelSession(row.session_id);
    return reconcile(orderId, ownerId);
  }
  async function webhook(req) {
    const token = req.get('x-callback-token');
    const expected = provider.webhookToken;
    const count = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'x-callback-token').length;
    if (!provider.configured || count !== 1 || typeof token !== 'string' || typeof expected !== 'string'
      || Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      throw new ApiError(401, 'INVALID_WEBHOOK', 'Webhook authentication failed.');
    }
    const body = req.body;
    if (!body || !['payment_session.completed','payment_session.expired'].includes(body.event)) return { ignored: true };
    if (body.business_id !== provider.businessId || body.data?.business_id !== provider.businessId
      || typeof body.data?.reference_id !== 'string' || typeof body.data?.payment_session_id !== 'string') throw mismatch();
    const found = await client.from('order_payments').select('*').eq('reference_id', body.data.reference_id).maybeSingle();
    if (found.error) throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Webhook persistence is temporarily unavailable.');
    if (!found.data) throw new ApiError(422, 'PAYMENT_MISMATCH', 'Unknown payment reference.');
    // Incoming JSON is a notification, NEVER proof. Re-read authenticated provider
    // objects even on replay, so delayed events cannot apply stale payment state.
    const session = await provider.getSession(body.data.payment_session_id);
    if (session.payment_session_id !== body.data.payment_session_id || cents(body.data.amount) !== Number(found.data.amount_cents)
      || body.data.currency !== 'PHP') throw mismatch();
    await apply(found.data, session, 'webhook');
    return { received: true };
  }
  return { capabilities, requireMethod, initiate, reconcile, cancel, webhook, record,
    status: async (id, owner) => publicPayment(await record(id, owner)),
    adminReconcile: async (req) => {
      only(req.body, ['sessionId']);
      if (req.body.sessionId !== undefined && (typeof req.body.sessionId !== 'string' || !/^ps-[A-Za-z0-9-]{1,100}$/.test(req.body.sessionId))) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid test provider session ID.');
      }
      return reconcile(req.params.id, null, req.body.sessionId);
    } };
}
