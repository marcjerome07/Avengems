import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { ApiError } from '../errors.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRequireAdmin } from '../middleware/admin.js';
import { PRODUCT_SELECT, toProduct } from './products.js';
import { only, invalid, toOrder } from '../checkout.js';
import { adminDatabase, allRows, customerEmails, customerSummaries, identifier, productPatch, settingsPatch, toSettings, reports, STATUSES, TRANSITIONS, ORDER_SELECT } from '../admin.js';

const notFound = (name) => new ApiError(404, 'NOT_FOUND', `${name} not found.`);
const adminProduct = (row) => ({ ...toProduct(row), archived: row.archived });
export function createAdminRouter({ client, verifyAccessToken, cookieSessions, now = () => new Date() }) {
  const router = Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(createRequireAuth(verifyAccessToken, { cookieSessions }), createRequireAdmin(client));
  router.use((req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) return next();
    if (!cookieSessions) throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Write protection is unavailable.');
    cookieSessions.protect(req, res, () => {
      if (!req.is('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
      next();
    });
  });
  router.get('/orders', async (req, res) => {
    const status = req.query.status;
    if (status !== undefined && (typeof status !== 'string' || !['All', ...STATUSES].includes(status))) invalid('Invalid order status filter.');
    const rows = await allRows(client, 'orders', ORDER_SELECT, (query) => status && status !== 'All' ? query.eq('status', status) : query);
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || a.id.localeCompare(b.id));
    res.json({ items: rows.map(toOrder) });
  });
  router.get('/orders/:id', async (req, res) => {
    const row = await adminDatabase(() => client.from('orders').select(ORDER_SELECT).eq('id', identifier(req.params.id)).maybeSingle());
    if (!row) throw notFound('Order');
    res.json(toOrder(row));
  });
  router.patch('/orders/:id/status', async (req, res) => {
    only(req.body, ['status', 'expectedStatus']);
    const { status, expectedStatus } = req.body;
    if (!STATUSES.includes(status) || !STATUSES.includes(expectedStatus)) invalid('Provide valid status and expectedStatus.');
    if (status === 'Cancelled') throw new ApiError(409, 'USE_CANCELLATION', 'Use the controlled cancellation action to restock atomically.');
    const id = identifier(req.params.id);
    const row = await adminDatabase(() => client.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle());
    if (!row) throw notFound('Order');
    if (row.status === status) return res.json(toOrder(row));
    if (row.status !== expectedStatus || !TRANSITIONS[row.status]?.includes(status)) throw new ApiError(409, 'STATUS_CONFLICT', 'The order changed or this transition is not allowed. Refresh before retrying.');
    const changed = await adminDatabase(() => client.from('orders').update({ status }).eq('id', id).eq('status', expectedStatus).select(ORDER_SELECT).maybeSingle());
    if (!changed) throw new ApiError(409, 'STATUS_CONFLICT', 'The order changed. Refresh before retrying.');
    res.json(toOrder(changed));
  });
  router.post('/orders/:id/cancel', async (req, res) => {
    only(req.body, []);
    const id = identifier(req.params.id);
    let result;
    try { result = await client.rpc('admin_cancel_order', { p_admin_id: req.auth.userId, p_order_id: id }); }
    catch { throw new ApiError(503, 'CANCELLATION_UNAVAILABLE', 'Cancellation could not be confirmed. Reload before retrying.'); }
    if (result.error) {
      const errors = { PGRST202: [503, 'CANCELLATION_MIGRATION_REQUIRED', 'Cancellation awaits atomic restocking deployment.'],
        '42883': [503, 'CANCELLATION_MIGRATION_REQUIRED', 'Cancellation awaits atomic restocking deployment.'],
        P2001: [403, 'ADMIN_REQUIRED', 'Administrator access is required.'], P2002: [404, 'NOT_FOUND', 'Order not found.'],
        P2003: [409, 'STATUS_CONFLICT', 'Only pending or processing orders can be cancelled.'] };
      const [status, code, message] = errors[result.error.code] ?? [503, 'CANCELLATION_UNAVAILABLE', 'Cancellation could not be confirmed. Reload before retrying.'];
      throw new ApiError(status, code, message);
    }
    if (result.data?.id !== id || result.data.status !== 'Cancelled' || !Array.isArray(result.data.items)) throw new ApiError(503, 'CANCELLATION_UNAVAILABLE', 'Cancellation could not be confirmed. Reload before retrying.');
    res.json(toOrder(result.data));
  });
  router.get('/products', async (_req, res) => res.json({ items: (await allRows(client, 'products', PRODUCT_SELECT)).map(adminProduct) }));
  async function checkStone(stone) {
    if (stone === undefined) return;
    const collection = await adminDatabase(() => client.from('collections').select('stone').eq('stone', stone).maybeSingle());
    if (!collection) invalid('Choose an existing collection stone.');
  }
  router.post('/products', async (req, res) => {
    const patch = productPatch(req.body, true); await checkStone(patch.stone);
    const suffix = randomUUID().replaceAll('-', '');
    const id = `p-${suffix}`;
    const slug = `${patch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'product'}-${suffix.slice(0, 12)}`;
    const row = await adminDatabase(() => client.from('products').insert({ rating: 0, review_count: 0, is_new: true,
      is_featured: false, archived: false, images: [], details: patch.short_description, added_at: now().toISOString().slice(0, 10), ...patch, id, slug })
      .select(PRODUCT_SELECT).maybeSingle());
    if (!row) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Product creation could not be confirmed. Reload before retrying.');
    res.status(201).json(adminProduct(row));
  });
  router.patch('/products/:id', async (req, res) => {
    const patch = productPatch(req.body); await checkStone(patch.stone);
    let query = client.from('products').update(patch).eq('id', identifier(req.params.id));
    if (Object.hasOwn(patch, 'stock')) query = query.eq('stock', req.body.expectedStock);
    const row = await adminDatabase(() => query.select(PRODUCT_SELECT).maybeSingle());
    if (!row) {
      if (Object.hasOwn(patch, 'stock')) throw new ApiError(409, 'INVENTORY_CONFLICT', 'Inventory changed during editing. Reload before changing stock.');
      throw notFound('Product');
    }
    res.json(adminProduct(row));
  });
  router.delete('/products/:id', async (req, res) => {
    only(req.body, []);
    const row = await adminDatabase(() => client.from('products').update({ archived: true }).eq('id', identifier(req.params.id)).select(PRODUCT_SELECT).maybeSingle());
    if (!row) throw notFound('Product');
    res.json(adminProduct(row));
  });
  router.get('/settings', async (_req, res) => {
    const row = await adminDatabase(() => client.from('store_settings').select('*').eq('id', 1).maybeSingle());
    if (!row) throw new ApiError(503, 'SETTINGS_UNAVAILABLE', 'Store settings have not been configured.');
    res.json(toSettings(row));
  });
  router.patch('/settings', async (req, res) => {
    const patch = settingsPatch(req.body);
    const row = await adminDatabase(() => client.from('store_settings').update(patch).eq('id', 1).select('*').maybeSingle());
    if (!row) throw new ApiError(503, 'SETTINGS_UNAVAILABLE', 'Store settings have not been configured.');
    res.json(toSettings(row));
  });
  async function reportData(months = 6) {
    const [orders, products, profiles, collections] = await Promise.all([
      allRows(client, 'orders', ORDER_SELECT), allRows(client, 'products', 'id, archived'),
      allRows(client, 'profiles', 'id, name, phone, role'), allRows(client, 'collections', 'id, stone, color'),
    ]);
    return { result: reports({ orders, products, profiles, collections }, months, now()), orders, profiles };
  }
  router.get('/dashboard', async (req, res) => {
    const months = req.query.months ?? '6';
    if (typeof months !== 'string' || !/^(?:[1-9]|1[0-2])$/.test(months)) invalid('Choose 1–12 months.');
    const { result } = await reportData(Number(months)); res.json(result);
  });
  router.get('/analytics', async (_req, res) => res.json((await reportData()).result.analytics));
  router.get('/customers', async (_req, res) => {
    const [profiles, orders, addresses] = await Promise.all([
      allRows(client, 'profiles', 'id, name, phone, role', (query) => query.eq('role', 'customer')),
      allRows(client, 'orders', 'id, user_id, status, total, created_at, customer_email'),
      allRows(client, 'addresses', 'id, user_id, city, is_default'),
    ]);
    const { emails, available } = await customerEmails(client, profiles.map((profile) => profile.id));
    res.json({ items: customerSummaries({ profiles, orders, addresses, emails }), emailLookupAvailable: available });
  });
  router.use((error, req, res, next) => next(error instanceof ApiError ? error : new ApiError(503, 'DATABASE_UNAVAILABLE', 'Store data is temporarily unavailable. Please retry.')));
  return router;
}
