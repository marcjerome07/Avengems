import { Router } from 'express';
import { ApiError } from './errors.js';
import { only } from './checkout.js';

/**
 * In-app notifications for customers. Rows are created by the central order status
 * function (orderNotifications.statusChanged) and read through /api/me/notifications,
 * which already enforces the session, CSRF/Origin on writes and a verified customer.
 * Every query is scoped to req.auth.userId; the table has RLS on and no browser grants.
 */
export const NOTIFICATION_TABLE = 'customer_notifications';
export const NOTIFICATION_TYPES = { Pending: 'placed', Processing: 'processing', Shipped: 'shipped', Delivered: 'delivered', Cancelled: 'cancelled' };
const LIST_LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Plain-text title/body for an order (API shape from toOrder) at a status. React escapes on render. */
export function notificationContent(order, status) {
  const type = NOTIFICATION_TYPES[status];
  if (!type) return null;
  const ref = order.reference ?? order.id;
  let title, body;
  switch (type) {
    case 'placed':
      title = `Order ${ref} placed`;
      body = "We've received your order. We'll let you know when it's being prepared.";
      break;
    case 'processing':
      title = `Order ${ref} is being prepared`;
      body = 'Our team is now preparing your pieces.';
      break;
    case 'shipped':
      title = `Order ${ref} has shipped`;
      body = order.tracking?.number
        ? `On its way with ${order.tracking.carrier ?? 'the courier'}. Tracking number: ${order.tracking.number}.`
        : 'Your order is on its way.';
      break;
    case 'delivered':
      title = `Order ${ref} was delivered`;
      body = 'Your order has been marked as delivered. We hope you love it.';
      break;
    default:
      title = `Order ${ref} was cancelled`;
      body = order.cancellationReason ? `Reason: ${order.cancellationReason}` : 'Your order has been cancelled.';
  }
  return { type, title: clip(title, 200), body: clip(body, 1000) };
}

/**
 * Creates the notification for an order status once (unique order_id + type). Returns
 * true when a row was created, false when it already existed. Throws on storage errors.
 */
export async function createCustomerNotification(client, { userId, order, status }) {
  const content = notificationContent(order, status);
  if (!content || typeof userId !== 'string' || !userId) return false;
  const result = await client.from(NOTIFICATION_TABLE).upsert({ user_id: userId, order_id: order.id, ...content },
    { onConflict: 'order_id,type', ignoreDuplicates: true }).select('id');
  if (result?.error) throw new Error(`Customer notification storage unavailable (${result.error.code ?? 'error'})`);
  return Boolean(result?.data?.length);
}

const toNotification = (row) => ({ id: row.id, orderId: row.order_id, type: row.type, title: row.title, body: row.body,
  read: Boolean(row.read_at), readAt: row.read_at ?? null, createdAt: row.created_at });
// Before the migration runs the table does not exist; the bell then shows an empty list.
const missingTable = (error) => ['42P01', 'PGRST205', 'PGRST200'].includes(error?.code);
const unavailable = () => new ApiError(503, 'NOTIFICATIONS_UNAVAILABLE', 'Notifications are temporarily unavailable. Please try again.');

export function createCustomerNotificationsRouter(client, { now = () => new Date() } = {}) {
  const router = Router();
  async function run(operation) {
    let result;
    try { result = await operation(); } catch { throw unavailable(); }
    return result;
  }
  async function summary(userId) {
    const [list, unread] = await Promise.all([
      run(() => client.from(NOTIFICATION_TABLE).select('id, order_id, type, title, body, read_at, created_at').eq('user_id', userId)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(LIST_LIMIT)),
      run(() => client.from(NOTIFICATION_TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null)),
    ]);
    if (missingTable(list.error) || missingTable(unread.error)) return { items: [], unreadCount: 0, available: false };
    if (list.error || unread.error) throw unavailable();
    return { items: (list.data ?? []).map(toNotification), unreadCount: unread.count ?? 0, available: true };
  }

  router.get('/', async (req, res) => res.json(await summary(req.auth.userId)));

  router.post('/read-all', async (req, res) => {
    only(req.body, []);
    const result = await run(() => client.from(NOTIFICATION_TABLE).update({ read_at: now().toISOString() })
      .eq('user_id', req.auth.userId).is('read_at', null).select('id'));
    if (result.error) throw unavailable();
    res.json({ updated: result.data?.length ?? 0, unreadCount: 0 });
  });

  router.post('/:id/read', async (req, res) => {
    only(req.body, []);
    const id = req.params.id;
    if (!UUID.test(id)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid notification.');
    // Both queries are scoped to the signed-in user, so another customer's notification
    // is indistinguishable from one that does not exist.
    const updated = await run(() => client.from(NOTIFICATION_TABLE).update({ read_at: now().toISOString() })
      .eq('id', id).eq('user_id', req.auth.userId).is('read_at', null).select('id, order_id, type, title, body, read_at, created_at').maybeSingle());
    if (updated.error) throw unavailable();
    let row = updated.data;
    if (!row) {
      const existing = await run(() => client.from(NOTIFICATION_TABLE).select('id, order_id, type, title, body, read_at, created_at')
        .eq('id', id).eq('user_id', req.auth.userId).maybeSingle());
      if (existing.error) throw unavailable();
      if (!existing.data) throw new ApiError(404, 'NOT_FOUND', 'Notification not found.');
      row = existing.data;
    }
    const unread = await run(() => client.from(NOTIFICATION_TABLE).select('id', { count: 'exact', head: true }).eq('user_id', req.auth.userId).is('read_at', null));
    res.json({ notification: toNotification(row), unreadCount: unread.error ? null : unread.count ?? 0 });
  });
  return router;
}
