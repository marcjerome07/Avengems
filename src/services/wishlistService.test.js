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
const service = await vite.ssrLoadModule('/src/services/wishlistService.js');
const { createWishlistStore } = await vite.ssrLoadModule('/src/services/wishlistStore.js');
const { WishlistProvider } = await vite.ssrLoadModule('/src/context/WishlistContext.jsx');
const { WishlistContext, useWishlist } = await vite.ssrLoadModule('/src/context/useWishlist.js');
const { AuthContext } = await vite.ssrLoadModule('/src/context/useAuth.js');
const { ToastContext } = await vite.ssrLoadModule('/src/context/useToast.js');
const { ConfirmContext } = await vite.ssrLoadModule('/src/context/useConfirm.js');
const { CartContext } = await vite.ssrLoadModule('/src/context/useCart.js');
const { default: Wishlist, WishlistLoadState } = await vite.ssrLoadModule('/src/pages/account/Wishlist.jsx');
const { default: ProductCard } = await vite.ssrLoadModule('/src/components/product/ProductCard.jsx');
const product = { id: 'p-01', name: 'Test Ring', slug: 'test-ring', type: 'Ring', stone: 'power', color: 'Purple',
  material: '925 Sterling Silver', price: 1000, stock: 5, rating: 4.5, reviewCount: 2, customizable: {}, images: [] };
const second = { ...product, id: 'p-02', name: 'Second Ring' };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const csrf = () => ({ url: '/api/auth/csrf', body: { csrfToken: 'fabricated-csrf' } });
function transport(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const reply = replies.shift();
    assert.ok(reply, `Unexpected request ${url}`);
    assert.equal(url, reply.url);
    assert.equal(options.credentials, 'include');
    assert.equal(options.cache, 'no-store');
    calls.push({ url, options });
    if (reply.throw) throw new TypeError('offline');
    if (reply.barrier) await reply.barrier.promise;
    if (reply.invalidJson) return new Response('invalid');
    return Response.json(reply.body, { status: reply.status ?? 200 });
  });
  t.after(() => assert.equal(replies.length, 0));
  return calls;
}

test('wishlist transport uses private relative API, CSRF and no owner fields or browser storage', async (t) => {
  const previous = globalThis.window;
  const storage = { getItem: () => assert.fail('No browser storage reads'), setItem: () => assert.fail('No browser storage writes') };
  globalThis.window = { localStorage: storage, sessionStorage: storage };
  t.after(() => { globalThis.window = previous; });
  const calls = transport(t, [{ url: '/api/me/wishlist', body: { items: [product] } },
    csrf(), { url: '/api/me/wishlist', body: { item: second } }, csrf(),
    { url: '/api/me/wishlist/p-01', body: { ok: true, productId: 'p-01' } }]);
  assert.deepEqual(await service.loadWishlist(), [product]);
  assert.deepEqual(await service.addWishlistItem('p-02'), second);
  await service.removeWishlistItem('p-01');
  assert.equal(calls[2].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[2].options.body), { productId: 'p-02' });
  assert.equal(calls[2].options.headers['X-CSRF-Token'], 'fabricated-csrf');
  assert.equal(calls[4].options.method, 'DELETE');
  assert.deepEqual(JSON.parse(calls[4].options.body), {});
  assert.equal(service.saveWishlist, undefined);
});

test('missing CSRF and malformed responses fail visibly without fake success', async (t) => {
  transport(t, [{ url: '/api/auth/csrf', body: {} }]);
  await assert.rejects(service.addWishlistItem('p-01'), { code: 'SERVER_ERROR' });
  transport(t, [{ url: '/api/me/wishlist', invalidJson: true }]);
  await assert.rejects(service.loadWishlist(), { code: 'SERVER_ERROR' });
  transport(t, [{ url: '/api/me/wishlist', body: { items: [null] } }]);
  await assert.rejects(service.loadWishlist(), { code: 'SERVER_ERROR' });
  transport(t, [csrf(), { url: '/api/me/wishlist', body: { item: second } }]);
  await assert.rejects(service.addWishlistItem('p-01'), { code: 'SERVER_ERROR' });
});

