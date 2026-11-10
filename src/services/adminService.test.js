import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const vite = await createServer({ configFile: false, plugins: [react()],
  ssr: { external: ['react', 'react-dom', 'react-router-dom', 'lucide-react', 'recharts'] },
  server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
after(() => vite.close());
const service = await vite.ssrLoadModule('/src/services/adminService.js');
const { authSession } = await vite.ssrLoadModule('/src/services/authSession.js');
const { default: AdminDataState } = await vite.ssrLoadModule('/src/components/admin/AdminDataState.jsx');
const { default: Orders } = await vite.ssrLoadModule('/src/pages/admin/Orders.jsx');
const { default: Products } = await vite.ssrLoadModule('/src/pages/admin/Products.jsx');
const { default: Settings } = await vite.ssrLoadModule('/src/pages/admin/Settings.jsx');
const { default: Dashboard } = await vite.ssrLoadModule('/src/pages/admin/Dashboard.jsx');
const { default: Analytics } = await vite.ssrLoadModule('/src/pages/admin/Analytics.jsx');
const { default: Customers, CustomerResults } = await vite.ssrLoadModule('/src/pages/admin/Customers.jsx');
const { default: Security } = await vite.ssrLoadModule('/src/pages/account/Security.jsx');
const { ToastContext } = await vite.ssrLoadModule('/src/context/useToast.js');
const user = { id: 'verified-admin', name: 'Administrator', email: 'admin@example.test', role: 'admin', verified: true };
const csrf = () => ({ url: '/api/auth/csrf', body: { csrfToken: 'fabricated-csrf' } });
function transport(t, responses) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const response = responses.shift(); assert.ok(response, `Unexpected ${url}`); assert.equal(url, response.url);
    assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store'); calls.push({ url, options });
    if (response.throw) throw new TypeError('offline');
    if (response.run) response.run();
    return Response.json(response.body, { status: response.status ?? 200 });
  });
  t.after(() => assert.equal(responses.length, 0)); return calls;
}
async function signIn(t) {
  transport(t, [{ url: '/api/me', body: user }]); await authSession.restore();
  assert.equal(authSession.getSnapshot().user.role, 'admin');
}

test('admin dashboard, analytics and customer services use private APIs and preserve genuine empty data', async (t) => {
  await signIn(t);
  const dashboard = { stats: { totalSales: 0, totalOrders: 0, totalProducts: 24, totalCustomers: 1 }, sales: [], status: [], recent: [], best: [] };
  const calls = transport(t, [{ url: '/api/admin/dashboard?months=6', body: dashboard },
    { url: '/api/admin/analytics', body: { byStone: [], byType: [], topProducts: [] } }, { url: '/api/admin/customers', body: { items: [] } }]);
  assert.deepEqual(await service.getDashboardData(), dashboard);
  assert.deepEqual((await service.getAnalytics()).topProducts, []);
  assert.deepEqual(await service.getCustomers(), []); assert.equal(calls.length, 3);
});

test('customer directory retains account and historical emails separately, null fields and lookup availability', async (t) => {
  await signIn(t);
  const directory = { items: [{ id: 'customer', name: 'Profile Name', email: 'account@example.test', city: 'Cebu',
    lastOrderEmail: 'historic@example.test', orderCount: 0, totalSpent: 0, lastOrderAt: null }], emailLookupAvailable: true };
  transport(t, [{ url: '/api/admin/customers', body: directory },
    { url: '/api/admin/customers', body: { items: [{ ...directory.items[0], email: null, city: null }], emailLookupAvailable: false } },
    { url: '/api/admin/customers', status: 403, body: { code: 'ADMIN_REQUIRED', message: 'Administrator required.' } }]);
  assert.deepEqual(await service.getCustomerDirectory(), directory);
  const partial = await service.getCustomerDirectory(); assert.equal(partial.items[0].email, null);
  assert.equal(partial.items[0].city, null); assert.equal(partial.emailLookupAvailable, false);
  await assert.rejects(service.getCustomerDirectory(), { code: 'ADMIN_REQUIRED', status: 403 });
});

const customerRows = [
  { id: 'no-orders', name: 'No Orders Customer', email: 'account@example.test', city: 'Cebu', lastOrderEmail: null, orderCount: 0, totalSpent: 0, lastOrderAt: null },
  { id: 'with-orders', name: 'Existing Buyer', email: null, city: null, lastOrderEmail: 'historic@example.test', orderCount: 2, totalSpent: 1500, lastOrderAt: '2026-11-01T00:00:00Z' },
];
const renderCustomers = (props = {}) => renderToString(h(MemoryRouter, null, h(CustomerResults, { customers: customerRows, ...props })));

