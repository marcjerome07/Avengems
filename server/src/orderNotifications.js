import { ApiError } from './errors.js';
import { toOrder } from './checkout.js';
import { describeMailError, redactEmails } from './mailer.js';
import { NOTIFY_STATUSES, customerOrderEmail, storeOrderAlert } from './orderEmails.js';
import { createCustomerNotification } from './customerNotifications.js';

export const MAX_ATTEMPTS = 4; // first try + up to 3 retries
const TABLE = 'order_notifications';
const ORDER_SELECT = '*, items:order_items(*)';
const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export const toNotification = (row) => ({ id: String(row.id), status: row.status, recipient: row.recipient, kind: row.kind,
  sentAt: row.sent_at ?? null, error: row.error ?? null, attempts: row.attempts, channel: row.channel ?? null,
  createdAt: row.created_at ?? null, updatedAt: row.updated_at ?? null });

/**
 * Order status emails. Call `statusChanged(order, previousStatus)` only after a status
 * change has been saved; it never throws and never delays the caller's response.
 * Customer emails go only to the order owner's verified login email (Supabase Auth),
 * never to orders.customer_email, which is contact information typed at checkout.
 * Each (order, status, recipient, kind) is claimed once in order_notifications, so retries,
 * replays and the startup sweep cannot send duplicates.
 */
