import { Router } from 'express';
import { ApiError } from '../errors.js';
import { database } from '../customer.js';
import { only, cartItems, checkoutBody, quoteCart, toOrder, invalid } from '../checkout.js';

export function createCartQuoteRouter(client, cookieSessions) {
  const router = Router();
  const attempts = new Map();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/quote', cookieSessions.protect, async (req, res) => {
    if (!req.is('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
    const time = Date.now();
    for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
    let record = attempts.get(req.ip);
    if (!record) {
      if (attempts.size >= 10000) throw new ApiError(503, 'QUOTE_UNAVAILABLE', 'Cart quotes are temporarily unavailable.');
      record = { count: 0, until: time + 60000 }; attempts.set(req.ip, record);
    }
    if (++record.count > 60) { res.set('Retry-After', '60'); invalid('Please wait before refreshing your cart.', 'RATE_LIMITED', 429); }
    only(req.body, ['items']);
    res.json(await quoteCart(client, cartItems(req.body.items)));
  });
  router.use((error, req, res, next) => next(error instanceof ApiError ? error : new ApiError(503, 'QUOTE_UNAVAILABLE', 'Cart quotes are temporarily unavailable.')));
  return router;
}
// /api/me has already verified customer identity, no-store, CSRF and Origin.
export function createOrdersRouter(client, { customerCancellationEnabled = false } = {}) {
  const router = Router();
  const eligible = (row) => ['Pending', 'Processing'].includes(row.status) && row.checkout_key
    && row.checkout_request && typeof row.checkout_request === 'object' && !Array.isArray(row.checkout_request);
  async function ready() {
    if (!customerCancellationEnabled) return false;
    try { const result = await client.rpc('customer_cancellation_version'); return !result.error && result.data === 1; }
    catch { return false; }
  }
  router.get('/', async (req, res) => {
    const items = [];
    for (let offset = 0; ; offset += 100) {
      const rows = await database(() => client.from('orders').select('*, items:order_items(*)').eq('user_id', req.auth.userId)
        .order('created_at', { ascending: false }).order('id').range(offset, offset + 99));
      items.push(...rows.map(toOrder));
      if (rows.length < 100) break;
    }
    res.json({ items });
  });
  router.get('/:id', async (req, res) => {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(req.params.id)) invalid('Invalid order reference.');
    const row = await database(() => client.from('orders').select('*, items:order_items(*)').eq('user_id', req.auth.userId).eq('id', req.params.id).maybeSingle());
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    res.json({ ...toOrder(row), canCancel: Boolean(eligible(row)) && await ready() });
  });
  router.post('/:id/cancel', async (req, res) => {
    only(req.body, []);
    if (!/^[A-Za-z0-9-]{1,100}$/.test(req.params.id)) invalid('Invalid order identifier.');
    if (!await ready()) throw new ApiError(503, 'CUSTOMER_CANCELLATION_DISABLED', 'Customer cancellation is awaiting validated database deployment.');
    const row = await database(() => client.from('orders').select('id,status,checkout_key,checkout_request')
      .eq('user_id', req.auth.userId).eq('id', req.params.id).maybeSingle());
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if (!eligible(row)) throw new ApiError(409, 'CANCELLATION_INELIGIBLE', 'This order cannot be cancelled automatically.');
    let result;
    try { result = await client.rpc('customer_cancel_order', { p_user_id: req.auth.userId, p_order_id: req.params.id }); }
    catch { throw new ApiError(503, 'CANCELLATION_UNAVAILABLE', 'Cancellation could not be confirmed. Reload the order before retrying.'); }
    if (result.error) {
      const errors = { P3001: [403, 'CUSTOMER_REQUIRED', 'A customer account is required.'],
        P3002: [404, 'NOT_FOUND', 'Order not found.'], P3003: [409, 'STATUS_CONFLICT', 'The order status changed. Reload the order.'],
        P3004: [409, 'CANCELLATION_INELIGIBLE', 'This order cannot be cancelled automatically.'],
        PGRST202: [503, 'CUSTOMER_CANCELLATION_DISABLED', 'Customer cancellation is awaiting database deployment.'],
        '42883': [503, 'CUSTOMER_CANCELLATION_DISABLED', 'Customer cancellation is awaiting database deployment.'] };
      const [status, code, message] = errors[result.error.code] ?? [503, 'CANCELLATION_UNAVAILABLE', 'Cancellation could not be confirmed. Reload the order before retrying.'];
      throw new ApiError(status, code, message);
    }
    if (result.data?.id !== req.params.id || result.data.user_id !== req.auth.userId || result.data.status !== 'Cancelled'
      || !Array.isArray(result.data.items)) throw new ApiError(503, 'CANCELLATION_UNAVAILABLE', 'Cancellation could not be confirmed. Reload the order.');
    res.json({ ...toOrder(result.data), canCancel: false });
  });
  router.post('/', async (req, res) => {
    const key = req.get('Idempotency-Key');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key ?? '')) invalid('Provide a UUID v4 Idempotency-Key.');
    const body = checkoutBody(req.body);
    let result;
    try { result = await client.rpc('customer_checkout', { p_user_id: req.auth.userId, p_key: key, p_request: body }); }
    catch { throw new ApiError(503, 'CHECKOUT_UNAVAILABLE', 'Order placement could not be confirmed. Retry the same request.'); }
    if (result.error) {
      const errors = {
        PGRST202: [503, 'CHECKOUT_MIGRATION_REQUIRED', 'Order placement is awaiting database deployment.'],
        '42883': [503, 'CHECKOUT_MIGRATION_REQUIRED', 'Order placement is awaiting database deployment.'],
        P1001: [409, 'IDEMPOTENCY_CONFLICT', 'This checkout key was already used for different details.'],
        P1002: [409, 'INSUFFICIENT_STOCK', 'A cart product has insufficient stock. Update your cart.'],
        P1003: [409, 'PRODUCT_UNAVAILABLE', 'A cart product is no longer available.'],
        P1004: [400, 'INVALID_CUSTOMIZATION', 'A selected customization is not supported.'],
        P1005: [404, 'NOT_FOUND', 'Shipping address not found.'],
        P1006: [400, 'VALIDATION_ERROR', 'Invalid checkout details.'],
        P1007: [403, 'CUSTOMER_REQUIRED', 'A customer profile is required.'],
      };
      const [status, code, message] = errors[result.error.code] ?? [503, 'CHECKOUT_UNAVAILABLE', 'Order placement could not be confirmed. Retry the same request.'];
      throw new ApiError(status, code, message);
    }
    if (!result.data?.id || result.data.user_id !== req.auth.userId || !Array.isArray(result.data.items)) {
      throw new ApiError(503, 'CHECKOUT_UNAVAILABLE', 'Order placement could not be confirmed. Retry the same request.');
    }
    res.json(toOrder(result.data));
  });
  return router;
}
