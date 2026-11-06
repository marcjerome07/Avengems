import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createAdminRouter } from '../src/routes/admin.js';
import { createCollectionsRouter } from '../src/routes/collections.js';
import { createCookieSessions } from '../src/sessions.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { errorHandler } from '../src/errors.js';
import { unauthorized } from '../src/auth.js';
import { productPatch, settingsPatch, reports, customerEmails } from '../src/admin.js';

const admin = '11111111-1111-4111-8111-111111111111';
const customer = '22222222-2222-4222-8222-222222222222';
const profile = { id: admin, role: 'admin', name: 'Administrator', phone: '', created_at: '2026-01-01' };
const collection = { id: 'col-power', stone: 'power', color: 'Purple', gemstone: 'Amethyst', slug: 'power', stone_name: 'Power Stone' };
const product = { id: 'p-01', slug: 'test-ring', name: 'Ring', type: 'Ring', stone: 'power', material: '925 Sterling Silver', price: '900.10', stock: 10,
  customizable_size: true, customizable_color: true, customization_fee: '150', sizes: ['US 5', 'US 6'], default_size: 'US 5',
  short_description: 'Test product', details: '', archived: false, is_featured: true, images: [], rating: '0', review_count: 0 };
const body = { name: 'New Ring', type: 'Ring', stone: 'power', material: '925 Sterling Silver', price: 1000, stock: 5,
  customizable: { size: true, color: true }, customizationFee: 150, sizes: ['US 5', 'US 6'], defaultSize: 'US 5', shortDescription: 'New product' };
const order = { id: 'AVG-TEST', user_id: customer, status: 'Pending', created_at: '2026-11-01T00:00:00Z', payment_method: 'cod', total: '1800.20',
  subtotal: '1800.20', customization_total: '0', shipping_fee: '0', customer_name: 'Customer', customer_email: 'customer@example.test', customer_phone: '09171234567',
  ship_address: 'Test street', ship_city: 'Manila', ship_province: 'Metro Manila', ship_postal_code: '1000',
  items: [{ id: 1, product_id: 'p-01', product_name: 'Historical Ring', product_slug: 'old-ring', type: 'Ring', material: 'Silver', stone: 'power', color: 'Purple', size: 'US 5', base_price: '900.10', customization_fee: '0', unit_price: '900.10', quantity: 2, customized: false }] };

