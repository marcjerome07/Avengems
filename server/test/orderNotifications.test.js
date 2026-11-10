import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createAdminRouter } from '../src/routes/admin.js';
import { createOrdersRouter } from '../src/routes/checkout.js';
import { createCookieSessions } from '../src/sessions.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { errorHandler } from '../src/errors.js';
import { unauthorized } from '../src/auth.js';
import { createMailer, maskEmail, redactEmails } from '../src/mailer.js';
import { createOrderNotifications, MAX_ATTEMPTS } from '../src/orderNotifications.js';
import { customerOrderEmail, escapeHtml, storeOrderAlert, trackingUrl } from '../src/orderEmails.js';
import { toOrder } from '../src/checkout.js';
import { startupConfig } from '../src/config.js';

const admin = '11111111-1111-4111-8111-111111111111';
const customer = '22222222-2222-4222-8222-222222222222';
const origin = 'http://localhost:5173';
const item = { id: 1, product_id: 'p-01', product_name: 'Power Stone Ring', product_slug: 'power-ring', type: 'Ring', material: '925 Sterling Silver',
  stone: 'power', color: 'Purple', size: 'US 7', base_price: '649', customization_fee: '150', unit_price: '799', customized: true, quantity: 2 };
const baseOrder = { id: 'AVG-2026-10412', user_id: customer, status: 'Pending', created_at: '2026-11-01T00:00:00Z', payment_method: 'cod',
  // Contact email typed at checkout. Customer emails must go to the login email instead.
  customer_name: 'Maria Santos', customer_email: 'order-contact@example.test', customer_phone: '09171234567', ship_address: '12 Mabini St',
  ship_city: 'Makati', ship_province: 'Metro Manila', ship_postal_code: '1200', subtotal: '1298', customization_total: '300', shipping_fee: '0',
  total: '1598', checkout_key: '6f1c2a5e-8a1b-4c2d-9e3f-0a1b2c3d4e5f', checkout_request: { paymentMethod: 'cod' }, items: [item] };

