import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const vite = await createServer({ configFile: false, plugins: [react()],
  ssr: { external: ['react', 'react-dom', 'react-router-dom', 'lucide-react'] },
  server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
after(() => vite.close());
const service = await vite.ssrLoadModule('/src/services/orderService.js');
const { authSession } = await vite.ssrLoadModule('/src/services/authSession.js');
const { default: CancelAction } = await vite.ssrLoadModule('/src/components/account/CancelOrderAction.jsx');
const { default: OrdersTable } = await vite.ssrLoadModule('/src/components/account/OrdersTable.jsx');
const { default: Reference } = await vite.ssrLoadModule('/src/components/account/OrderReference.jsx');
const { orderReference } = await vite.ssrLoadModule('/src/utils/orderReference.js');
const { Timeline } = await vite.ssrLoadModule('/src/pages/account/OrderDetails.jsx');
const user = { id: 'customer-a', name: 'Disposable', email: 'test@example.test', verified: true, role: 'customer' };
const order = { id: 'AVG-2026-06F1CDD160CA4E8385D7E82EB3DAC467', reference: 'AVG-2026-0001',
  status: 'Pending', canCancel: true, items: [], total: 100, createdAt: '2026-11-01' };
function transport(t, responses) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const response = responses.shift(); assert.ok(response, `Unexpected ${url}`); assert.equal(url, response.url);
    assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store'); calls.push({ url, options });
    if (response.throw) throw new TypeError('offline');
    return Response.json(response.body, { status: response.status ?? 200 });
  });
  t.after(() => assert.equal(responses.length, 0)); return calls;
}
async function login(t) {
  transport(t, [{ url: '/api/me', body: user }]); await authSession.restore();
}

test('customer cancellation uses internal ID, owner-guarded cookie/CSRF transport and no admin identity', async (t) => {
  await login(t);
  const calls = transport(t, [{ url: '/api/auth/csrf', body: { csrfToken: 'fabricated' } },
    { url: `/api/me/orders/${order.id}/cancel`, body: { ...order, status: 'Cancelled' } }]);
  assert.equal((await service.cancelCustomerOrder(order.id, user.id)).status, 'Cancelled');
  assert.equal(calls[1].options.method, 'POST'); assert.deepEqual(JSON.parse(calls[1].options.body), {});
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'fabricated');
  assert.ok(!calls.some((call) => call.url.includes('admin') || call.url.includes(order.reference + '/')));
});

test('customer cancellation fails visibly for disabled/conflict/network and malformed replies without blind replay', async (t) => {
  await login(t);
  for (const [status, code] of [[503, 'CUSTOMER_CANCELLATION_DISABLED'], [409, 'STATUS_CONFLICT']]) {
    transport(t, [{ url: '/api/auth/csrf', body: { csrfToken: 'fabricated' } },
      { url: `/api/me/orders/${order.id}/cancel`, status, body: { code, message: 'Safe error' } }]);
    await assert.rejects(service.cancelCustomerOrder(order.id, user.id), { code });
  }
  const calls = transport(t, [{ url: '/api/auth/csrf', body: { csrfToken: 'fabricated' } },
    { url: `/api/me/orders/${order.id}/cancel`, throw: true }]);
  await assert.rejects(service.cancelCustomerOrder(order.id, user.id), { code: 'NETWORK_ERROR' }); assert.equal(calls.length, 2);
  transport(t, [{ url: '/api/auth/csrf', body: { csrfToken: 'fabricated' } },
    { url: `/api/me/orders/${order.id}/cancel`, body: { ...order, status: 'Processing' } }]);
  await assert.rejects(service.cancelCustomerOrder(order.id, user.id), { code: 'SERVER_ERROR' });
  await assert.rejects(service.cancelCustomerOrder(order.id, 'other-owner'), { code: 'SESSION_CHANGED' });
});

test('customer cancellation action is enabled only for approved Pending/Processing orders', () => {
  const render = (value) => renderToString(h(MemoryRouter, null, h(CancelAction, { order: value, ownerId: user.id, onCancelled() {} })));
  for (const status of ['Pending', 'Processing']) {
    const html = render({ ...order, status }); assert.match(html, /Cancel Order/); assert.doesNotMatch(html, /disabled=""/);
    const disabled = render({ ...order, status, canCancel: false }); assert.match(disabled, /disabled=""/); assert.match(disabled, /unavailable/);
  }
  for (const status of ['Shipped', 'Delivered', 'Cancelled']) assert.equal(render({ ...order, status }), '');
});

test('short references display while order links retain internal IDs; legacy and missing values wrap safely', () => {
  const html = renderToString(h(MemoryRouter, null, h(OrdersTable, { orders: [order] })));
  assert.match(html, />AVG-2026-0001</); assert.ok(html.includes(`/account/orders/${order.id}`));
  assert.equal(orderReference({ ...order, reference: null }), order.id);
  assert.equal(orderReference({ ...order, reference: 'forged' }), order.id);
  assert.equal(orderReference({}), 'Order reference unavailable');
  assert.equal(orderReference({ reference: 'AVG-2027-10000' }), 'AVG-2027-10000');
  const legacy = renderToString(h(Reference, { order: { id: order.id } })); assert.match(legacy, /overflow-wrap:anywhere/);
});

test('cancelled order timeline replaces shipment steps and makes no automated refund promise', () => {
  const cancelled = renderToString(h(Timeline, { status: 'Cancelled' }));
  assert.match(cancelled, /This order was cancelled/); assert.doesNotMatch(cancelled, /<ol|5–7|will be refunded/);
  assert.match(renderToString(h(Timeline, { status: 'Processing' })), /Order progress/);
});
