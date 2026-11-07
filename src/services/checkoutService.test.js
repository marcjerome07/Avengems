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
const { createCommerceClient } = await vite.ssrLoadModule('/src/services/commerceService.js');
const { orderRequest } = await vite.ssrLoadModule('/src/services/orderService.js');
const attempts = await vite.ssrLoadModule('/src/services/checkoutAttempts.js');
const { cartSelections, subtractPurchasedItems } = await vite.ssrLoadModule('/src/services/cartService.js');
const { QuoteTotals, MiniItems } = await vite.ssrLoadModule('/src/components/cart/OrderSummary.jsx');
const { default: Checkout } = await vite.ssrLoadModule('/src/pages/Checkout.jsx');
const { default: Cart } = await vite.ssrLoadModule('/src/pages/Cart.jsx');
const { default: Confirmation } = await vite.ssrLoadModule('/src/pages/OrderConfirmation.jsx');
const { AuthContext } = await vite.ssrLoadModule('/src/context/useAuth.js');
const { CartContext } = await vite.ssrLoadModule('/src/context/useCart.js');
const { ToastContext } = await vite.ssrLoadModule('/src/context/useToast.js');
const { ConfirmContext } = await vite.ssrLoadModule('/src/context/useConfirm.js');
const key = '33333333-3333-4333-8333-333333333333';
const user = { id: 'alice', name: 'Customer Name', email: 'customer@example.test', role: 'customer', verified: true };
const item = { lineId: 'p-01|Purple|US 5', productId: 'p-01', name: 'Test Ring', slug: 'test-ring', color: 'Purple', size: 'US 5', stone: 'power', quantity: 2, unitPrice: 1, basePrice: 1, customizationFee: 999 };
const payload = { items: [item], customer: { name: user.name, email: user.email, phone: '09171234567', cardNumber: 'DO-NOT-SEND' },
  shipping: { address: 'Test street', city: 'Manila', province: 'Metro Manila', postalCode: '1000' }, paymentMethod: 'cod', userId: 'forged', total: 1, cardNumber: 'DO-NOT-SEND' };
const totals = { itemCount: 2, subtotal: 2000, customizationTotal: 0, shippingFee: 0, total: 2000, freeThreshold: 2000, freeShippingRemaining: 0 };
const csrf = () => ({ url: '/api/auth/csrf', body: { csrfToken: 'fabricated-csrf' } });
function transport(replies, getOwner = () => 'alice') {
  const calls = [];
  const client = createCommerceClient({ getOwner, refresh: async () => { calls.push({ refresh: true }); }, fetcher: async (url, options) => {
    const reply = replies.shift(); assert.ok(reply, `Unexpected request ${url}`); assert.equal(url, reply.url);
    assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store');
    calls.push({ url, options });
    if (reply.run) reply.run();
    if (reply.throw) throw new TypeError('offline');
    if (reply.invalidJson) return new Response('invalid');
    return Response.json(reply.body, { status: reply.status ?? 200 });
  } });
  return { client, calls };
}
function storage(t, blocked = false) {
  const previous = globalThis.window;
  const rows = new Map();
  globalThis.window = { sessionStorage: {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new Error('blocked'); rows.set(key, value); },
    removeItem: (key) => rows.delete(key),
  } };
  t.after(() => { globalThis.window = previous; });
  return rows;
}

test('quote and checkout transport send only selections, contact, shipping, CSRF and the stable key', async () => {
  const safe = orderRequest(payload);
  assert.deepEqual(safe.items, cartSelections([item]));
  assert.doesNotMatch(JSON.stringify(safe), /DO-NOT-SEND|basePrice|customizationFee|userId|total/);
  const { client, calls } = transport([csrf(), { url: '/api/cart/quote', body: { items: [], totals } },
    csrf(), { url: '/api/me/orders', body: { id: 'AVG-TEST', items: [] } }]);
  await client.request('/api/cart/quote', { method: 'POST', body: { items: safe.items } });
  const order = await client.request('/api/me/orders', { method: 'POST', body: safe, key });
  assert.equal(order.id, 'AVG-TEST');
  assert.equal(calls[3].options.headers['Idempotency-Key'], key);
  assert.equal(calls[3].options.headers['X-CSRF-Token'], 'fabricated-csrf');
});