test('network-uncertain writes are never replayed; explicit CSRF retries are bounded', async (t) => {
  let calls = transport(t, [csrf(), { url: '/api/me/wishlist', throw: true }]);
  await assert.rejects(service.addWishlistItem('p-01'), { code: 'NETWORK_ERROR' });
  assert.equal(calls.length, 2);
  const rejection = () => ({ url: '/api/me/wishlist', status: 403, body: { code: 'CSRF_REJECTED' } });
  calls = transport(t, [csrf(), rejection(), csrf(), { url: '/api/me/wishlist', body: { item: product } }]);
  assert.deepEqual(await service.addWishlistItem('p-01'), product);
  assert.equal(calls.length, 4);
  transport(t, [csrf(), rejection(), csrf(), rejection()]);
  await assert.rejects(service.addWishlistItem('p-01'), { code: 'CSRF_REJECTED' });
});

test('expired sessions refresh once and revalidate; failed refresh stops replay', async (t) => {
  const expired = () => ({ url: '/api/me/wishlist', status: 401, body: { code: 'UNAUTHORIZED' } });
  transport(t, [expired(), csrf(), { url: '/api/auth/refresh', body: { user: { id: 'alice' } } },
    { url: '/api/me/wishlist', body: { items: [product] } }]);
  assert.deepEqual(await service.loadWishlist(), [product]);
  transport(t, [expired(), csrf(), { url: '/api/auth/refresh', status: 401, body: { code: 'UNAUTHORIZED' } }]);
  await assert.rejects(service.loadWishlist(), { code: 'UNAUTHORIZED' });
});

test('account changes during CSRF bootstrap prevent the old write from being sent', async (t) => {
  const barrier = deferred();
  let current = true;
  const calls = transport(t, [{ ...csrf(), barrier }]);
  const pending = service.addWishlistItem('p-01', { isCurrent: () => current });
  current = false;
  barrier.resolve();
  await assert.rejects(pending, { code: 'STALE_WISHLIST' });
  assert.equal(calls.length, 1);
});

test('account changes during refresh prevent retry with another account cookies', async (t) => {
  const barrier = deferred();
  let current = true;
  const calls = transport(t, [{ url: '/api/me/wishlist', status: 401, body: { code: 'UNAUTHORIZED' } },
    csrf(), { url: '/api/auth/refresh', barrier, body: {} }]);
  const operation = service.loadWishlist({ isCurrent: () => current });
  // Wait until the refresh transport is in flight, without timing-based sleeps.
  while (calls.length < 3) await new Promise((resolve) => setImmediate(resolve));
  current = false;
  barrier.resolve();
  await assert.rejects(operation, { code: 'STALE_WISHLIST' });
  assert.equal(calls.length, 3);
});

test('wishlist availability and database errors retain safe backend messages', async (t) => {
  for (const [status, code] of [[400, 'VALIDATION_ERROR'], [404, 'PRODUCT_UNAVAILABLE'], [503, 'DATABASE_UNAVAILABLE']]) {
    transport(t, [csrf(), { url: '/api/me/wishlist', status, body: { code, message: 'Safe wishlist error.' } }]);
    await assert.rejects(service.addWishlistItem('p-01'), { status, code, message: 'Safe wishlist error.' });
  }
});

test('store initializes once per account, shares loads, and never loads anonymous data', async () => {
  let calls = 0;
  const load = deferred();
  const store = createWishlistStore({ loadWishlist: () => { calls++; return load.promise; } });
  await store.setOwner(null);
  assert.equal((await store.toggle(product)).stale, true);
  assert.equal(calls, 0);
  const first = store.setOwner('alice');
  assert.equal(store.getSnapshot().loading, true);
  assert.equal((await store.toggle(product)).unavailable, true);
  assert.deepEqual(store.getSnapshot().items, []);
  const secondLoad = store.setOwner('alice');
  assert.equal(first, secondLoad);
  load.resolve([product]);
  await first;
  await store.setOwner('alice');
  assert.equal(calls, 1);
  assert.deepEqual(store.getSnapshot().items, [product]);
});