test('customer table displays account email and city without orders, preserves order metrics and handles missing data', () => {
  const html = renderCustomers();
  assert.match(html, /Customer Email/); assert.match(html, /account@example.test/); assert.match(html, /Cebu/);
  assert.match(html, /No Orders Customer/); assert.match(html, /Existing Buyer/);
  assert.match(html, /data-label="Orders" class="num">0</); assert.match(html, /data-label="Orders" class="num">2</);
  assert.match(html, /data-label="Customer Email">—</); assert.match(html, /data-label="City">—</);
  assert.match(html, /data-label="Last Order">—</); assert.doesNotMatch(html, /historic@example.test|Last order email|>null</);
  assert.match(renderToString(h(MemoryRouter, null, h(Customers))), /confirmed account email and saved-address city/);
});

test('customer search matches profile name, available account email and saved city case-insensitively', () => {
  for (const query of ['no orders', 'ACCOUNT@EXAMPLE.TEST', ' cEbU ']) {
    const html = renderCustomers({ query }); assert.match(html, /No Orders Customer/); assert.doesNotMatch(html, /Existing Buyer/);
  }
  const buyer = renderCustomers({ query: 'existing' }); assert.match(buyer, /Existing Buyer/); assert.doesNotMatch(buyer, /No Orders Customer/);
  for (const query of ['unknown', 'null', 'historic@example.test']) assert.match(renderCustomers({ query }), /No customers found/);
});

test('customers expose loading, empty, retryable database errors and partial email lookup states without fake data', () => {
  const loading = renderCustomers({ loading: true }); assert.match(loading, /skeleton/); assert.doesNotMatch(loading, /No Orders Customer|No customers found/);
  assert.match(renderCustomers({ customers: [] }), /No customers found/);
  const failed = renderCustomers({ error: new Error('Safe database failure.') });
  assert.match(failed, /role="alert"/); assert.match(failed, /Retry loading data/); assert.doesNotMatch(failed, /No Orders Customer/);
  const partial = renderCustomers({ emailLookupAvailable: false });
  assert.match(partial, /Some customer emails are unavailable/); assert.match(partial, /Retry email lookup/); assert.match(partial, /No Orders Customer/);
});

test('admin order actions encode references, retain expected status and use CSRF for writes', async (t) => {
  await signIn(t);
  const order = { id: 'AVG-TEST', status: 'Processing', items: [] };
  const calls = transport(t, [{ url: '/api/admin/orders?status=Pending', body: { items: [order] } },
    { url: '/api/admin/orders/AVG%2FTEST', body: order }, csrf(), { url: '/api/admin/orders/AVG-TEST/status', body: order },
    csrf(), { url: '/api/admin/orders/AVG-TEST/cancel', body: { ...order, status: 'Cancelled' } }]);
  assert.deepEqual(await service.getAllOrders({ status: 'Pending' }), [order]);
  assert.deepEqual(await service.getAdminOrder('AVG/TEST'), order);
  await service.updateOrderStatus('AVG-TEST', 'Processing', 'Pending'); await service.cancelOrder('AVG-TEST');
  assert.deepEqual(JSON.parse(calls[3].options.body), { status: 'Processing', expectedStatus: 'Pending' });
  assert.equal(calls[3].options.headers['X-CSRF-Token'], 'fabricated-csrf');
});

test('product creation/edit/archive and settings send persistent API writes without mock fallback', async (t) => {
  await signIn(t);
  const calls = transport(t, [{ url: '/api/admin/products', body: { items: [] } },
    csrf(), { url: '/api/admin/products', body: { id: 'p-created' }, status: 201 },
    csrf(), { url: '/api/admin/products/p-created', body: { id: 'p-created', stock: 12 } },
    csrf(), { url: '/api/admin/products/p-created', body: { id: 'p-created', archived: true } },
    { url: '/api/admin/settings', body: { shippingFee: 120 } }, csrf(), { url: '/api/admin/settings', body: { shippingFee: 100 } }]);
  assert.deepEqual((await service.getAdminProducts()).items, []);
  assert.equal((await service.createProduct({ name: 'Ring' })).id, 'p-created');
  await service.updateProduct('p-created', { stock: 12, expectedStock: 10 }); await service.archiveProduct('p-created');
  await service.getSettings(); assert.equal((await service.saveSettings({ shippingFee: 100 })).shippingFee, 100);
  assert.deepEqual(JSON.parse(calls[4].options.body), { stock: 12, expectedStock: 10 });
  assert.equal(calls[6].options.method, 'DELETE'); assert.deepEqual(JSON.parse(calls[6].options.body), {});
});