test('explicit CSRF/expired-auth rejections retry once while preserving checkout key', async () => {
  const rejected = () => ({ url: '/api/me/orders', status: 403, body: { code: 'CSRF_REJECTED' } });
  const { client, calls } = transport([csrf(), rejected(), csrf(), { url: '/api/me/orders', status: 401, body: { code: 'UNAUTHORIZED' } },
    csrf(), { url: '/api/me/orders', body: { id: 'AVG-TEST' } }]);
  await client.request('/api/me/orders', { method: 'POST', body: orderRequest(payload), key });
  assert.equal(calls.filter((call) => call.refresh).length, 1);
  assert.ok(calls.filter((call) => call.url === '/api/me/orders').every((call) => call.options.headers['Idempotency-Key'] === key));
  const repeat = transport([csrf(), rejected(), csrf(), rejected()]);
  await assert.rejects(repeat.client.request('/api/me/orders', { method: 'POST', body: {}, key }), { code: 'CSRF_REJECTED' });
});

test('uncertain network, provider and invalid JSON failures never automatically replay an order', async () => {
  for (const reply of [{ throw: true }, { invalidJson: true }, { status: 503, body: { code: 'CHECKOUT_UNAVAILABLE', message: 'Safe error.' } }]) {
    const { client, calls } = transport([csrf(), { url: '/api/me/orders', ...reply }]);
    await assert.rejects(client.request('/api/me/orders', { method: 'POST', body: {}, key }));
    assert.equal(calls.length, 2);
  }
});

test('account switches during bootstrap prevent checkout being sent with later account cookies', async () => {
  let owner = 'alice';
  const { client, calls } = transport([{ ...csrf(), run: () => { owner = 'bob'; } }], () => owner);
  await assert.rejects(client.request('/api/me/orders', { method: 'POST', body: {}, key }), { code: 'SESSION_CHANGED' });
  assert.equal(calls.length, 1);
  const anonymous = transport([], () => null);
  await assert.rejects(anonymous.client.request('/api/me/orders'), { code: 'UNAUTHORIZED' });
  const switched = transport([], () => 'bob');
  await assert.rejects(switched.client.request('/api/me/orders', { method: 'POST', ownerId: 'alice', body: {}, key }), { code: 'SESSION_CHANGED' });
  assert.equal(switched.calls.length, 0);
});

test('pending drafts preserve idempotency across retries/remounts and are separated by account', (t) => {
  const rows = storage(t);
  const request = orderRequest(payload);
  const first = attempts.beginCheckout('alice', request);
  const retry = attempts.beginCheckout('alice', { ...request, paymentMethod: 'maya' });
  assert.deepEqual(retry, first);
  assert.deepEqual(attempts.pendingCheckout('alice'), first);
  assert.equal(attempts.pendingCheckout('bob'), null);
  assert.doesNotMatch([...rows.values()].join(''), /DO-NOT-SEND|cardNumber/);
});

test('blocked draft storage prevents submission; malformed pending data blocks a new attempt', (t) => {
  const rows = storage(t, true);
  assert.throws(() => attempts.beginCheckout('alice', orderRequest(payload)), { code: 'CHECKOUT_STORAGE_ERROR' });
  rows.set('avg_checkout_pending_alice', JSON.stringify({ owner: 'bob' }));
  assert.throws(() => attempts.pendingCheckout('alice'), { code: 'CHECKOUT_STORAGE_ERROR' });
});

test('confirmed checkout alone removes purchased quantities and clears its retry draft', async (t) => {
  storage(t);
  const attempt = attempts.beginCheckout('alice', orderRequest(payload));
  let cart = [{ ...item, quantity: 3 }, { ...item, productId: 'p-02', lineId: 'other', quantity: 1 }];
  const result = await attempts.confirmCheckoutAttempt(attempt, { placeOrder: async (request, options) => {
    assert.equal(options.idempotencyKey, attempt.key); assert.deepEqual(request, attempt.request); return { id: 'AVG-SAVED', items: [] };
  }, completeCart: (purchased) => { cart = subtractPurchasedItems(cart, purchased); } });
  assert.equal(result.id, 'AVG-SAVED');
  assert.deepEqual(cart.map((line) => line.quantity), [1, 1]);
  assert.equal(attempts.pendingCheckout('alice'), null);
});