test('logout clears private state immediately and late account responses are ignored', async () => {
  const old = deferred();
  let calls = 0;
  const store = createWishlistStore({ loadWishlist: async () => ++calls === 1 ? old.promise : [second] });
  const loadingAlice = store.setOwner('alice');
  await Promise.resolve();
  await store.setOwner(null);
  assert.deepEqual(store.getSnapshot().items, []);
  await store.setOwner('bob');
  old.resolve([product]);
  await loadingAlice;
  assert.equal(store.getSnapshot().ownerId, 'bob');
  assert.deepEqual(store.getSnapshot().items, [second]);
});

test('failed initial loads expose retry and recover from a fresh server response', async () => {
  let fail = true;
  const store = createWishlistStore({ loadWishlist: async () => { if (fail) throw new Error('offline'); return [product]; } });
  await store.setOwner('alice');
  assert.equal(store.getSnapshot().loading, false);
  assert.equal(store.getSnapshot().error.message, 'offline');
  assert.equal((await store.toggle(product)).unavailable, true);
  fail = false;
  await store.reload();
  assert.equal(store.getSnapshot().error, null);
  assert.deepEqual(store.getSnapshot().items, [product]);
});

test('rapid repeated heart clicks send one optimistic operation per product', async () => {
  const saved = deferred();
  let adds = 0;
  const store = createWishlistStore({ loadWishlist: async () => [], addWishlistItem: () => { adds++; return saved.promise; } });
  await store.setOwner('alice');
  const operation = store.toggle(product);
  assert.deepEqual(store.getSnapshot().items, [product]);
  assert.deepEqual(store.getSnapshot().pending, ['p-01']);
  assert.equal((await store.toggle(product)).busy, true);
  assert.equal((await store.remove('p-01')).busy, true);
  saved.resolve({ ...product, price: 1200 });
  assert.equal((await operation).ok, true);
  assert.equal(adds, 1);
  assert.equal(store.getSnapshot().items[0].price, 1200);
  assert.deepEqual(store.getSnapshot().pending, []);
});

test('rollback affects only the failed product and preserves independent successful changes', async () => {
  const failure = deferred();
  const store = createWishlistStore({ loadWishlist: async () => [], addWishlistItem: async (id) => id === 'p-01' ? failure.promise : second });
  await store.setOwner('alice');
  const firstAdd = store.toggle(product);
  assert.equal((await store.toggle(second)).ok, true);
  failure.reject(new Error('uncertain write'));
  assert.equal((await firstAdd).ok, false);
  assert.deepEqual(store.getSnapshot().items, [second]);
  assert.equal(store.getSnapshot().error.message, 'uncertain write');
});

test('failed removal restores the card; explicit reload reconciles uncertain server state', async () => {
  let loads = 0;
  const store = createWishlistStore({ loadWishlist: async () => ++loads === 1 ? [product] : [],
    removeWishlistItem: async () => { throw new Error('offline'); } });
  await store.setOwner('alice');
  const operation = store.remove('p-01');
  assert.deepEqual(store.getSnapshot().items, []);
  assert.equal((await operation).ok, false);
  assert.deepEqual(store.getSnapshot().items, [product]);
  await store.reload();
  assert.deepEqual(store.getSnapshot().items, []);
});

test('successful removal stays removed and repeated removal performs no extra write', async () => {
  let removals = 0;
  const store = createWishlistStore({ loadWishlist: async () => [product], removeWishlistItem: async () => { removals++; } });
  await store.setOwner('alice');
  assert.equal((await store.remove('p-01')).ok, true);
  assert.deepEqual(store.getSnapshot().items, []);
  assert.equal((await store.remove('p-01')).changed, false);
  assert.equal(removals, 1);
});

test('late writes cannot populate another account or a later session of the same account', async () => {
  for (const nextOwner of ['bob', 'alice']) {
    const saved = deferred();
    const store = createWishlistStore({ loadWishlist: async () => [], addWishlistItem: () => saved.promise });
    await store.setOwner('alice');
    const operation = store.toggle(product);
    await Promise.resolve();
    await store.setOwner(null);
    await store.setOwner(nextOwner);
    saved.resolve(product);
    assert.equal((await operation).stale, true);
    assert.deepEqual(store.getSnapshot().items, []);
  }
});

