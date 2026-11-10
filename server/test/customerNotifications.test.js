import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createMeRouter } from '../src/routes/me.js';
import { createCookieSessions } from '../src/sessions.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { errorHandler } from '../src/errors.js';
import { unauthorized } from '../src/auth.js';
import { notificationContent } from '../src/customerNotifications.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const origin = 'http://localhost:5173';
const id = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const note = (n, userId, extra = {}) => ({ id: id(n), user_id: userId, order_id: `AVG-${n}`, type: 'processing', title: `Order AVG-${n} is being prepared`,
  body: 'Our team is now preparing your pieces.', read_at: null, created_at: `2026-11-0${Math.min(n, 9)}T00:00:00Z`, ...extra });

function fakeDatabase(options = {}) {
  const tables = {
    profiles: [{ id: alice, role: 'customer', name: 'Alice', phone: '', created_at: '2026-01-01' },
      { id: bob, role: 'customer', name: 'Bob', phone: '', created_at: '2026-01-01' },
      { id: adminId, role: 'admin', name: 'Admin', phone: '', created_at: '2026-01-01' }],
    customer_notifications: structuredClone(options.rows ?? []),
  };
  const calls = [];
  return { tables, calls, from(table) {
    let action = 'read', payload, single = false, head = false, limit;
    const filters = [];
    const query = {
      select(_columns, opts) { head = Boolean(opts?.head); return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
      order() { return query; }, limit(n) { limit = n; return query; },
      update(value) { action = 'update'; payload = value; return query; },
      maybeSingle() { single = true; return run(); }, then(resolve, reject) { return run().then(resolve, reject); },
    };
    async function run() {
      calls.push({ table, action, filters: filters.length });
      if (options.missingTable && table === 'customer_notifications') return { data: null, error: { code: 'PGRST205' } };
      let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (action === 'update') rows.forEach((row) => Object.assign(row, payload));
      if (table === 'customer_notifications' && action === 'read') rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (limit) rows = rows.slice(0, limit);
      if (head) return { data: null, count: rows.length, error: null };
      const values = rows.map((row) => ({ ...row }));
      return { data: single ? values[0] ?? null : values, error: null };
    }
    return query;
  } };
}

async function api(run, options = {}) {
  const db = fakeDatabase(options);
  const sessions = createCookieSessions({ origin, createAuthClient: () => ({ auth: {} }), loadUser: async () => ({ id: alice, role: 'customer', verified: true }) });
  const app = express(); app.use(express.json());
  app.use('/api/auth', createAuthRouter(sessions));
  app.use('/api/me', createMeRouter({ client: db, cookieSessions: sessions, now: undefined, verifyAccessToken: async (token) => {
    const users = { alice, bob, admin: adminId };
    if (!users[token]) throw unauthorized();
    return { id: users[token], email: `${token}@example.test`, email_confirmed_at: '2026-01-01' };
  } }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const csrf = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = await csrf.json();
  const cookie = csrf.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  async function send(path, { as = 'alice', method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${base}/api/me/notifications${path}`, { method, headers: { Authorization: `Bearer ${as}`, Origin: origin, Cookie: cookie,
      'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  try { await run({ send, db }); } finally { await new Promise((resolve) => server.close(resolve)); }
}

const rows = [note(1, alice), note(2, alice, { read_at: '2026-11-03T00:00:00Z' }), note(3, alice), note(4, bob)];

test('the list returns only the signed-in customer\'s latest notifications and unread count', async () => {
  await api(async ({ send }) => {
    const result = await send('');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.items.map((n) => n.orderId), ['AVG-3', 'AVG-2', 'AVG-1']);
    assert.equal(result.body.unreadCount, 2);
    assert.deepEqual(Object.keys(result.body.items[0]).sort(), ['body', 'createdAt', 'id', 'orderId', 'read', 'readAt', 'title', 'type']);
    assert.ok(!JSON.stringify(result.body).includes(bob), 'no user ids are returned');
    const other = await send('', { as: 'bob' });
    assert.deepEqual(other.body.items.map((n) => n.orderId), ['AVG-4']);
    assert.equal(other.body.unreadCount, 1);
  }, { rows });
  // At most 20 are returned; the count still covers every unread one.
  const many = Array.from({ length: 25 }, (_, i) => note(i + 1, alice, { created_at: `2026-11-01T00:${String(i).padStart(2, '0')}:00Z` }));
  await api(async ({ send }) => {
    const result = await send('');
    assert.equal(result.body.items.length, 20);
    assert.equal(result.body.unreadCount, 25);
  }, { rows: many });
});

test('notifications require a signed-in verified customer; writes require CSRF and Origin', async () => {
  await api(async ({ send, db }) => {
    assert.equal((await send('', { as: 'nobody' })).status, 401);
    assert.equal((await send('', { as: 'admin' })).status, 403);
    assert.equal((await send(`/${id(1)}/read`, { method: 'POST', body: {}, headers: { 'X-CSRF-Token': 'wrong' } })).status, 403);
    assert.equal((await send('/read-all', { method: 'POST', body: {}, headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await send('/read-all', { method: 'POST', body: {}, headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.ok(db.tables.customer_notifications.every((row) => row.read_at === null || row.id === id(2)));
  }, { rows });
});

test('mark one as read is scoped to the owner; another customer\'s notification looks like it does not exist', async () => {
  await api(async ({ send, db }) => {
    const result = await send(`/${id(1)}/read`, { method: 'POST', body: {} });
    assert.equal(result.status, 200);
    assert.equal(result.body.notification.read, true);
    assert.equal(result.body.unreadCount, 1);
    assert.ok(db.tables.customer_notifications[0].read_at);
    const again = await send(`/${id(1)}/read`, { method: 'POST', body: {} });
    assert.equal(again.status, 200, 'already read is fine');
    assert.equal(again.body.notification.readAt, db.tables.customer_notifications[0].read_at, 'read time is not overwritten');
    const stolen = await send(`/${id(4)}/read`, { method: 'POST', body: {} });
    assert.equal(stolen.status, 404);
    assert.equal(db.tables.customer_notifications[3].read_at, null, "Bob's notification is untouched");
    assert.equal((await send(`/${id(99)}/read`, { method: 'POST', body: {} })).status, 404);
    assert.equal((await send('/not-a-uuid/read', { method: 'POST', body: {} })).status, 400);
    assert.equal((await send(`/${id(3)}/read`, { method: 'POST', body: { extra: true } })).status, 400);
  }, { rows });
});

test('mark all as read only affects the signed-in customer', async () => {
  await api(async ({ send, db }) => {
    const result = await send('/read-all', { method: 'POST', body: {} });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { updated: 2, unreadCount: 0 });
    assert.ok(db.tables.customer_notifications.filter((row) => row.user_id === alice).every((row) => row.read_at));
    assert.equal(db.tables.customer_notifications.find((row) => row.user_id === bob).read_at, null);
    assert.equal(db.tables.customer_notifications[1].read_at, '2026-11-03T00:00:00Z', 'earlier read time kept');
    assert.equal((await send('')).body.unreadCount, 0);
    assert.equal((await send('', { as: 'bob' })).body.unreadCount, 1);
  }, { rows });
});

test('before the migration runs, the bell gets an empty list instead of an error', async () => {
  await api(async ({ send }) => {
    const result = await send('');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { items: [], unreadCount: 0, available: false });
  }, { missingTable: true });
});

test('notification content covers each status with carrier, tracking and reason', () => {
  const order = { id: 'o1', reference: 'AVG-2026-0009' };
  assert.deepEqual(notificationContent(order, 'Pending').type, 'placed');
  assert.equal(notificationContent(order, 'Processing').title, 'Order AVG-2026-0009 is being prepared');
  const shipped = notificationContent({ ...order, tracking: { carrier: 'LBC', number: 'LBC123' } }, 'Shipped');
  assert.equal(shipped.title, 'Order AVG-2026-0009 has shipped');
  assert.equal(shipped.body, 'On its way with LBC. Tracking number: LBC123.');
  assert.equal(notificationContent(order, 'Shipped').body, 'Your order is on its way.');
  assert.equal(notificationContent(order, 'Delivered').type, 'delivered');
  assert.equal(notificationContent({ ...order, cancellationReason: 'Out of stock' }, 'Cancelled').body, 'Reason: Out of stock');
  assert.equal(notificationContent({ id: 'internal-id' }, 'Cancelled').title, 'Order internal-id was cancelled');
  assert.equal(notificationContent(order, 'Unknown'), null);
});