test('failed, stale and malformed confirmations retain cart and frozen request for same-key retry', async (t) => {
  storage(t);
  const attempt = attempts.beginCheckout('alice', orderRequest(payload));
  for (const options of [
    { placeOrder: async () => { throw new Error('offline'); } },
    { placeOrder: async () => ({ id: 'AVG-SAVED', items: [] }), isCurrent: () => false },
    { placeOrder: async () => ({}) },
  ]) {
    await assert.rejects(attempts.confirmCheckoutAttempt(attempt, { ...options, completeCart: () => assert.fail('Cart must be retained') }));
    assert.deepEqual(attempts.pendingCheckout('alice'), attempt);
  }
});

test('only definite pre-write/transaction rejections allow abandoning a checkout key', () => {
  assert.equal(attempts.definitiveCheckoutFailure({ code: 'NETWORK_ERROR' }), false);
  assert.equal(attempts.definitiveCheckoutFailure({ status: 503, code: 'CHECKOUT_UNAVAILABLE' }), false);
  assert.equal(attempts.definitiveCheckoutFailure({ status: 409, code: 'IDEMPOTENCY_CONFLICT' }), false);
  assert.equal(attempts.definitiveCheckoutFailure({ code: 'CHECKOUT_MIGRATION_REQUIRED' }), true);
  assert.equal(attempts.definitiveCheckoutFailure({ code: 'INSUFFICIENT_STOCK' }), true);
});

test('quote feedback separates loading, stock errors/retry, and authoritative totals', () => {
  assert.match(renderToString(h(QuoteTotals, { loading: true })), /Validating prices and stock/);
  const error = renderToString(h(QuoteTotals, { error: new Error('Insufficient stock'), onRetry() {} }));
  assert.match(error, /role="alert"/); assert.match(error, /Retry cart quote/);
  const ready = renderToString(h(QuoteTotals, { totals })); assert.match(ready, /2,000/);
  const unpriced = renderToString(h(MiniItems, { items: [item], priced: false }));
  assert.match(unpriced, /class="mini-item__price">—<\/p>/);
  assert.doesNotMatch(unpriced, /mini-item__custom/);
});

function renderPage(Page, cart) {
  return renderToString(h(MemoryRouter, null, h(AuthContext.Provider, { value: { user } },
    h(ToastContext.Provider, { value: { showToast() {} } }, h(CartContext.Provider, { value: cart }, h(ConfirmContext.Provider, { value: async () => true }, h(Page)))))));
}
test('Cart and Checkout wait for server quotes instead of presenting browser totals as authoritative', (t) => {
  storage(t);
  const base = { items: [item], totals: null, quotedItems: null, itemCount: 2, quoteLoading: true, quoteError: null, reloadQuote() {}, completeCheckout() {} };
  const cart = renderPage(Cart, base); assert.match(cart, /Awaiting server price/); assert.match(cart, /Validating prices and stock/);
  const checkout = renderPage(Checkout, base); assert.match(checkout, /Validating prices and stock/); assert.doesNotMatch(checkout, /NaN/);
  const error = renderPage(Checkout, { ...base, quoteLoading: false, quoteError: new Error('Stock changed') });
  assert.match(error, /Stock changed/); assert.match(error, /Retry cart quote/);
});

test('pending checkout remains retryable despite changed cart stock and confirmation waits for persisted lookup', (t) => {
  storage(t);
  attempts.beginCheckout('alice', orderRequest(payload));
  const html = renderPage(Checkout, { items: [], totals: null, quoteLoading: false, quoteError: new Error('Stock changed'), completeCheckout() {} });
  assert.match(html, /Retry pending order/);
  assert.match(html, /saved contents will be used/);
  const confirmation = renderPage(Confirmation, {});
  assert.match(confirmation, /Loading order/);
  assert.doesNotMatch(confirmation, /Thank you for your order/);
});