test('owner guards prevent a queued mutation before its network operation starts', async () => {
  let current = 'alice';
  let writes = 0;
  const store = createWishlistStore({ loadWishlist: async () => [], addWishlistItem: async () => { writes++; return product; } }, { getOwner: () => current });
  await store.setOwner('alice');
  const operation = store.toggle(product);
  current = 'bob';
  assert.equal((await operation).stale, true);
  assert.equal(writes, 0);
});

test('reload waits for mutations before accepting authoritative server state', async () => {
  const saved = deferred();
  let loads = 0;
  const store = createWishlistStore({ loadWishlist: async () => ++loads === 1 ? [] : [product], addWishlistItem: () => saved.promise });
  await store.setOwner('alice');
  const mutation = store.toggle(product);
  const refresh = store.reload();
  saved.resolve(product);
  await mutation;
  await refresh;
  assert.equal(loads, 2);
  assert.deepEqual(store.getSnapshot().items, [product]);
});

test('a refresh queued behind an old account mutation cannot reload the next account', async () => {
  const saved = deferred();
  let loads = 0;
  const store = createWishlistStore({ loadWishlist: async () => { loads++; return []; }, addWishlistItem: () => saved.promise });
  await store.setOwner('alice');
  const mutation = store.toggle(product);
  await Promise.resolve();
  const oldRefresh = store.reload();
  await store.setOwner('bob');
  saved.resolve(product);
  await mutation;
  await oldRefresh;
  assert.equal(loads, 2);
  assert.equal(store.getSnapshot().ownerId, 'bob');
  assert.deepEqual(store.getSnapshot().items, []);
});

function renderWithWishlist(element, value) {
  return renderToString(h(MemoryRouter, null,
    h(ToastContext.Provider, { value: { showToast() {} } },
      h(CartContext.Provider, { value: { addItem: () => true } },
        h(WishlistContext.Provider, { value }, h(ConfirmContext.Provider, { value: async () => true }, element))))));
}
test('wishlist page renders loading, empty, error/retry and populated states', () => {
  const base = { items: [], loading: false, error: null, isPending: () => false, reload() {}, remove: async () => true };
  assert.match(renderWithWishlist(h(Wishlist), base), /Your wishlist is empty/);
  const loading = renderWithWishlist(h(Wishlist), { ...base, loading: true });
  assert.match(loading, /Loading wishlist/);
  assert.doesNotMatch(loading, /Your wishlist is empty/);
  const error = renderWithWishlist(h(Wishlist), { ...base, error: new Error('Safe loading error.') });
  assert.match(error, /Safe loading error/);
  assert.match(error, /Retry wishlist/);
  assert.doesNotMatch(error, /Your wishlist is empty/);
  const populated = renderWithWishlist(h(Wishlist), { ...base, items: [product] });
  assert.match(populated, /Test Ring/);
  assert.match(populated, /Move to cart/);
  assert.match(populated, /Refresh wishlist/);
});

test('product hearts retain active state and disable duplicate pending clicks', () => {
  const value = { isWishlisted: () => true, isPending: () => true, loading: false, toggle() {} };
  const html = renderWithWishlist(h(ProductCard, { product }), value);
  assert.match(html, /product-card__heart is-active/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /disabled="" aria-busy="true"/);
});

test('provider starts anonymous with no private data and shows loading for a new authenticated owner', () => {
  function Probe() {
    const value = useWishlist();
    return h('span', null, `${value.count}:${value.loading ? 'loading' : 'ready'}`);
  }
  const render = (owner) => renderToString(h(AuthContext.Provider, { value: { user: owner ? { id: owner, role: 'customer' } : null, isAuthenticated: Boolean(owner) } },
    h(ToastContext.Provider, { value: { showToast() {} } }, h(WishlistProvider, null, h(Probe)))));
  assert.match(render(null), /0:ready/);
  assert.match(render('alice'), /0:loading/);
  assert.match(renderToString(h(WishlistLoadState, { loading: false }, 'child')), /child/);
});