function fakeDatabase(options = {}) {
  const tables = { profiles: [structuredClone(profile), { ...profile, id: customer, role: 'customer', name: 'Customer' }],
    collections: [structuredClone(collection)], products: [structuredClone(product)], orders: options.orders ?? [], addresses: options.addresses ?? [],
    store_settings: [{ id: 1, store_name: 'AVENGEMS', contact_email: 'store@example.test', shipping_fee: '120', free_shipping_threshold: '2000' }] };
  const calls = [];
  const db = { tables, calls, auth: { admin: { async listUsers({ page, perPage }) {
    calls.push({ auth: 'listUsers', page, perPage });
    if (options.authThrows) throw new Error('private Auth credentials');
    if (options.authError) return { error: { message: 'private Auth credentials' } };
    return { data: { users: (options.authUsers ?? []).slice((page - 1) * perPage, page * perPage) }, error: null };
  } } }, from(table) {
    let action = 'read', payload, bounds, single = false;
    const filters = [];
    const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
      order() { return query; }, range(start, end) { bounds = [start, end]; return query; },
      insert(value) { action = 'insert'; payload = value; return query; }, update(value) { action = 'update'; payload = value; return query; },
      maybeSingle() { single = true; return run(); }, then(resolve, reject) { return run().then(resolve, reject); } };
    async function run() {
      calls.push({ table, action, filters, payload });
      if (options.failTable === table) {
        if (options.throws) throw new Error('private database detail and credentials');
        return { error: { code: options.dbCode ?? 'private', message: 'private database detail and credentials' } };
      }
      if (action === 'update') options.beforeUpdate?.(table, tables);
      if (action === 'insert') tables[table].push({ ...structuredClone(payload) });
      let rows = tables[table].filter((row) => filters.every(([key, value]) => row[key] === value));
      if (action === 'insert') rows = rows.filter((row) => row.id === payload.id);
      if (action === 'update') rows.forEach((row) => Object.assign(row, structuredClone(payload)));
      if (bounds) rows = rows.slice(bounds[0], bounds[1] + 1);
      const values = rows.map((row) => table === 'products' ? { ...row, collection: tables.collections.find((item) => item.stone === row.stone) } : { ...row });
      return { data: single ? values[0] ?? null : values };
    }
    return query;
  }, async rpc(name, args) {
    calls.push({ rpc: name, args });
    if (options.rpcThrows) throw new Error('private transaction detail');
    return options.rpcError ? { error: options.rpcError } : { data: { ...order, status: 'Cancelled' } };
  } };
  return db;
}
async function api(run, options = {}) {
  const db = fakeDatabase(options);
  const sessions = createCookieSessions({ origin: 'http://localhost:5173', createAuthClient: () => ({ auth: {
    signInWithPassword: async () => ({ data: { user: { id: admin }, session: { access_token: 'admin', refresh_token: 'fabricated-refresh', expires_at: Date.now() / 1000 + 3600 } } }),
  } }), loadUser: async () => ({ ...profile, verified: true }) });
  const app = express(); app.use(express.json());
  app.use('/api/auth', createAuthRouter(sessions));
  app.use('/api/collections', createCollectionsRouter(db));
  app.use('/api/admin', createAdminRouter({ client: db, cookieSessions: sessions, now: () => new Date('2026-11-07T00:00:00Z'), verifyAccessToken: async (token) => {
    if (!['admin', 'customer', 'unconfirmed'].includes(token)) throw unauthorized();
    return { id: token === 'customer' ? customer : admin, email: 'account@example.test', email_confirmed_at: token === 'unconfirmed' ? null : '2026-01-01', user_metadata: { role: 'admin' } };
  } }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const csrf = await fetch(`${base}/api/auth/csrf`);
  let { csrfToken } = await csrf.json();
  let cookie = csrf.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  if (options.cookies) {
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: 'http://localhost:5173', Cookie: cookie, 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: 'fabricated-password' }) });
    assert.equal(login.status, 200); cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; '); csrfToken = (await login.json()).csrfToken;
  }
  async function send(path, method = 'GET', data, headers = {}) {
    const response = await fetch(base + path, { method, headers: { ...(options.cookies ? {} : { Authorization: 'Bearer admin' }), Origin: 'http://localhost:5173', Cookie: cookie,
      'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  try { await run({ send, db }); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('all admin modules require verified database admin role, ignoring forged metadata and IDs', async () => {
  await api(async ({ send, db }) => {
    for (const path of ['/orders', '/products', '/dashboard', '/analytics', '/customers', '/settings']) {
      for (const [token, status] of [['expired', 401], ['customer', 403], ['unconfirmed', 403]]) assert.equal((await send('/api/admin' + path + '?role=admin&userId=' + admin, 'GET', undefined, { Authorization: `Bearer ${token}` })).status, status);
    }
    assert.equal(db.calls.some((call) => call.table !== 'profiles'), false);
    db.tables.profiles[0].role = 'customer';
    assert.equal((await send('/api/admin/settings')).status, 403, 'A role cached at login cannot override demotion');
  });
});

test('cookie admin requests work; every write requires matching Origin/CSRF and JSON', async () => {
  await api(async ({ send, db }) => {
    assert.equal((await send('/api/admin/settings')).status, 200);
    const writes = [['/products', 'POST', body], ['/products/p-01', 'PATCH', { price: 1000 }], ['/products/p-01', 'DELETE', {}],
      ['/orders/AVG-TEST/status', 'PATCH', { status: 'Processing', expectedStatus: 'Pending' }], ['/orders/AVG-TEST/cancel', 'POST', {}], ['/settings', 'PATCH', { shippingFee: 100 }]];
    for (const [path, method, data] of writes) for (const headers of [{ Origin: '' }, { Origin: 'https://attacker.test' }, { 'X-CSRF-Token': '' }]) {
      assert.equal((await send('/api/admin' + path, method, data, headers)).status, 403);
    }
    assert.equal((await send('/api/admin/settings', 'PATCH', { shippingFee: 100 }, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal(db.calls.some((call) => ['update', 'insert'].includes(call.action) || call.rpc), false);
  }, { cookies: true });
});

test('order listing filters real records and details retain historical snapshots', async () => {
  await api(async ({ send }) => {
    assert.deepEqual((await send('/api/admin/orders?status=Delivered')).body.items, []);
    assert.equal((await send('/api/admin/orders')).body.items.length, 1);
    const detail = await send('/api/admin/orders/AVG-TEST');
    assert.equal(detail.body.items[0].name, 'Historical Ring'); assert.equal(detail.body.customer.email, 'customer@example.test');
    assert.equal(detail.body.user_id, undefined);
    assert.equal((await send('/api/admin/orders/missing')).status, 404);
    assert.equal((await send('/api/admin/orders?status=unknown')).status, 400);
  }, { orders: [structuredClone(order)] });
});

test('fulfillment only advances one step, handles same-status replay and rejects stale/cancelled transitions', async () => {
  await api(async ({ send, db }) => {
    assert.equal((await send('/api/admin/orders/AVG-TEST/status', 'PATCH', { status: 'Delivered', expectedStatus: 'Pending' })).status, 409);
    assert.equal((await send('/api/admin/orders/AVG-TEST/status', 'PATCH', { status: 'Processing', expectedStatus: 'Pending', userId: customer })).status, 400);
    for (const [from, to] of [['Pending', 'Processing'], ['Processing', 'Shipped'], ['Shipped', 'Delivered']]) {
      assert.equal((await send('/api/admin/orders/AVG-TEST/status', 'PATCH', { status: to, expectedStatus: from })).status, 200);
      assert.equal((await send('/api/admin/orders/AVG-TEST/status', 'PATCH', { status: to, expectedStatus: from })).status, 200);
    }
    assert.equal((await send('/api/admin/orders/AVG-TEST/status', 'PATCH', { status: 'Cancelled', expectedStatus: 'Delivered' })).status, 409);
    assert.equal(db.tables.orders[0].status, 'Delivered');
    assert.ok(db.calls.filter((call) => call.action === 'update').every((call) => call.filters.some(([key]) => key === 'status')));
  }, { orders: [structuredClone(order)] });
  await api(async ({ send }) => assert.equal((await send('/api/admin/orders/AVG-TEST/status', 'PATCH', { status: 'Processing', expectedStatus: 'Pending' })).status, 409),
    { orders: [structuredClone(order)], beforeUpdate: (table, rows) => { if (table === 'orders') rows.orders[0].status = 'Cancelled'; } });
});

test('cancellation calls only atomic RPC and reports deployment/errors without sequential restocking', async () => {
  for (const [rpcError, expected] of [[{ code: 'PGRST202' }, 503], [{ code: 'P2003' }, 409], [undefined, 200]]) await api(async ({ send, db }) => {
    const result = await send('/api/admin/orders/AVG-TEST/cancel', 'POST', {});
    assert.equal(result.status, expected);
    if (rpcError?.code === 'PGRST202') assert.equal(result.body.code, 'CANCELLATION_MIGRATION_REQUIRED');
    assert.deepEqual(db.calls.find((call) => call.rpc), { rpc: 'admin_cancel_order', args: { p_admin_id: admin, p_order_id: 'AVG-TEST' } });
    assert.equal(db.calls.some((call) => call.action === 'update'), false);
  }, { rpcError });
});

test('products create persistently, edit metadata without echoing stock, and archive without deletion', async () => {
  await api(async ({ send, db }) => {
    const created = await send('/api/admin/products', 'POST', body); assert.equal(created.status, 201);
    assert.match(created.body.id, /^p-[a-f0-9]{32}$/); assert.equal(created.body.color, 'Purple');
    assert.equal((await send('/api/admin/products')).body.items.length, 2);
    assert.equal((await send('/api/admin/products/p-01', 'PATCH', { price: '1000.25' })).status, 200);
    assert.equal(db.tables.products[0].stock, 10);
    assert.equal((await send('/api/admin/products/p-01', 'DELETE', {})).body.archived, true);
    assert.equal(db.tables.products.length, 2); assert.equal(db.tables.products[0].archived, true);
    assert.equal((await send('/api/admin/products/p-01', 'PATCH', { archived: false })).status, 200);
    assert.equal((await send('/api/admin/products/missing', 'PATCH', { price: 1 })).status, 404);
  });
});

test('inventory edits use atomic expected-stock comparison and cannot overwrite checkout changes', async () => {
  await api(async ({ send, db }) => {
    assert.equal((await send('/api/admin/products/p-01', 'PATCH', { stock: 15 })).status, 400);
    assert.equal((await send('/api/admin/products/p-01', 'PATCH', { stock: 15, expectedStock: 9 })).status, 409);
    assert.equal(db.tables.products[0].stock, 10);
    assert.equal((await send('/api/admin/products/p-01', 'PATCH', { stock: 15, expectedStock: 10 })).status, 200);
    assert.equal(db.tables.products[0].stock, 15);
  });
  await api(async ({ send, db }) => {
    const result = await send('/api/admin/products/p-01', 'PATCH', { price: 1, stock: 50, expectedStock: 10 });
    assert.equal(result.status, 409); assert.equal(db.tables.products[0].stock, 8); assert.equal(db.tables.products[0].price, '900.10');
  }, { beforeUpdate: (table, rows) => { if (table === 'products') rows.products[0].stock = 8; } });
});

test('product validation rejects unsupported fields/options, invalid money/stock, unsafe URLs and missing collections', async () => {
  for (const patch of [{ role: 'admin' }, { id: 'forged' }, { stock: -1, expectedStock: 10 }, { stock: 2147483648, expectedStock: 10 },
    { price: 'NaN' }, { price: 'Infinity' }, { customizationFee: '-Infinity' }, { price: 1.001 }, { price: null }, { images: ['javascript:alert(1)'] },
    { customizable: { size: true, color: false } }, { type: 'Unknown' }, { material: 'Unknown' }, { sizes: ['US 5'], defaultSize: 'US 6', customizable: { size: true, color: false } }]) assert.throws(() => productPatch(patch), { status: 400 });
  await api(async ({ send }) => {
    assert.equal((await send('/api/admin/products', 'POST', { ...body, stone: 'missing' })).status, 400);
    assert.equal((await send('/api/admin/products', 'POST', { ...body, userId: customer })).status, 400);
  });
});

test('persistent settings validate bounded finite money and never change protected columns', async () => {
  for (const value of ['NaN', 'Infinity', '-Infinity', -1, null, '', '1.001', '100000000', {}, true]) assert.throws(() => settingsPatch({ shippingFee: value }), { status: 400 });
  assert.throws(() => settingsPatch({ id: 2, shippingFee: 100 }), { status: 400 });
  await api(async ({ send, db }) => {
    const result = await send('/api/admin/settings', 'PATCH', { storeName: ' New Name ', contactEmail: ' STORE@EXAMPLE.TEST ', shippingFee: '0.10', freeShippingThreshold: 0 });
    assert.equal(result.status, 200); assert.equal(result.body.shippingFee, 0.1); assert.equal(result.body.contactEmail, 'store@example.test');
    assert.equal((await send('/api/admin/settings')).body.storeName, 'New Name');
    assert.equal(db.tables.store_settings[0].id, 1);
  });
});

test('empty dashboard/analytics/customers report genuine zero sales and no invented orders', async () => {
  await api(async ({ send }) => {
    const dashboard = (await send('/api/admin/dashboard')).body;
    assert.equal(dashboard.stats.totalSales, 0); assert.equal(dashboard.stats.totalOrders, 0); assert.equal(dashboard.stats.totalCustomers, 1);
    assert.ok(dashboard.sales.every((month) => month.sales === 0 && month.orders === 0));
    assert.deepEqual(dashboard.recent, []); assert.deepEqual(dashboard.best, []);
    assert.equal((await send('/api/admin/analytics')).body.topProducts.length, 0);
    const customers = (await send('/api/admin/customers')).body.items;
    assert.equal(customers.length, 1); assert.equal(customers[0].totalSpent, 0); assert.equal(customers[0].email, null);
    assert.equal((await send('/api/admin/dashboard?months=1000')).status, 400);
  });
});

test('customer account email and default-address city are available without orders and expose only allowlisted fields', async () => {
  const user = { id: customer, email: 'account@example.test', email_confirmed_at: '2026-01-01',
    user_metadata: { name: 'Untrusted name', email: 'invented@example.test' }, app_metadata: { private: 'private Auth detail' },
    encrypted_password: 'private password', identities: ['private identity'], access_token: 'private token' };
  await api(async ({ send, db }) => {
    const result = await send('/api/admin/customers');
    assert.equal(result.status, 200); assert.equal(result.body.emailLookupAvailable, true);
    assert.deepEqual(result.body.items, [{ id: customer, name: 'Customer', phone: '', email: user.email,
      city: 'Cebu', lastOrderEmail: null, orderCount: 0, totalSpent: 0, lastOrderAt: null }]);
    assert.doesNotMatch(JSON.stringify(result.body), /private|invented|metadata|identities|password|token/);
    assert.equal(db.calls.filter((call) => call.auth).length, 1);
    assert.equal(db.calls.some((call) => ['products', 'collections'].includes(call.table)), false, 'Customers do not depend on unrelated reports');
    assert.equal((await send('/api/admin/customers', 'GET', undefined, { Authorization: '' })).status, 401);
    assert.equal(db.calls.filter((call) => call.auth).length, 1, 'Anonymous requests cannot reach Auth admin lookup');
  }, { authUsers: [user], addresses: [
    { id: 'a', user_id: customer, city: 'Manila', is_default: false },
    { id: 'z', user_id: customer, city: 'Cebu', is_default: true },
    { id: '0', user_id: admin, city: 'Other account', is_default: true },
  ] });
});

test('customer order metrics remain historical while account email and saved city differ from last order', async () => {
  await api(async ({ send }) => {
    const { body } = await send('/api/admin/customers');
    const row = body.items[0];
    assert.equal(row.email, 'current@example.test'); assert.equal(row.city, 'Davao');
    assert.equal(row.lastOrderEmail, 'historic@example.test'); assert.equal(row.orderCount, 3);
    assert.equal(row.totalSpent, 1800.3); assert.equal(row.lastOrderAt, '2026-11-03T00:00:00Z');
  }, { authUsers: [{ id: customer, email: 'current@example.test', email_confirmed_at: '2026-01-01' }],
    addresses: [{ id: 'a', user_id: customer, city: 'Davao', is_default: true }],
    orders: [order, { ...order, id: 'AVG-SECOND', total: '0.10', created_at: '2026-11-02T00:00:00Z' },
      { ...order, id: 'AVG-CANCELLED', status: 'Cancelled', customer_email: 'historic@example.test', created_at: '2026-11-03T00:00:00Z' }] });
});

test('saved-address fallback is deterministic without defaults; missing addresses and unconfirmed/missing emails remain null', async () => {
  await api(async ({ send, db }) => {
    let result = await send('/api/admin/customers');
    assert.equal(result.body.items[0].city, 'First UUID'); assert.equal(result.body.items[0].email, null);
    db.tables.addresses.reverse();
    assert.equal((await send('/api/admin/customers')).body.items[0].city, 'First UUID');
    db.tables.addresses.length = 0;
    result = await send('/api/admin/customers');
    assert.equal(result.body.items[0].city, null);
    assert.equal(result.body.items[0].lastOrderEmail, order.customer_email, 'Do not relabel historical email as account email');
  }, { authUsers: [{ id: customer, email: 'unconfirmed@example.test', user_metadata: { email: 'invented@example.test' } }], orders: [order],
    addresses: [{ id: 'z', user_id: customer, city: 'Last UUID', is_default: false }, { id: 'a', user_id: customer, city: 'First UUID', is_default: false }] });
});

test('customer lookup paginates profiles, orders, addresses and Auth without per-customer requests', async () => {
  const authUsers = Array.from({ length: 200 }, (_, index) => ({ id: `other-${index}` }));
  authUsers.push({ id: customer, email: 'later@example.test', email_confirmed_at: '2026-01-01' });
  await api(async ({ send, db }) => {
    for (let index = 0; index < 105; index++) db.tables.profiles.push({ id: `extra-${index}`, role: 'customer', name: 'Extra' });
    const result = await send('/api/admin/customers');
    assert.equal(result.status, 200); assert.equal(result.body.items.length, 106);
    const row = result.body.items.find((value) => value.id === customer);
    assert.equal(row.email, 'later@example.test'); assert.equal(row.city, 'Default on later page'); assert.equal(row.orderCount, 105);
    assert.equal(db.calls.filter((call) => call.auth).length, 2);
    assert.equal(db.calls.filter((call) => call.table === 'addresses').length, 2);
    assert.equal(db.calls.filter((call) => call.table === 'orders').length, 2);
  }, { authUsers, orders: Array.from({ length: 105 }, (_, index) => ({ ...order, id: `AVG-${index}` })),
    addresses: Array.from({ length: 105 }, (_, index) => ({ id: String(index).padStart(3, '0'), user_id: customer,
      city: index === 104 ? 'Default on later page' : 'Other', is_default: index === 104 })) });
});

test('Auth admin outages/missing capability degrade explicitly without inventing emails; address errors fail safely', async () => {
  for (const options of [{ authError: true }, { authThrows: true }, {}]) await api(async ({ send, db }) => {
    if (!options.authError && !options.authThrows) delete db.auth;
    const result = await send('/api/admin/customers');
    assert.equal(result.status, 200); assert.equal(result.body.emailLookupAvailable, false);
    assert.equal(result.body.items[0].email, null); assert.equal(result.body.items[0].lastOrderEmail, order.customer_email);
    assert.doesNotMatch(JSON.stringify(result.body), /private Auth|credentials/);
  }, { ...options, orders: [order] });
  await api(async ({ send }) => {
    const result = await send('/api/admin/customers'); assert.equal(result.status, 503);
    assert.doesNotMatch(JSON.stringify(result.body), /private|credentials/);
  }, { failTable: 'addresses' });
});

test('Auth directory scan has a fixed page limit, preserves partial verified results and skips work for an empty directory', async () => {
  let calls = 0;
  const client = { auth: { admin: { async listUsers({ page, perPage }) {
    calls++; assert.equal(perPage, 200); assert.equal(page, calls);
    return { data: { users: Array.from({ length: 200 }, (_, index) => ({ id: index === 0 ? customer : `other-${index}`,
      email: 'found@example.test', email_confirmed_at: '2026-01-01' })) } };
  } } } };
  assert.equal((await customerEmails(client, [])).available, true); assert.equal(calls, 0);
  const result = await customerEmails(client, [customer, 'not-yet-found']);
  assert.equal(calls, 25); assert.equal(result.available, false); assert.equal(result.emails.get(customer), 'found@example.test');
});

test('reports use exact order snapshots, exclude cancelled value and group monthly reports in UTC', () => {
  const data = reports({ orders: [order, { ...order, id: 'CANCELLED', status: 'Cancelled', total: '99999' }], products: [product], profiles: [profile], collections: [collection] }, 2, new Date('2026-11-07T00:00:00Z'));
  assert.equal(data.stats.totalOrders, 2); assert.equal(data.stats.totalSales, 1800.2);
  assert.equal(data.sales[0].sales, 0); assert.equal(data.sales[1].sales, 1800.2);
  assert.equal(data.best[0].name, 'Historical Ring'); assert.equal(data.best[0].units, 2); assert.equal(data.analytics.byStone[0].revenue, 1800.2);
});

test('admin pagination includes records beyond the first batch and public collections preserve field mapping', async () => {
  const orders = Array.from({ length: 105 }, (_, index) => ({ ...order, id: `AVG-${index}` }));
  await api(async ({ send }) => {
    assert.equal((await send('/api/admin/orders')).body.items.length, 105);
    const collections = await send('/api/collections', 'GET', undefined, { Authorization: '' });
    assert.equal(collections.status, 200); assert.equal(collections.body.items[0].stoneName, 'Power Stone');
  }, { orders });
});

test('database/provider failures are safe and never expose raw details', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  for (const options of [{ failTable: 'products' }, { failTable: 'orders', throws: true }, { failTable: 'store_settings' }]) await api(async ({ send }) => {
    const path = options.failTable === 'products' ? 'products' : options.failTable === 'orders' ? 'orders' : 'settings';
    const result = await send('/api/admin/' + path); assert.equal(result.status, 503); assert.doesNotMatch(JSON.stringify(result.body), /private|credentials/);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }, options);
  assert.equal(log.mock.calls.length, 0);
});

test('cancellation migration source preserves service-only access and exactly-once transaction boundaries without executing SQL', () => {
  const sql = readFileSync(new URL('../db/proposed/admin-order-cancel.sql', import.meta.url), 'utf8').replace(/--[^\r\n]*/g, '').replace(/\s+/g, ' ');
  assert.match(sql, /security invoker set search_path = ''/i);
  assert.match(sql, /where id = p_admin_id and role = 'admin'/);
  assert.match(sql, /where id = p_admin_id and role = 'admin' for share/);
  assert.match(sql, /where id = p_order_id for update/);
  assert.match(sql, /if target.status <> 'Cancelled' then/);
  assert.match(sql, /target.status not in \('Pending','Processing'\)/);
  assert.match(sql, /target.checkout_key is null or jsonb_typeof\(target.checkout_request\) is distinct from 'object'/);
  assert.match(sql, /count\(\*\).*?not between 1 and 50/);
  assert.match(sql, /quantity is null or quantity not between 1 and 10 or product_id is null/);
  assert.match(sql, /line.quantity is null or line.quantity not between 1 and 500/);
  assert.ok(sql.indexOf("if target.status <> 'Cancelled'") < sql.indexOf('target.checkout_key is null'), 'Cancelled replay must not restock even a legacy order');
  assert.ok(sql.indexOf('target.checkout_key is null') < sql.indexOf('set stock = stock +'), 'Provenance rejection precedes restocking');
  assert.match(sql, /public.order_items where order_id = p_order_id order by id for update/);
  assert.match(sql, /order by id for update/); assert.match(sql, /stock <= 2147483647 - line.quantity/);
  assert.match(sql, /revoke all on function public.admin_cancel_order\(uuid,text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public.admin_cancel_order\(uuid,text\) to service_role/);
  assert.doesNotMatch(sql, /\b(?:delete|truncate|drop|alter table|create table|create policy|exception when)\b/i);
});