function fakeDatabase(options = {}) {
  const tables = {
    profiles: [{ id: admin, role: 'admin', name: 'Admin', phone: '' }, { id: customer, role: 'customer', name: 'Customer', phone: '' }],
    orders: [structuredClone({ ...baseOrder, ...options.order })],
    store_settings: [{ id: 1, store_name: 'AVENGEMS', contact_email: 'avengems2026@gmail.com', shipping_fee: '120', free_shipping_threshold: '2000' }],
    order_notifications: structuredClone(options.notifications ?? []),
    customer_notifications: [],
  };
  let nextId = 100;
  const calls = [];
  const authUser = options.authUser ?? { email: 'Maria@Example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };
  const db = { tables, calls, auth: { admin: { async getUserById(id) {
    calls.push({ auth: 'getUserById', id });
    if (options.authError) return { data: { user: null }, error: options.authError };
    return id === customer ? { data: { user: { id, ...authUser } }, error: null } : { data: { user: null }, error: { status: 404 } };
  } } }, from(table) {
    let action = 'read', payload, single = false, conflict;
    const filters = [];
    const query = {
      select() { return query; }, order() { return query; }, limit() { return query; }, range() { return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
      lt(key, value) { filters.push((row) => row[key] < value); return query; },
      update(value) { action = 'update'; payload = value; return query; },
      upsert(value, opts) { action = 'upsert'; payload = value; conflict = opts; return query; },
      maybeSingle() { single = true; return run(); }, then(resolve, reject) { return run().then(resolve, reject); },
    };
    async function run() {
      calls.push({ table, action, payload });
      if (options.missingTable === table) return { error: { code: '42P01', message: 'relation does not exist' } };
      if (options.failColumns && action === 'update' && table === 'orders' && 'cancellation_reason' in payload) return { error: { code: '42703' } };
      if (options.failSentUpdate && action === 'update' && table === 'order_notifications' && 'sent_at' in payload) return { error: { code: '08006' } };
      let rows;
      if (action === 'upsert') {
        // Each table's unique key, matching the migrations.
        const keys = { order_notifications: 'order_id,status,recipient,kind', customer_notifications: 'order_id,type' }[table];
        assert.deepEqual(conflict, { onConflict: keys, ignoreDuplicates: true });
        const exists = tables[table].some((row) => keys.split(',').every((key) => row[key] === payload[key]));
        if (exists) return { data: [] };
        const row = table === 'customer_notifications'
          ? { id: `cn-${nextId++}`, read_at: null, created_at: '2026-11-07T00:00:00Z', ...payload }
          : { id: nextId++, sent_at: null, error: null, channel: null, created_at: '2026-11-07T00:00:00Z', updated_at: '2026-11-07T00:00:00Z', ...payload };
        tables[table].push(row);
        return { data: [{ ...row }] };
      }
      if (action === 'update') options.beforeUpdate?.(table, tables);
      rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (action === 'update') rows.forEach((row) => Object.assign(row, structuredClone(payload)));
      const values = rows.map((row) => structuredClone(row));
      return { data: single ? values[0] ?? null : values };
    }
    return query;
  }, async rpc(name, args) {
    calls.push({ rpc: name, args });
    const row = tables.orders[0];
    if (name === 'customer_cancellation_version') return { data: 1 };
    if (name === 'customer_checkout') return { data: structuredClone(row) };
    if (name === 'admin_cancel_order' || name === 'customer_cancel_order') {
      if (!['Pending', 'Processing', 'Cancelled'].includes(row.status)) return { error: { code: 'P2003' } };
      row.status = 'Cancelled';
      return { data: structuredClone(row) };
    }
    return { error: { code: 'PGRST202' } };
  } };
  return db;
}

function fakeMailer(behaviour = () => {}) {
  const sent = [];
  return { sent, enabled: true, async send(message) { await behaviour(message, sent.length); sent.push(message); return { channel: 'smtp' }; } };
}
const silent = { log() {}, warn() {}, error() {} };
const makeNotifications = (db, mailer, extra = {}) => createOrderNotifications({ client: db, mailer, origin, storeEmail: 'Store@Example.test',
  logger: silent, retryDelays: [0, 0, 0], now: extra.now ?? (() => new Date('2026-11-07T00:10:00Z')), ...extra });

async function api(run, options = {}) {
  const db = fakeDatabase(options);
  const mailer = options.mailer ?? fakeMailer();
  const notifications = makeNotifications(db, mailer, options.notificationOptions);
  const sessions = createCookieSessions({ origin, createAuthClient: () => ({ auth: {} }), loadUser: async () => ({ id: admin, role: 'admin', name: 'Admin', verified: true }) });
  const app = express(); app.use(express.json());
  app.use('/api/auth', createAuthRouter(sessions));
  app.use('/api/admin', createAdminRouter({ client: db, cookieSessions: sessions, notifications, verifyAccessToken: async (token) => {
    if (!['admin', 'customer'].includes(token)) throw unauthorized();
    return { id: token === 'customer' ? customer : admin, email: 'account@example.test', email_confirmed_at: '2026-01-01', user_metadata: { role: 'admin' } };
  } }));
  // /api/me normally verifies the customer, CSRF and Origin before this router.
  app.use('/api/me/orders', (req, res, next) => { req.auth = { userId: customer }; next(); },
    createOrdersRouter(db, { customerCancellationEnabled: true, notifications }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const csrf = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = await csrf.json();
  const cookie = csrf.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  async function send(path, method = 'GET', data, headers = {}) {
    const response = await fetch(base + path, { method, headers: { Authorization: 'Bearer admin', Origin: origin, Cookie: cookie,
      'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, body: await response.json() };
  }
  const status = (to, from, extra = {}) => send(`/api/admin/orders/${baseOrder.id}/status`, 'PATCH', { status: to, expectedStatus: from, ...extra });
  try { await run({ send, status, db, mailer, notifications }); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('each admin status transition sends exactly one customer email, after the update succeeds', async () => {
  await api(async ({ status, db, mailer, notifications }) => {
    assert.equal((await status('Processing', 'Pending')).status, 200);
    await notifications.idle();
    assert.equal((await status('Shipped', 'Processing', { trackingNumber: 'JT0012345678', trackingCarrier: 'J&T Express' })).status, 200);
    await notifications.idle();
    assert.equal((await status('Delivered', 'Shipped')).status, 200);
    await notifications.idle();
    assert.deepEqual(mailer.sent.map((m) => m.subject), [
      'Your order AVG-2026-10412 is being prepared', 'Your order AVG-2026-10412 is on its way', 'Your order AVG-2026-10412 has been delivered']);
    assert.ok(mailer.sent.every((m) => m.to === 'maria@example.test' && m.replyTo === 'avengems2026@gmail.com'));
    const shipped = mailer.sent[1];
    assert.match(shipped.html, /JT0012345678/);
    assert.ok(shipped.html.includes(escapeHtml(trackingUrl('J&T Express', 'JT0012345678'))));
    assert.match(shipped.text, /Track your package: https:\/\//);
    assert.equal(db.tables.orders[0].tracking_carrier, 'J&T Express');
    assert.deepEqual(db.tables.order_notifications.map((n) => [n.status, n.attempts, Boolean(n.sent_at), n.channel]),
      [['Processing', 1, true, 'smtp'], ['Shipped', 1, true, 'smtp'], ['Delivered', 1, true, 'smtp']]);
  });
});

test('no email without a real change: same status, stale status and invalid tracking are all silent', async () => {
  await api(async ({ status, db, mailer, notifications }) => {
    assert.equal((await status('Pending', 'Pending')).status, 200);
    assert.equal((await status('Shipped', 'Processing')).status, 409, 'stale expectedStatus');
    assert.equal((await status('Processing', 'Pending', { trackingNumber: 'JT0012345678', trackingCarrier: 'LBC' })).status, 400);
    assert.equal((await status('Shipped', 'Pending', { trackingNumber: 'x', trackingCarrier: 'LBC' })).status, 400);
    assert.equal((await status('Shipped', 'Pending', { trackingNumber: 'JT0012345678', trackingCarrier: 'DHL' })).status, 400);
    await notifications.idle();
    assert.equal(mailer.sent.length, 0);
    assert.equal(db.tables.order_notifications.length, 0);
    assert.equal(db.tables.orders[0].status, 'Pending');
  });
});

test('new orders email the customer and alert the store once, even when checkout is replayed', async () => {
  await api(async ({ send, db, mailer, notifications }) => {
    const checkout = { paymentMethod: 'cod', items: [{ productId: 'p-01', quantity: 1 }],
      customer: { name: 'Maria Santos', email: 'maria@example.test', phone: '09171234567' },
      shipping: { addressId: '33333333-3333-4333-8333-333333333333' } };
    for (let i = 0; i < 2; i++) { // the second request is an idempotent replay of the same order
      const result = await send('/api/me/orders', 'POST', checkout, { 'Idempotency-Key': baseOrder.checkout_key });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      await notifications.idle();
    }
    assert.equal(db.calls.filter((call) => call.rpc === 'customer_checkout').length, 2);
    assert.deepEqual(mailer.sent.map((m) => m.to).sort(), ['maria@example.test', 'store@example.test']);
    const alert = mailer.sent.find((m) => m.to === 'store@example.test');
    assert.equal(alert.subject, 'New order AVG-2026-10412 · ₱1,598.00');
    assert.equal(db.tables.order_notifications.length, 2);
  });
});

test('duplicate and concurrent status-changed calls send a single email', async () => {
  await api(async ({ db, mailer, notifications }) => {
    db.tables.orders[0].status = 'Processing';
    await Promise.all([notifications.statusChanged(db.tables.orders[0], 'Pending'), notifications.statusChanged(db.tables.orders[0], 'Pending')]);
    notifications.statusChanged(db.tables.orders[0], 'Pending');
    notifications.statusChanged(db.tables.orders[0], 'Processing'); // not a change
    await notifications.idle();
    assert.equal(mailer.sent.length, 1);
  });
});

test('a failing mailer never blocks the status update; errors and attempts are recorded', async () => {
  const mailer = fakeMailer(() => { throw Object.assign(new Error('Invalid login: 535 Username and Password not accepted'), { code: 'EAUTH', responseCode: 535 }); });
  await api(async ({ status, db, notifications }) => {
    const result = await status('Processing', 'Pending');
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'Processing');
    assert.equal(db.tables.orders[0].status, 'Processing');
    await notifications.idle();
    const [row] = db.tables.order_notifications;
    assert.equal(row.attempts, MAX_ATTEMPTS);
    assert.equal(row.sent_at, null);
    assert.match(row.error, /^EAUTH 535: Invalid login/);
  }, { mailer });
  // Transient failures: succeeds on the third attempt.
  const flaky = fakeMailer((_, count) => { if (flaky.tries++ < 2) throw new Error('ETIMEDOUT'); return count; });
  flaky.tries = 0;
  await api(async ({ status, db, notifications }) => {
    await status('Processing', 'Pending'); await notifications.idle();
    const [row] = db.tables.order_notifications;
    assert.equal(row.attempts, 3); assert.ok(row.sent_at); assert.equal(row.error, null);
    assert.equal(flaky.sent.length, 1);
  }, { mailer: flaky });
  // Missing migration: still saved, nothing thrown.
  await api(async ({ status, db, mailer, notifications }) => {
    assert.equal((await status('Processing', 'Pending')).status, 200);
    await notifications.idle();
    assert.equal(db.tables.orders[0].status, 'Processing');
    assert.equal(mailer.sent.length, 0);
  }, { missingTable: 'order_notifications' });
});

test('startup sweep retries unsent rows and skips sent or exhausted ones', async () => {
  const rows = [
    { id: 1, order_id: baseOrder.id, status: 'Pending', recipient: 'maria@example.test', kind: 'customer', attempts: 1, sent_at: null, error: 'ETIMEDOUT' },
    { id: 2, order_id: baseOrder.id, status: 'Pending', recipient: 'store@example.test', kind: 'store', attempts: 0, sent_at: '2026-11-07T00:00:00Z' },
    { id: 3, order_id: baseOrder.id, status: 'Processing', recipient: 'maria@example.test', kind: 'customer', attempts: MAX_ATTEMPTS, sent_at: null, error: 'x' },
    // Attempted, no recorded outcome: may already be in the inbox, so never auto-resent.
    { id: 4, order_id: baseOrder.id, status: 'Shipped', recipient: 'maria@example.test', kind: 'customer', attempts: 1, sent_at: null, error: null },
    // Claimed but never attempted (crash right after claiming): safe to send.
    { id: 5, order_id: baseOrder.id, status: 'Delivered', recipient: 'maria@example.test', kind: 'customer', attempts: 0, sent_at: null, error: null },
  ];
  await api(async ({ db, mailer, notifications, send }) => {
    await notifications.sweep(); await notifications.idle();
    assert.deepEqual(mailer.sent.map((m) => m.subject), ["We've received your order AVG-2026-10412", 'Your order AVG-2026-10412 has been delivered']);
    assert.equal(db.tables.order_notifications[0].attempts, 2);
    assert.ok(db.tables.order_notifications[0].sent_at);
    assert.equal(db.tables.order_notifications[3].attempts, 1);
    const states = (await send(`/api/admin/orders/${baseOrder.id}/notifications`)).body.items.map((n) => n.state);
    assert.deepEqual(states, ['sent', 'sent', 'failed', 'unconfirmed', 'sent']);
  }, { notifications: rows });
});

test('notification history and resend are admin-only; resend is rate limited and records failures', async () => {
  const history = [{ id: 1, order_id: baseOrder.id, status: 'Processing', recipient: 'maria@example.test', kind: 'customer', attempts: MAX_ATTEMPTS,
    sent_at: null, error: 'EAUTH', updated_at: '2026-11-07T00:00:00Z' }];
  await api(async ({ send, mailer }) => {
    const path = `/api/admin/orders/${baseOrder.id}/notifications`;
    for (const headers of [{ Authorization: 'Bearer customer' }, { Authorization: 'Bearer forged' }]) {
      assert.ok([401, 403].includes((await send(path, 'GET', undefined, headers)).status));
      assert.ok([401, 403].includes((await send(`${path}/resend`, 'POST', {}, headers)).status));
    }
    assert.equal((await send(`${path}/resend`, 'POST', {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.equal(mailer.sent.length, 0);
    const listed = await send(path);
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.items.map((n) => [n.status, n.error, n.sentAt, n.state]), [['Processing', 'EAUTH', null, 'failed']]);
    const resent = await send(`${path}/resend`, 'POST', {});
    assert.equal(resent.status, 200, JSON.stringify(resent.body));
    assert.equal(resent.body.notification.attempts, MAX_ATTEMPTS + 1);
    assert.ok(resent.body.notification.sentAt);
    assert.equal(mailer.sent.length, 1);
    const again = await send(`${path}/resend`, 'POST', {});
    assert.equal(again.status, 429);
    assert.equal(mailer.sent.length, 1);
  }, { order: { status: 'Processing' }, notifications: history });
  await api(async ({ send }) => {
    const result = await send(`/api/admin/orders/${baseOrder.id}/notifications/resend`, 'POST', {});
    assert.equal(result.status, 502); assert.equal(result.body.code, 'EMAIL_SEND_FAILED');
  }, { mailer: fakeMailer(() => { throw new Error('ECONNECTION'); }) });
});

test('cancellation emails carry the admin reason or "Cancelled at your request"', async () => {
  await api(async ({ send, db, mailer, notifications }) => {
    const result = await send(`/api/admin/orders/${baseOrder.id}/cancel`, 'POST', { reason: '  Out of   stock <b>today</b> ' });
    assert.equal(result.status, 200);
    assert.equal(result.body.cancellationReason, 'Out of stock <b>today</b>');
    await notifications.idle();
    assert.equal(mailer.sent.length, 1);
    assert.match(mailer.sent[0].html, /Out of stock &lt;b&gt;today&lt;\/b&gt;/);
    assert.equal(db.tables.orders[0].cancellation_reason, 'Out of stock <b>today</b>');
    // Cancelling an already cancelled order is not a change.
    assert.equal((await send(`/api/admin/orders/${baseOrder.id}/cancel`, 'POST', {})).status, 200);
    await notifications.idle();
    assert.equal(mailer.sent.length, 1);
    assert.equal((await send(`/api/admin/orders/${baseOrder.id}/cancel`, 'POST', { reason: 'x'.repeat(501) })).status, 400);
  });
  await api(async ({ send, mailer, notifications }) => {
    const result = await send(`/api/me/orders/${baseOrder.id}/cancel`, 'POST', {});
    assert.equal(result.status, 200, JSON.stringify(result.body));
    await notifications.idle();
    assert.equal(mailer.sent.length, 1);
    assert.match(mailer.sent[0].html, /Cancelled at your request/);
    assert.match(mailer.sent[0].text, /Reason: Cancelled at your request/);
  });
  // If the reason column is missing, the cancellation and the email still happen.
  await api(async ({ send, mailer, notifications }) => {
    assert.equal((await send(`/api/admin/orders/${baseOrder.id}/cancel`, 'POST', { reason: 'Customer request' })).status, 200);
    await notifications.idle();
    assert.equal(mailer.sent.length, 1);
    assert.doesNotMatch(mailer.sent[0].html, /Customer request/);
  }, { failColumns: true });
});

test('templates escape every user-provided value and include order details', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const order = toOrder({ ...baseOrder, customer_name: `Ana ${evil}`, ship_address: `"Unit 5" & ${evil}`, status: 'Shipped',
    tracking_number: 'LBC 12345', tracking_carrier: 'LBC', items: [{ ...item, product_name: `Ring ${evil}`, size: '<US 7>' }] });
  const email = customerOrderEmail(order, 'Shipped', { storeName: 'AVENGEMS', contactEmail: 'avengems2026@gmail.com', origin });
  assert.ok(!email.html.includes('<img src=x'), 'no raw HTML injection');
  assert.ok(email.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(email.html.includes('&quot;Unit 5&quot; &amp;'));
  assert.ok(email.html.includes('Size &lt;US 7&gt;'));
  // LBC has no documented deep link: link the official page and show the number to enter.
  assert.equal(trackingUrl('LBC', 'LBC 12345'), 'https://www.lbcexpress.com/track/');
  assert.ok(email.html.includes('href="https://www.lbcexpress.com/track/"'));
  assert.ok(email.html.includes('Open the LBC tracking page'));
  assert.ok(email.text.includes('Enter tracking number LBC 12345 on the LBC page.'));
  assert.equal(trackingUrl('J&T Express', 'JT 0012'), 'https://jtexpress.ph/trajectoryQuery?waybillNo=JT%200012&flag=1');
  assert.equal(trackingUrl('Ninja Van', 'NV1'), 'https://www.ninjavan.co/en-ph/tracking');
  assert.equal(trackingUrl('Flash Express', 'FL1'), 'https://www.flashexpress.ph/');
  for (const piece of ['AVG-2026-10412', '₱1,598.00', '₱799.00', 'Customized · +₱150.00 each', 'Makati, Metro Manila 1200',
    `${origin}/account/orders/AVG-2026-10412`, 'avengems2026@gmail.com', 'AVENGEMS']) {
    assert.ok(email.html.includes(piece), piece);
    assert.ok(email.text.includes(piece.replace('Customized · +', 'customized +')) || email.text.includes(piece), `text: ${piece}`);
  }
  assert.match(email.html, /<meta name="viewport"/);
  assert.equal(trackingUrl('Other', 'ABC123'), null);
});

test('mailer sends as "AVENGEMS <SMTP_USER>" over SMTP, or logs to the console when disabled', async () => {
  const transports = [];
  const createTransport = (config) => { const t = { config, mails: [], async sendMail(m) { t.mails.push(m); } }; transports.push(t); return t; };
  const env = { MAIL_ENABLED: 'true', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'avengems2026@gmail.com', SMTP_PASS: 'fabricated-app-password', MAIL_FROM_NAME: 'AVENGEMS' };
  const mailer = createMailer({ env, createTransport, logger: silent });
  assert.equal(mailer.enabled, true);
  assert.equal(transports[0].config.secure, true);
  assert.deepEqual(await mailer.send({ to: 'a@example.test', subject: 'S', html: '<p>h</p>', text: 't', replyTo: 'store@example.test' }), { channel: 'smtp' });
  assert.deepEqual(transports[0].mails[0].from, { name: 'AVENGEMS', address: 'avengems2026@gmail.com' });
  assert.equal(transports[0].mails[0].replyTo, 'store@example.test');
  const logged = [];
  for (const disabled of [{ ...env, MAIL_ENABLED: 'false' }, { MAIL_ENABLED: 'false' }, {}]) {
    const consoleMailer = createMailer({ env: disabled, createTransport, logger: { log: (line) => logged.push(line), warn() {} }, production: false });
    assert.equal(consoleMailer.enabled, false);
    assert.deepEqual(await consoleMailer.send({ to: 'a@example.test', subject: 'Hello', text: 'Body', html: '' }), { channel: 'console' });
  }
  assert.equal(transports.length, 1, 'no transport is created when disabled');
  assert.ok(logged.every((line) => line.includes('Hello') && !line.includes('fabricated-app-password')));
});

test('MAIL_ENABLED=true with incomplete SMTP settings refuses to start, naming settings but never values', () => {
  const env = { MAIL_ENABLED: 'true', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'avengems2026@gmail.com', SMTP_PASS: 'fabricated-app-password' };
  for (const [patch, name] of [[{ SMTP_PASS: '' }, 'SMTP_PASS'], [{ SMTP_USER: ' ' }, 'SMTP_USER'], [{ SMTP_HOST: undefined }, 'SMTP_HOST'],
    [{ SMTP_PORT: '' }, 'SMTP_PORT'], [{ SMTP_PORT: 'smtp' }, 'SMTP_PORT (must be a port number)']]) {
    assert.throws(() => createMailer({ env: { ...env, ...patch }, createTransport: () => assert.fail('no transport') }), (error) => {
      assert.ok(error.message.includes(name), error.message);
      assert.ok(!error.message.includes('fabricated-app-password') && !error.message.includes('avengems2026'));
      return true;
    });
  }
  assert.doesNotThrow(() => createMailer({ env: { MAIL_ENABLED: 'false' } }));
});

test('production console mode logs only order number, status, kind and a masked recipient', async () => {
  assert.equal(maskEmail('alice@gmail.com'), 'a***@gmail.com');
  assert.equal(maskEmail('Bob.Smith@Example.PH'), 'B***@example.ph');
  assert.equal(maskEmail('not-an-email'), '***');
  assert.equal(redactEmails('550 5.1.1 <alice@gmail.com>: no such user (cc bob@x.com)'), '550 5.1.1 <a***@gmail.com>: no such user (cc b***@x.com)');
  const lines = [];
  const logger = { log: (line) => lines.push(line), warn: (line) => lines.push(line), error: (line) => lines.push(line) };
  const mailer = createMailer({ env: { MAIL_ENABLED: 'false' }, logger, production: true });
  await api(async ({ status, notifications }) => {
    await status('Processing', 'Pending'); await notifications.idle();
  }, { mailer, notificationOptions: { logger, production: true } });
  const mail = lines.filter((line) => line.startsWith('[mail:console]'));
  assert.deepEqual(mail, ['[mail:console] order=AVG-2026-10412 status=Processing kind=customer to=m***@example.test (MAIL_ENABLED is not true; not sent)']);
  for (const line of lines) {
    for (const secret of ['maria@example.test', 'Maria Santos', '12 Mabini', '09171234567', 'Power Stone Ring', 'order-contact']) assert.ok(!line.includes(secret), `${secret} leaked: ${line}`);
  }
  // Notification failure logs are masked in production too.
  const failing = fakeMailer(() => { throw new Error('550 <maria@example.test> mailbox unavailable'); });
  lines.length = 0;
  await api(async ({ status, notifications }) => {
    await status('Processing', 'Pending'); await notifications.idle();
  }, { mailer: failing, notificationOptions: { logger, production: true } });
  assert.ok(lines.length > 0 && lines.every((line) => !line.includes('maria@example.test')));
  assert.ok(lines.some((line) => line.includes('m***@example.test')));
});

test('customer emails go only to the verified login email, never to the typed order contact email', async () => {
  await api(async ({ status, db, mailer, notifications, send }) => {
    assert.equal(db.tables.orders[0].customer_email, 'order-contact@example.test');
    notifications.statusChanged(db.tables.orders[0], null);
    await status('Processing', 'Pending'); await notifications.idle();
    assert.deepEqual(mailer.sent.map((m) => m.to).sort(), ['maria@example.test', 'maria@example.test', 'store@example.test']);
    assert.ok(mailer.sent.every((m) => m.to !== 'order-contact@example.test'));
    const store = mailer.sent.find((m) => m.to === 'store@example.test');
    assert.match(store.text, /order-contact@example\.test/, 'store alert still shows the order contact email');
    assert.ok(db.calls.some((call) => call.auth === 'getUserById' && call.id === baseOrder.user_id));
    assert.equal((await send(`/api/admin/orders/${baseOrder.id}/notifications`)).body.items.every((n) => n.recipient !== 'order-contact@example.test'), true);
  });
  // Unverified login email: no customer email (store alert still goes out); resend refuses.
  await api(async ({ status, db, mailer, notifications, send }) => {
    notifications.statusChanged(db.tables.orders[0], null);
    await status('Processing', 'Pending'); await notifications.idle();
    assert.deepEqual(mailer.sent.map((m) => m.to), ['store@example.test']);
    assert.equal(db.tables.orders[0].status, 'Processing');
    const resend = await send(`/api/admin/orders/${baseOrder.id}/notifications/resend`, 'POST', {});
    assert.equal(resend.status, 409); assert.equal(resend.body.code, 'NO_VERIFIED_EMAIL');
  }, { authUser: { email: 'maria@example.test', email_confirmed_at: null } });
  // Auth unreachable: status still saved, nothing sent to any fallback address.
  await api(async ({ status, db, mailer, notifications, send }) => {
    assert.equal((await status('Processing', 'Pending')).status, 200); await notifications.idle();
    assert.equal(db.tables.orders[0].status, 'Processing');
    assert.equal(mailer.sent.length, 0);
    assert.equal((await send(`/api/admin/orders/${baseOrder.id}/notifications/resend`, 'POST', {})).status, 503);
  }, { authError: { status: 500 } });
});

test('startup refuses production without APP_ORIGIN; development omits email links when unset', () => {
  assert.throws(() => startupConfig({ NODE_ENV: 'production' }), /APP_ORIGIN is required/);
  assert.throws(() => startupConfig({ NODE_ENV: 'production', APP_ORIGIN: '  ' }), /APP_ORIGIN is required/);
  assert.throws(() => startupConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://shop.example.com' }), /https/);
  assert.throws(() => startupConfig({ APP_ORIGIN: 'https://shop.example.com/' }), /exact origin/);
  assert.deepEqual(startupConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://shop.example.com' }),
    { production: true, appOrigin: 'https://shop.example.com', emailOrigin: 'https://shop.example.com' });
  assert.deepEqual(startupConfig({}), { production: false, appOrigin: 'http://localhost:5173', emailOrigin: null });
  const order = toOrder({ ...baseOrder, status: 'Processing' });
  const withoutLink = customerOrderEmail(order, 'Processing', { contactEmail: 'avengems2026@gmail.com', origin: null });
  assert.ok(!withoutLink.html.includes('View your order') && !withoutLink.text.includes('View your order'));
  assert.ok(!withoutLink.html.includes('undefined') && !withoutLink.text.includes('undefined'));
  const alert = storeOrderAlert(order, { contactEmail: 'avengems2026@gmail.com', origin: null });
  assert.ok(!alert.html.includes('Open admin orders') && !alert.text.includes('Admin:') && !alert.text.includes('undefined'));
  const withLink = customerOrderEmail(order, 'Processing', { contactEmail: 'avengems2026@gmail.com', origin: 'https://shop.example.com' });
  assert.ok(withLink.text.includes('View your order: https://shop.example.com/account/orders/AVG-2026-10412'));
});

test('customer email and store alert are recorded independently when they share an address', async () => {
  await api(async ({ db, mailer, notifications }) => {
    notifications.statusChanged(db.tables.orders[0], null);
    notifications.statusChanged(db.tables.orders[0], null);
    await notifications.idle();
    assert.equal(mailer.sent.length, 2);
    assert.deepEqual(mailer.sent.map((m) => m.subject).sort(), ['New order AVG-2026-10412 · ₱1,598.00', "We've received your order AVG-2026-10412"]);
    assert.deepEqual(db.tables.order_notifications.map((n) => [n.recipient, n.kind]),
      [['maria@example.test', 'customer'], ['maria@example.test', 'store']]);
  }, { notificationOptions: { storeEmail: 'maria@example.test' } });
});

test('an email that was sent but could not be recorded is never retried automatically', async () => {
  await api(async ({ status, db, mailer, notifications, send }) => {
    assert.equal((await status('Processing', 'Pending')).status, 200);
    await notifications.idle();
    assert.equal(mailer.sent.length, 1, 'no retry after a successful send');
    const [row] = db.tables.order_notifications;
    assert.deepEqual([row.attempts, row.sent_at, row.error], [1, null, null]);
    await notifications.sweep(); await notifications.idle();
    assert.equal(mailer.sent.length, 1, 'sweep leaves unconfirmed rows for an admin');
    assert.equal((await send(`/api/admin/orders/${baseOrder.id}/notifications`)).body.items[0].state, 'unconfirmed');
  }, { failSentUpdate: true });
});

test('two server processes sweeping the same row send it once', async () => {
  const rows = [{ id: 1, order_id: baseOrder.id, status: 'Processing', recipient: 'maria@example.test', kind: 'customer', attempts: 1, sent_at: null, error: 'ETIMEDOUT' }];
  const db = fakeDatabase({ order: { status: 'Processing' }, notifications: rows });
  const mailer = fakeMailer();
  const first = makeNotifications(db, mailer);
  const second = makeNotifications(db, mailer);
  await Promise.all([first.sweep(), second.sweep()]);
  await Promise.all([first.idle(), second.idle()]);
  assert.equal(mailer.sent.length, 1);
  assert.equal(db.tables.order_notifications[0].attempts, 2);
});

test('resend is refused while an automatic retry is pending, and never doubles a send', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const mailer = fakeMailer((_, count) => { if (count === 0 && !mailer.failed) { mailer.failed = true; throw new Error('ETIMEDOUT'); } });
  await api(async ({ status, send, db, notifications }) => {
    await status('Processing', 'Pending');
    await new Promise((resolve) => setImmediate(resolve));
    while (!db.tables.order_notifications[0]?.error) await new Promise((resolve) => setImmediate(resolve));
    const during = await send(`/api/admin/orders/${baseOrder.id}/notifications/resend`, 'POST', {});
    assert.equal(during.status, 409); assert.equal(during.body.code, 'EMAIL_IN_PROGRESS');
    release();
    await notifications.idle();
    assert.equal(mailer.sent.length, 1);
    assert.equal(db.tables.order_notifications[0].attempts, 2);
  }, { mailer, notificationOptions: { wait: () => gate } });
});

// ---- In-app customer notifications (created by the same statusChanged entry point) ----
const inApp = (db) => db.tables.customer_notifications.map((n) => [n.type, n.user_id, n.order_id]);

test('in-app: one notification per real status change, owned by the order owner', async () => {
  await api(async ({ status, db, notifications }) => {
    notifications.statusChanged(db.tables.orders[0], null); await notifications.idle();
    await status('Processing', 'Pending'); await notifications.idle();
    await status('Shipped', 'Processing', { trackingNumber: 'JT0012345678', trackingCarrier: 'J&T Express' }); await notifications.idle();
    await status('Delivered', 'Shipped'); await notifications.idle();
    assert.deepEqual(inApp(db), [['placed', customer, baseOrder.id], ['processing', customer, baseOrder.id],
      ['shipped', customer, baseOrder.id], ['delivered', customer, baseOrder.id]]);
    const shipped = db.tables.customer_notifications[2];
    assert.equal(shipped.title, 'Order AVG-2026-10412 has shipped');
    assert.equal(shipped.body, 'On its way with J&T Express. Tracking number: JT0012345678.');
  });
});

test('in-app: no notification without a change, and none duplicated by repeats or replays', async () => {
  await api(async ({ status, send, db, notifications }) => {
    assert.equal((await status('Pending', 'Pending')).status, 200);
    assert.equal((await status('Shipped', 'Processing')).status, 409);
    notifications.statusChanged(db.tables.orders[0], 'Pending'); // same status: not a change
    await notifications.idle();
    assert.equal(db.tables.customer_notifications.length, 0);
    const checkout = { paymentMethod: 'cod', items: [{ productId: 'p-01', quantity: 1 }],
      customer: { name: 'Maria Santos', email: 'maria@example.test', phone: '09171234567' },
      shipping: { addressId: '33333333-3333-4333-8333-333333333333' } };
    for (let i = 0; i < 2; i++) {
      assert.equal((await send('/api/me/orders', 'POST', checkout, { 'Idempotency-Key': baseOrder.checkout_key })).status, 200);
      await notifications.idle();
    }
    await Promise.all([notifications.statusChanged(db.tables.orders[0], null), notifications.statusChanged(db.tables.orders[0], null)]);
    assert.deepEqual(inApp(db), [['placed', customer, baseOrder.id]]);
  });
});

test('in-app: created even when email fails, the account is unverified or Auth is down', async () => {
  for (const options of [
    { mailer: fakeMailer(() => { throw new Error('EAUTH'); }) },
    { authUser: { email: 'maria@example.test', email_confirmed_at: null } },
    { authError: { status: 500 } },
  ]) {
    await api(async ({ status, db, mailer, notifications }) => {
      assert.equal((await status('Processing', 'Pending')).status, 200);
      await notifications.idle();
      assert.deepEqual(inApp(db), [['processing', customer, baseOrder.id]], JSON.stringify(Object.keys(options)));
      assert.equal(mailer.sent.length, 0);
    }, options);
  }
  // And the reverse: a missing notifications table never blocks the email.
  await api(async ({ status, mailer, notifications }) => {
    await status('Processing', 'Pending'); await notifications.idle();
    assert.equal(mailer.sent.length, 1);
  }, { missingTable: 'customer_notifications' });
});

test('in-app: cancellations carry the admin reason or "Cancelled at your request"', async () => {
  await api(async ({ send, db, notifications }) => {
    await send(`/api/admin/orders/${baseOrder.id}/cancel`, 'POST', { reason: 'Stone out of stock' }); await notifications.idle();
    assert.deepEqual(db.tables.customer_notifications.map((n) => [n.type, n.body]), [['cancelled', 'Reason: Stone out of stock']]);
  });
  await api(async ({ send, db, notifications }) => {
    await send(`/api/me/orders/${baseOrder.id}/cancel`, 'POST', {}); await notifications.idle();
    assert.deepEqual(db.tables.customer_notifications.map((n) => [n.type, n.body]), [['cancelled', 'Reason: Cancelled at your request']]);
  });
});
