import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { ApiError } from '../errors.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRequireAdmin } from '../middleware/admin.js';
import { PRODUCT_SELECT, toProduct } from './products.js';
import { only, invalid, toOrder } from '../checkout.js';
import { createProductImages, imageList, isStoragePath, isTmpPath, pathOwner, publicImageUrl, sameImages, uploadRequest } from '../productImages.js';
import { CARRIERS } from '../orderEmails.js';
import { adminDatabase, allRows, customerEmails, customerSummaries, identifier, productPatch, settingsPatch, toSettings, reports, STATUSES, TRANSITIONS, ORDER_SELECT } from '../admin.js';

const notFound = (name) => new ApiError(404, 'NOT_FOUND', `${name} not found.`);
// Admins also receive the raw stored entries so edits can send them back unchanged.
const adminProduct = (row) => ({ ...toProduct(row), archived: row.archived,
  imageSources: (row.images ?? []).map((source) => ({ source, url: publicImageUrl(source) })) });
const imageConflict = () => new ApiError(409, 'IMAGES_CONFLICT', 'Product images changed during editing. Reload before changing images.');
export function createAdminRouter({ client, storage = client.storage, verifyAccessToken, cookieSessions, payments, notifications, now = () => new Date() }) {
  const router = Router();
  const images = createProductImages(storage);
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
  if (payments) router.post('/orders/:id/payment/reconcile', async (req, res) => {
    identifier(req.params.id);
    res.json({ payment: await payments.adminReconcile(req) });
  });
  if (payments) router.post('/orders/:id/payment/cancel', async (req, res) => {
    only(req.body, []);
    res.json({ payment: await payments.cancel(identifier(req.params.id), null) });
  });
  router.get('/orders/:id', async (req, res) => {
    const row = await adminDatabase(() => client.from('orders').select(ORDER_SELECT).eq('id', identifier(req.params.id)).maybeSingle());
    if (!row) throw notFound('Order');
    res.json(toOrder(row));
  });
  router.patch('/orders/:id/status', async (req, res) => {
    only(req.body, ['status', 'expectedStatus', 'trackingNumber', 'trackingCarrier']);
    const { status, expectedStatus, trackingNumber, trackingCarrier } = req.body;
    if (!STATUSES.includes(status) || !STATUSES.includes(expectedStatus)) invalid('Provide valid status and expectedStatus.');
    const tracking = {};
    if (trackingNumber !== undefined || trackingCarrier !== undefined) {
      if (status !== 'Shipped') invalid('Tracking details can only be added when marking an order as Shipped.');
      if (typeof trackingNumber !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 -]{2,48}[A-Za-z0-9]$/.test(trackingNumber.trim())) invalid('Use a 4-50 character tracking number (letters, numbers, spaces or dashes).');
      if (!CARRIERS.includes(trackingCarrier)) invalid('Choose a supported courier.');
      tracking.tracking_number = trackingNumber.trim(); tracking.tracking_carrier = trackingCarrier;
    }
    if (status === 'Cancelled') throw new ApiError(409, 'USE_CANCELLATION', 'Use the controlled cancellation action to restock atomically.');
    const id = identifier(req.params.id);
    const row = await adminDatabase(() => client.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle());
    if (!row) throw notFound('Order');
    if (row.status === status) return res.json(toOrder(row));
    if (row.payment_method !== 'cod' && row.payment_state !== 'paid') throw new ApiError(409, 'PAYMENT_REQUIRED', 'Verified payment is required before fulfillment.');
    if (payments && row.payment_state === 'paid' && (await payments.reconcile(id, null)).status !== 'paid') {
      throw new ApiError(409, 'PAYMENT_REQUIRED', 'Payment or refund state changed. Reconcile before fulfillment.');
    }
    if (row.status !== expectedStatus || !TRANSITIONS[row.status]?.includes(status)) throw new ApiError(409, 'STATUS_CONFLICT', 'The order changed or this transition is not allowed. Refresh before retrying.');
    // The proposed database guard is the authoritative race protection. This
    // check also blocks unpaid legacy/demo online orders before deployment.
    const changed = await adminDatabase(() => client.from('orders').update({ status, ...tracking }).eq('id', id).eq('status', expectedStatus).select(ORDER_SELECT).maybeSingle());
    if (!changed) throw new ApiError(409, 'STATUS_CONFLICT', 'The order changed. Refresh before retrying.');
    // Only after the guarded update succeeded; the email runs in the background.
    notifications?.statusChanged(changed, expectedStatus);
    res.json(toOrder(changed));
  });
  router.post('/orders/:id/cancel', async (req, res) => {
    only(req.body, ['reason']);
    const id = identifier(req.params.id);
    let reason = null;
    if (req.body.reason !== undefined && req.body.reason !== null) {
      if (typeof req.body.reason !== 'string' || req.body.reason.trim().length > 500) invalid('Keep the cancellation reason under 500 characters.');
      reason = req.body.reason.trim().replace(/\s+/g, ' ') || null;
    }
    const before = await adminDatabase(() => client.from('orders').select('id, status').eq('id', id).maybeSingle());
    if (payments) {
      const current = await adminDatabase(() => client.from('orders').select('*').eq('id', id).maybeSingle());
      if (current?.payment_state) throw new ApiError(409, 'PAYMENT_CONFLICT', 'Close or reconcile the online payment first. Paid orders require a refund review.');
    }
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
    const cancelled = { ...result.data };
    if (before && before.status !== 'Cancelled') {
      // The reason is saved separately from the atomic cancellation. A failure here
      // never undoes the cancellation; the email is simply sent without a reason.
      if (reason) {
        try {
          const saved = await client.from('orders').update({ cancellation_reason: reason }).eq('id', id).select('id').maybeSingle();
          if (!saved.error && saved.data) cancelled.cancellation_reason = reason;
        } catch { /* see above */ }
      }
      notifications?.statusChanged(cancelled, before.status);
    }
    res.json(toOrder(cancelled));
  });
  router.get('/orders/:id/notifications', async (req, res) => {
    const id = identifier(req.params.id);
    if (!notifications) throw new ApiError(503, 'NOTIFICATIONS_UNAVAILABLE', 'Order emails are not configured.');
    let items;
    try { items = await notifications.history(id); }
    catch { throw new ApiError(503, 'NOTIFICATIONS_UNAVAILABLE', 'Notification history is unavailable. Check the notifications migration.'); }
    res.json({ items });
  });
  router.post('/orders/:id/notifications/resend', async (req, res) => {
    only(req.body, []);
    if (!notifications) throw new ApiError(503, 'NOTIFICATIONS_UNAVAILABLE', 'Order emails are not configured.');
    res.json({ notification: await notifications.resend(identifier(req.params.id)) });
  });
  router.get('/products', async (_req, res) => res.json({ items: (await allRows(client, 'products', PRODUCT_SELECT)).map(adminProduct) }));
  async function checkStone(stone) {
    if (stone === undefined) return;
    const collection = await adminDatabase(() => client.from('collections').select('stone').eq('stone', stone).maybeSingle());
    if (!collection) invalid('Choose an existing collection stone.');
  }
  async function productImages(id) {
    const row = await adminDatabase(() => client.from('products').select('id, images').eq('id', id).maybeSingle());
    if (!row) throw notFound('Product');
    return row.images ?? [];
  }
  // Issues a short-lived signed upload URL. The browser uploads bytes directly to
  // Storage; Express only authorizes and later verifies what was uploaded.
  router.post('/products/images/upload-url', async (req, res) => {
    only(req.body, ['productId', 'fileName', 'contentType', 'size', 'count']);
    const { extension, contentType } = uploadRequest(req.body);
    let owner = 'tmp';
    if (req.body.productId !== undefined) {
      owner = identifier(req.body.productId);
      if (owner === 'tmp') invalid('Invalid record identifier.');
      await productImages(owner);
    }
    res.status(201).json({ ...(await images.signUpload(owner, extension)), contentType });
  });
  // Deletes uploads from an unsaved form. Images saved on a product are never deleted here.
  router.post('/products/images/discard', async (req, res) => {
    only(req.body, ['paths']);
    const paths = req.body.paths;
    if (!Array.isArray(paths) || !paths.length || paths.length > 20 || !paths.every(isStoragePath)) invalid('Provide uploaded image paths to discard.');
    const saved = new Set();
    for (const owner of new Set(paths.filter((path) => !isTmpPath(path)).map(pathOwner))) {
      const row = await adminDatabase(() => client.from('products').select('id, images').eq('id', owner).maybeSingle());
      for (const entry of row?.images ?? []) saved.add(entry);
    }
    const removable = [...new Set(paths)].filter((path) => !saved.has(path));
    if (!(await images.remove(removable))) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Image storage is temporarily unavailable. Please retry.');
    res.json({ removed: removable.length });
  });
  router.post('/products', async (req, res) => {
    const patch = productPatch(req.body, true); await checkStone(patch.stone);
    const suffix = randomUUID().replaceAll('-', '');
    const id = `p-${suffix}`;
    const slug = `${patch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'product'}-${suffix.slice(0, 12)}`;
    const uploads = (patch.images ?? []).filter(isStoragePath);
    if (!uploads.every(isTmpPath)) invalid('New products can only use newly uploaded images.');
    await images.verify(uploads);
    const moved = await images.attach(uploads, id);
    if (patch.images) patch.images = patch.images.map((entry) => moved.get(entry) ?? entry);
    let row;
    try {
      row = await adminDatabase(() => client.from('products').insert({ rating: 0, review_count: 0, is_new: true,
        is_featured: false, archived: false, images: [], details: patch.short_description, added_at: now().toISOString().slice(0, 10), ...patch, id, slug })
        .select(PRODUCT_SELECT).maybeSingle());
    } catch (error) { await images.detach(moved); throw error; }
    if (!row) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Product creation could not be confirmed. Reload before retrying.');
    res.status(201).json(adminProduct(row));
  });
  router.patch('/products/:id', async (req, res) => {
    const id = identifier(req.params.id);
    const patch = productPatch(req.body); await checkStone(patch.stone);
    let query = client.from('products').update(patch).eq('id', id);
    if (Object.hasOwn(patch, 'stock')) query = query.eq('stock', req.body.expectedStock);
    let removed = [];
    if (Object.hasOwn(patch, 'images')) {
      const expected = imageList(req.body.expectedImages, 10);
      const current = await productImages(id);
      if (!sameImages(current, expected)) throw imageConflict();
      const added = patch.images.filter((entry) => isStoragePath(entry) && !current.includes(entry));
      if (!added.every((path) => pathOwner(path) === id)) invalid('Upload images for this product before saving them.');
      await images.verify(added);
      removed = current.filter((entry) => isStoragePath(entry) && !patch.images.includes(entry));
      // Same optimistic guard as stock: the update only applies to the list we checked.
      query = query.contains('images', expected).containedBy('images', expected);
    }
    const row = await adminDatabase(() => query.select(PRODUCT_SELECT).maybeSingle());
    if (!row) {
      if (Object.hasOwn(patch, 'stock')) throw new ApiError(409, 'INVENTORY_CONFLICT', 'Inventory changed during editing. Reload before changing stock.');
      if (Object.hasOwn(patch, 'images')) throw imageConflict();
      throw notFound('Product');
    }
    // Files are deleted only after the product no longer references them. Order
    // history does not reference product images, so this cannot affect past orders.
    await images.remove(removed);
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
    // Count only customers who confirmed their email; if Auth can't be read, count every customer profile.
    const customerIds = profiles.filter((profile) => profile.role === 'customer').map((profile) => profile.id);
    const { emails, available } = await customerEmails(client, customerIds);
    const confirmedIds = available ? new Set(emails.keys()) : undefined;
    return { result: reports({ orders, products, profiles, collections, confirmedIds }, months, now()), orders, profiles };
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
      allRows(client, 'orders', '*'),
      allRows(client, 'addresses', 'id, user_id, city, is_default'),
    ]);
    const { emails, available } = await customerEmails(client, profiles.map((profile) => profile.id));
    res.json({ items: customerSummaries({ profiles, orders, addresses, emails }), emailLookupAvailable: available });
  });
  router.use((error, req, res, next) => next(error instanceof ApiError ? error : new ApiError(503, 'DATABASE_UNAVAILABLE', 'Store data is temporarily unavailable. Please retry.')));
  return router;
}