export function createOrderNotifications({ client, mailer, origin, storeEmail, logger: baseLogger = console, production = false,
  retryDelays = [5000, 30000, 120000], now = () => new Date(), wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  // Production logs never contain full email addresses (SMTP errors can echo them).
  const logger = production ? Object.fromEntries(['log', 'warn', 'error'].map((level) =>
    [level, (line) => baseLogger[level](redactEmails(String(line)))])) : baseLogger;
  const tasks = new Set();
  const inFlight = new Set();
  const store = validEmail(storeEmail) ? storeEmail.toLowerCase() : null;

  function track(promise) {
    const task = promise.catch((error) => logger.error(`[notifications] ${describeMailError(error)}`));
    tasks.add(task); task.finally(() => tasks.delete(task));
    return task;
  }
  async function query(operation) {
    const result = await operation();
    if (result?.error) throw new Error(`Notification storage unavailable (${result.error.code ?? 'error'})`);
    return result.data;
  }
  async function context(orderId) {
    const [row, settings] = await Promise.all([
      query(() => client.from('orders').select(ORDER_SELECT).eq('id', orderId).maybeSingle()),
      // Settings only affect email branding; a failure must not block in-app notifications.
      query(() => client.from('store_settings').select('*').eq('id', 1).maybeSingle()).catch(() => null),
    ]);
    if (!row) return null;
    return { order: toOrder(row), userId: row.user_id,
      options: { storeName: settings?.store_name || 'AVENGEMS', contactEmail: settings?.contact_email || store || '', origin: origin || null } };
  }
  /** The order owner's verified login email, or null. Throws if Auth cannot be reached. */
  async function accountEmail(userId) {
    if (typeof userId !== 'string' || !userId) return null;
    const result = await client.auth.admin.getUserById(userId);
    if (result?.error) {
      if (result.error.status === 404) return null;
      throw new Error(`Account lookup unavailable (${result.error.status ?? 'error'})`);
    }
    const user = result?.data?.user;
    return user?.email_confirmed_at && validEmail(user.email) ? user.email.toLowerCase() : null;
  }
  function message(record, ctx) {
    const content = record.kind === 'store' ? storeOrderAlert(ctx.order, ctx.options) : customerOrderEmail(ctx.order, record.status, ctx.options);
    return { ...content, to: record.recipient, replyTo: ctx.options.contactEmail || undefined,
      meta: { orderNumber: ctx.order.reference ?? ctx.order.id, status: record.status, kind: record.kind } };
  }
  /**
   * One send attempt. Returns 'sent', 'failed' (safe to retry), 'skipped' (another
   * worker owns this attempt, or it could not be claimed) or 'unconfirmed' (the email
   * was sent but recording that failed; never retried automatically).
   */
  async function attempt(record, ctx, { manual = false } = {}) {
    const attempts = record.attempts + 1;
    // Claim the attempt before sending. The compare-and-set on `attempts` lets exactly
    // one worker (a retry loop, the startup sweep, another server process or an admin
    // resend) own each attempt.
    let claimed;
    try {
      let claimQuery = client.from(TABLE).update({ attempts, error: null, updated_at: now().toISOString() })
        .eq('id', record.id).eq('attempts', record.attempts);
      if (!manual) claimQuery = claimQuery.is('sent_at', null);
      claimed = await query(() => claimQuery.select('*').maybeSingle());
    } catch (error) {
      logger.error(`[notifications] could not claim email ${record.id}: ${describeMailError(error)}`);
      return 'skipped';
    }
    if (!claimed) return 'skipped';
    Object.assign(record, claimed);
    let channel;
    try {
      ({ channel } = await mailer.send(message(record, ctx)));
    } catch (error) {
      const failure = describeMailError(error);
      logger.error(`[notifications] ${record.status} email for order ${record.order_id} failed (attempt ${attempts}): ${failure}`);
      record.error = failure;
      try {
        await query(() => client.from(TABLE).update({ error: failure, updated_at: now().toISOString() }).eq('id', record.id).select('id').maybeSingle());
      } catch { logger.error(`[notifications] could not record the failure of email ${record.id}.`); }
      return 'failed';
    }
    const sentAt = now().toISOString();
    Object.assign(record, { sent_at: sentAt, channel, error: null, updated_at: sentAt });
    try {
      await query(() => client.from(TABLE).update({ sent_at: sentAt, channel, updated_at: sentAt }).eq('id', record.id).select('id').maybeSingle());
      return 'sent';
    } catch {
      logger.error(`[notifications] email ${record.id} was sent but could not be recorded; it will not be retried automatically.`);
      return 'unconfirmed';
    }
  }
  /** Sends with retries until success or MAX_ATTEMPTS. Only definite failures are retried. */
  async function deliver(record, ctx) {
    if (inFlight.has(record.id)) return;
    inFlight.add(record.id);
    try {
      while (!record.sent_at && record.attempts < MAX_ATTEMPTS) {
        if (await attempt(record, ctx) !== 'failed') return;
        if (record.attempts < MAX_ATTEMPTS) await wait(retryDelays[record.attempts - 1] ?? retryDelays.at(-1) ?? 0);
      }
    } finally { inFlight.delete(record.id); }
  }
  async function claim(orderId, status, recipient, kind) {
    const rows = await query(() => client.from(TABLE).upsert({ order_id: orderId, status, recipient, kind, attempts: 0 },
      { onConflict: 'order_id,status,recipient,kind', ignoreDuplicates: true }).select('*'));
    return rows?.[0] ?? null; // null: already claimed by an earlier change or replay
  }
  async function run(orderId, status) {
    const ctx = await context(orderId);
    if (!ctx) return;
    // In-app notification first and independently: email configuration, Auth lookups
    // and SMTP failures can never prevent it. Unique (order_id, type) makes it once-only.
    try {
      await createCustomerNotification(client, { userId: ctx.userId, order: ctx.order, status });
    } catch (error) {
      logger.error(`[notifications] in-app notification for order ${orderId} (${status}) failed: ${describeMailError(error)}`);
    }
    const recipients = [];
    const customer = await accountEmail(ctx.userId);
    if (customer) recipients.push([customer, 'customer']);
    else logger.warn(`[notifications] order ${orderId} has no verified account email; customer ${status} email not sent.`);
    if (status === 'Pending' && store) recipients.push([store, 'store']);
    for (const [recipient, kind] of recipients) {
      const record = await claim(orderId, status, recipient, kind);
      if (record) await deliver(record, ctx);
    }
  }

  /** The single notification entry point for order status changes. */
  function statusChanged(order, previousStatus) {
    if (!order?.id || !NOTIFY_STATUSES.includes(order.status) || order.status === previousStatus) return null;
    return track(run(order.id, order.status));
  }
  /**
   * Retries emails left unsent by a crash or restart: rows never attempted, or whose last
   * attempt definitely failed. Rows with an attempt but no recorded outcome may already
   * have been delivered, so they are left for an admin to check and resend.
   */
  function sweep() {
    return track((async () => {
      const rows = (await query(() => client.from(TABLE).select('*').is('sent_at', null).lt('attempts', MAX_ATTEMPTS).order('id').limit(200)) ?? [])
        .filter((row) => row.attempts === 0 || row.error);
      const contexts = new Map();
      for (const record of rows) {
        if (!contexts.has(record.order_id)) contexts.set(record.order_id, await context(record.order_id));
        const ctx = contexts.get(record.order_id);
        if (ctx) await deliver(record, ctx);
      }
      if (rows.length) logger.log(`[notifications] startup sweep processed ${rows.length} unsent email(s).`);
    })());
  }
  const stateOf = (row) => (row.sent_at ? 'sent' : inFlight.has(row.id) ? 'sending' : row.error ? 'failed' : row.attempts > 0 ? 'unconfirmed' : 'queued');
  async function history(orderId) {
    const rows = await query(() => client.from(TABLE).select('*').eq('order_id', orderId).order('id'));
    return (rows ?? []).map((row) => ({ ...toNotification(row), state: stateOf(row) }));
  }
  /** Admin action: one immediate send of the current-status email to the customer. */
  async function resend(orderId) {
    let ctx;
    try { ctx = await context(orderId); } catch { throw new ApiError(503, 'NOTIFICATIONS_UNAVAILABLE', 'Notification history is unavailable. Check the notifications migration.'); }
    if (!ctx) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    let recipient;
    try { recipient = await accountEmail(ctx.userId); } catch { throw new ApiError(503, 'ACCOUNT_LOOKUP_UNAVAILABLE', 'The customer account could not be checked. Please retry.'); }
    if (!recipient) throw new ApiError(409, 'NO_VERIFIED_EMAIL', "The customer's account has no verified email address.");
    if (!NOTIFY_STATUSES.includes(ctx.order.status)) throw new ApiError(409, 'NOTHING_TO_SEND', 'This order has no email for its current status.');
    let record;
    try {
      record = await claim(orderId, ctx.order.status, recipient, 'customer')
        ?? await query(() => client.from(TABLE).select('*').eq('order_id', orderId).eq('status', ctx.order.status)
          .eq('recipient', recipient).eq('kind', 'customer').maybeSingle());
    } catch { throw new ApiError(503, 'NOTIFICATIONS_UNAVAILABLE', 'Notification history is unavailable. Check the notifications migration.'); }
    if (!record) throw new ApiError(503, 'NOTIFICATIONS_UNAVAILABLE', 'Notification history is unavailable.');
    const inProgress = () => new ApiError(409, 'EMAIL_IN_PROGRESS', 'This email is already being sent or retried. Refresh in a moment.');
    if (inFlight.has(record.id)) throw inProgress();
    const last = Date.parse(record.updated_at ?? '');
    if (record.attempts > 0 && Number.isFinite(last) && now().getTime() - last < 60000) {
      throw new ApiError(429, 'RESEND_TOO_SOON', 'Please wait a minute before resending this email.');
    }
    inFlight.add(record.id);
    let result;
    try { result = await attempt(record, ctx, { manual: true }); } finally { inFlight.delete(record.id); }
    if (result === 'skipped') throw inProgress();
    if (result === 'failed') throw new ApiError(502, 'EMAIL_SEND_FAILED', 'The email could not be sent. The error was recorded in the history.');
    return { ...toNotification(record), state: result === 'sent' ? 'sent' : 'unconfirmed' };
  }
  async function idle() { while (tasks.size) await Promise.allSettled([...tasks]); }
  return { statusChanged, sweep, history, resend, idle };
}