test('product edit payload omits unchanged stock and includes expected stock only for intentional edits', () => {
  assert.deepEqual(service.productUpdatePayload({ stock: '10' }, { price: 120, stock: 10 }), { price: 120 });
  assert.deepEqual(service.productUpdatePayload({ stock: '10' }, { stock: 12 }), { stock: 12, expectedStock: 10 });
  assert.deepEqual(service.productUpdatePayload({ stock: 10 }, { archived: true }), { archived: true });
  const imageSources = [{ source: 'products/p-01/a.jpg', url: 'https://x/a.jpg' }, { source: 'products/p-01/b.jpg', url: 'https://x/b.jpg' }];
  assert.deepEqual(service.productUpdatePayload({ stock: 1, imageSources }, { images: ['products/p-01/a.jpg', 'products/p-01/b.jpg'] }), {});
  assert.deepEqual(service.productUpdatePayload({ stock: 1, imageSources }, { images: ['products/p-01/b.jpg', 'products/p-01/a.jpg'] }),
    { images: ['products/p-01/b.jpg', 'products/p-01/a.jpg'], expectedImages: ['products/p-01/a.jpg', 'products/p-01/b.jpg'] });
  assert.deepEqual(service.productUpdatePayload({ stock: 1, imageSources }, { images: ['products/p-01/b.jpg'] }),
    { images: ['products/p-01/b.jpg'], expectedImages: ['products/p-01/a.jpg', 'products/p-01/b.jpg'] });
});

test('authorization, inventory/status conflicts and migration failures remain explicit without pretend success', async (t) => {
  await signIn(t);
  for (const [code, status, run, path] of [
    ['ADMIN_REQUIRED', 403, () => service.getSettings(), '/api/admin/settings'],
    ['INVENTORY_CONFLICT', 409, () => service.updateProduct('p-01', { stock: 20, expectedStock: 10 }), '/api/admin/products/p-01'],
    ['STATUS_CONFLICT', 409, () => service.updateOrderStatus('AVG', 'Shipped', 'Processing'), '/api/admin/orders/AVG/status'],
    ['CANCELLATION_MIGRATION_REQUIRED', 503, () => service.cancelOrder('AVG'), '/api/admin/orders/AVG/cancel'],
  ]) {
    transport(t, [...(code === 'ADMIN_REQUIRED' ? [] : [csrf()]), { url: path, status, body: { code, message: 'Safe failure.' } }]);
    await assert.rejects(run(), { code, status, message: 'Safe failure.' });
  }
});

test('uncertain admin writes are not replayed and session switches stop queued writes', async (t) => {
  await signIn(t);
  const calls = transport(t, [csrf(), { url: '/api/admin/settings', throw: true }]);
  await assert.rejects(service.saveSettings({ shippingFee: 100 }), { code: 'NETWORK_ERROR' }); assert.equal(calls.length, 2);
  const login = authSession.login;
  assert.equal(typeof login, 'function');
  const oldSnapshot = authSession.getSnapshot;
  t.mock.method(authSession, 'getSnapshot', () => ({ status: 'anonymous', user: null }));
  await assert.rejects(service.saveSettings({ shippingFee: 100 }), { code: 'UNAUTHORIZED' });
  t.mock.method(authSession, 'getSnapshot', oldSnapshot);
});

test('admin loading/error presentation and actual pages render without seeded mock records', () => {
  const render = (Page) => renderToString(h(MemoryRouter, null, h(ToastContext.Provider, { value: { showToast() {} } }, h(Page))));
  const error = renderToString(h(AdminDataState, { error: new Error('Safe loading failure.'), onRetry() {} }));
  assert.match(error, /role="alert"/); assert.match(error, /Retry loading data/);
  assert.match(render(Orders), /Orders/); assert.match(render(Products), /Products/); assert.match(render(Settings), /Settings/);
  assert.match(render(Dashboard), /No real payments are collected/); assert.match(render(Analytics), /not collected payments/);
  assert.doesNotMatch(render(Orders), /AVG-2026-10/);
  assert.match(render(Security), /Change password securely/);
});

test('production services no longer import browser database fixtures or advertise fake password success', async () => {
  for (const path of ['adminService.js', 'productService.js', 'authService.js', 'commerceService.js', 'sessionService.js', 'customerService.js', 'orderService.js', 'wishlistService.js', 'teamService.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8'); assert.doesNotMatch(source, /from ['"]\.\/mockDb['"]/);
  }
  const auth = await vite.ssrLoadModule('/src/services/authService.js');
  await assert.rejects(auth.changePassword(), { code: 'PASSWORD_CHANGE_UNAVAILABLE' });
});
