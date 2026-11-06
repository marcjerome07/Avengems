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
const service = await vite.ssrLoadModule('/src/services/authService.js');
const sessionService = await vite.ssrLoadModule('/src/services/sessionService.js');
const { createAuthSession } = await vite.ssrLoadModule('/src/services/authSession.js');
const { AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx');
const { useAuth } = await vite.ssrLoadModule('/src/context/useAuth.js');
const { ToastProvider } = await vite.ssrLoadModule('/src/context/ToastContext.jsx');
const { default: ProtectedRoute } = await vite.ssrLoadModule('/src/components/routing/ProtectedRoute.jsx');
const { default: AdminRoute } = await vite.ssrLoadModule('/src/components/routing/AdminRoute.jsx');
const { default: Login } = await vite.ssrLoadModule('/src/pages/auth/Login.jsx');
const user = Object.freeze({ id: '11111111-1111-4111-8111-111111111111', name: 'Customer',
  email: 'customer@example.test', role: 'customer', phone: '', verified: true, createdAt: '2026-10-30T00:00:00Z' });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { resolve, promise }; };
function mockApi(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    const next = replies.shift();
    assert.ok(next, `Unexpected request to ${url}`);
    assert.equal(url, next.url);
    assert.equal(options.credentials, 'include');
    assert.equal(options.cache, 'no-store');
    if (next.error) throw next.error;
    if (next.wait) await next.wait;
    return Response.json(next.body, { status: next.status ?? 200, headers: next.headers });
  });
  return calls;
}
const csrf = () => ({ url: '/api/auth/csrf', body: { csrfToken: 'fabricated-csrf' } });

test('login submits credentials/remember once with include and CSRF; only sanitized user fields enter context', async (t) => {
  const calls = mockApi(t, [csrf(), { url: '/api/auth/login', body: { user: { ...user, access_token: 'discarded', user_metadata: { role: 'admin' } } } }]);
  const result = await service.login(' customer@example.test ', 'fabricated-password', true);
  assert.deepEqual(result, user);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(JSON.parse(calls[1].options.body), { email: user.email, password: 'fabricated-password', remember: true });
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'fabricated-csrf');
  assert.equal(calls[1].options.headers.Authorization, undefined);
});

test('invalid passwords and network failures reject without mock fallback or password retries', async (t) => {
  let calls = mockApi(t, [csrf(), { url: '/api/auth/login', status: 401,
    body: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' } }]);
  await assert.rejects(service.login(user.email, 'wrong'), { code: 'INVALID_CREDENTIALS' });
  assert.equal(calls.length, 2);
  calls = mockApi(t, [{ url: '/api/auth/csrf', error: new TypeError('offline') }]);
  await assert.rejects(service.login(user.email, 'wrong'), { code: 'NETWORK_ERROR' });
  assert.equal(calls.length, 1);
});

test('session restoration ignores forged browser storage and uses only server identity', async (t) => {
  let reads = 0;
  const previous = globalThis.window;
  const storage = { getItem: () => { reads += 1; return JSON.stringify({ ...user, role: 'admin' }); }, setItem: () => assert.fail('No session writes') };
  globalThis.window = { localStorage: storage, sessionStorage: storage };
  t.after(() => { globalThis.window = previous; });
  mockApi(t, [{ url: '/api/me', body: user }]);
  assert.deepEqual(await service.getCurrentUser(), user);
  assert.equal(reads, 0);
  mockApi(t, [{ url: '/api/me', status: 401, body: { code: 'UNAUTHORIZED' } }, csrf(),
    { url: '/api/auth/refresh', status: 401, body: { code: 'UNAUTHORIZED' } }]);
  assert.equal(await service.getCurrentUser(), null);
  assert.equal(reads, 0);
});

test('expired access restores through CSRF-protected refresh followed by server /me revalidation', async (t) => {
  const calls = mockApi(t, [{ url: '/api/me', status: 401, body: { code: 'UNAUTHORIZED' } }, csrf(),
    { url: '/api/auth/refresh', body: { user } }, { url: '/api/me', body: user }]);
  assert.deepEqual(await service.getCurrentUser(), user);
  assert.equal(calls[2].options.method, 'POST');
  assert.equal(calls[2].options.headers['X-CSRF-Token'], 'fabricated-csrf');
});

test('concurrent restoration shares a single request; provider/profile outages fail closed', async (t) => {
  const wait = deferred();
  const calls = mockApi(t, [{ url: '/api/me', wait: wait.promise, body: user }]);
  const first = service.getCurrentUser();
  const second = service.getCurrentUser();
  wait.resolve();
  assert.deepEqual(await first, user);
  assert.deepEqual(await second, user);
  assert.equal(calls.length, 1);
  mockApi(t, [{ url: '/api/me', status: 503, body: { code: 'DATABASE_UNAVAILABLE', message: 'Try again.' } }]);
  await assert.rejects(service.getCurrentUser(), { code: 'DATABASE_UNAVAILABLE' });
});

test('unconfirmed or invalid-role responses never become an authenticated frontend identity', async (t) => {
  mockApi(t, [{ url: '/api/me', body: { ...user, verified: false } }]);
  await assert.rejects(service.getCurrentUser(), { code: 'UNVERIFIED' });
  mockApi(t, [{ url: '/api/me', body: { ...user, role: 'superadmin' } }]);
  await assert.rejects(service.getCurrentUser(), { code: 'INVALID_SESSION' });
});

test('logout uses CSRF and include; missing sessions succeed but network/provider failure is explicit', async (t) => {
  let calls = mockApi(t, [csrf(), { url: '/api/auth/logout', body: { ok: true } }]);
  await service.logout();
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'fabricated-csrf');
  mockApi(t, [csrf(), { url: '/api/auth/logout', status: 401, body: { code: 'UNAUTHORIZED' } }]);
  await service.logout();
  mockApi(t, [csrf(), { url: '/api/auth/logout', error: new TypeError('offline') }]);
  await assert.rejects(service.logout(), { code: 'NETWORK_ERROR' });
  mockApi(t, [csrf(), { url: '/api/auth/logout', status: 503, body: { code: 'AUTH_UNAVAILABLE' } }]);
  await assert.rejects(service.logout(), { code: 'AUTH_UNAVAILABLE' });
});

test('CSRF retries are bounded and happen only after an explicit rejection', async (t) => {
  const calls = mockApi(t, [csrf(), { url: '/api/auth/login', status: 403, body: { code: 'CSRF_REJECTED' } },
    csrf(), { url: '/api/auth/login', body: { user } }]);
  assert.deepEqual(await service.login(user.email, 'fabricated'), user);
  assert.equal(calls.length, 4);
});

test('logout invalidates an in-flight restoration and blocks automatic reauthentication after failure', async () => {
  const pending = deferred();
  const error = new Error('Sign out could not be confirmed.');
  const state = createAuthSession({ getCurrentUser: () => pending.promise, logout: async () => { throw error; } });
  const restoring = state.restore();
  const leaving = state.logout();
  assert.equal(state.getSnapshot().user, null);
  pending.resolve(user);
  await restoring;
  await assert.rejects(leaving, error);
  assert.equal(state.getSnapshot().status, 'logout-error');
  assert.equal(state.getSnapshot().user, null);
  await state.restore();
  assert.equal(state.getSnapshot().user, null);
});

test('logout waits for an earlier login response and then clears the latest cookie session', async () => {
  const pending = deferred();
  const order = [];
  const state = createAuthSession({ login: () => pending.promise, logout: async () => { order.push('logout'); } });
  const entering = state.login(user.email, 'fabricated');
  const leaving = state.logout();
  assert.deepEqual(order, []);
  pending.resolve(user);
  await assert.rejects(entering, /no longer active/);
  await leaving;
  assert.deepEqual(order, ['logout']);
  assert.equal(state.getSnapshot().status, 'anonymous');
});

function render(session, component, children) {
  return renderToString(h(MemoryRouter, { initialEntries: ['/account?tab=orders'] },
    h(ToastProvider, null, h(AuthProvider, { session }, h(component, null, children)))));
}

test('actual route guards withhold private content during initialization and on verification failure', async () => {
  const pending = deferred();
  const state = createAuthSession({ getCurrentUser: () => pending.promise });
  assert.match(render(state, ProtectedRoute, 'PRIVATE CONTENT'), /Checking your session/);
  assert.doesNotMatch(render(state, AdminRoute, 'PRIVATE CONTENT'), /PRIVATE CONTENT/);
  const restoration = state.restore();
  pending.resolve(null);
  await restoration;
  assert.doesNotMatch(render(state, ProtectedRoute, 'PRIVATE CONTENT'), /PRIVATE CONTENT/);
  const failed = createAuthSession({ getCurrentUser: async () => { throw new Error('Connection unavailable'); } });
  await failed.restore();
  assert.match(render(failed, ProtectedRoute, 'PRIVATE CONTENT'), /Unable to verify your session/);
  assert.doesNotMatch(render(failed, AdminRoute, 'PRIVATE CONTENT'), /PRIVATE CONTENT/);
});

test('customer/admin guard decisions use restored server roles, and login no longer renders demo credentials', async () => {
  const customer = createAuthSession({ getCurrentUser: async () => user });
  await customer.restore();
  assert.match(render(customer, ProtectedRoute, 'CUSTOMER CONTENT'), /CUSTOMER CONTENT/);
  assert.doesNotMatch(render(customer, AdminRoute, 'ADMIN CONTENT'), /ADMIN CONTENT/);
  const admin = createAuthSession({ getCurrentUser: async () => ({ ...user, role: 'admin' }) });
  await admin.restore();
  assert.match(render(admin, AdminRoute, 'ADMIN CONTENT'), /ADMIN CONTENT/);
  const anonymous = createAuthSession({ getCurrentUser: async () => null });
  await anonymous.restore();
  const loginHtml = render(anonymous, Login);
  assert.match(loginHtml, /Welcome Back/);
  assert.doesNotMatch(loginHtml, /Demo accounts|Use this account|prototype/);
});

test('the legacy profile setter reloads from the server and cannot install a supplied admin role', async () => {
  const state = createAuthSession({ getCurrentUser: async () => user });
  function CheckSetter() { return h('span', null, useAuth().setUser === state.restore ? 'reload-only' : 'unsafe'); }
  await state.restore();
  assert.match(render(state, CheckSetter), /reload-only/);
  await state.restore({ ...user, role: 'admin' });
  assert.equal(state.getSnapshot().user.role, 'customer');
  assert.doesNotMatch(render(state, AdminRoute, 'ADMIN CONTENT'), /ADMIN CONTENT/);
});

test('a CSRF bootstrap failure must not be mistaken for successful logout', async (t) => {
  const calls = mockApi(t, [{ url: '/api/auth/csrf', status: 401, body: { code: 'UNAUTHORIZED' } }]);
  await assert.rejects(service.logout(), /could not be confirmed/);
  assert.equal(calls.length, 1);
});

test('a CSRF bootstrap 401 during renewal is unavailable, not proof that an authenticated session ended', async (t) => {
  mockApi(t, [{ url: '/api/me', body: user }, { url: '/api/me', status: 401, body: { code: 'UNAUTHORIZED' } },
    { url: '/api/auth/csrf', status: 401, body: { code: 'UNAUTHORIZED' } }]);
  const state = createAuthSession(service); await state.restore(); await state.restore();
  assert.equal(state.getSnapshot().status, 'authenticated');
  assert.equal(state.getSnapshot().user.id, user.id);
  assert.equal(state.getSnapshot().error.code, 'AUTH_UNAVAILABLE');
});

test('a transient minute/focus revalidation error retains the verified session, hides protected content and recovers', async (t) => {
  const adminUser = { ...user, role: 'admin' };
  const calls = mockApi(t, [{ url: '/api/me', body: adminUser },
    { url: '/api/me', status: 503, body: { code: 'AUTH_UNAVAILABLE', message: 'Temporarily unavailable.' } },
    { url: '/api/me', body: adminUser }]);
  const state = createAuthSession(service);
  await state.restore();
  assert.match(render(state, AdminRoute, 'ADMIN CONTENT'), /ADMIN CONTENT/);
  await state.restore(); // AuthProvider invokes the same path every visible minute/focus.
  assert.equal(state.getSnapshot().user?.id, user.id, 'A temporary check failure must not discard identity');
  assert.equal(state.getSnapshot().status, 'authenticated', 'The existing periodic retry must remain eligible');
  assert.equal(state.getSnapshot().error.code, 'AUTH_UNAVAILABLE');
  assert.match(render(state, AdminRoute, 'ADMIN CONTENT'), /Unable to verify your session/);
  assert.match(render(state, Login), /Welcome Back/, 'A retained recovery error must not bounce Login straight back to the blocked guard');
  assert.doesNotMatch(render(state, AdminRoute, 'ADMIN CONTENT'), /ADMIN CONTENT/);
  await state.restore();
  assert.equal(state.getSnapshot().error, null);
  assert.match(render(state, AdminRoute, 'ADMIN CONTENT'), /ADMIN CONTENT/);
  assert.equal(calls.length, 3); assert.ok(calls.every((call) => call.url === '/api/me'));
});

test('server timing survives cookie renewal while idle rejection locks both role states without claiming provider logout', async (t) => {
  for (const role of ['admin', 'customer']) {
    const timing = { key: 'public-timing-key', idleExpiresAt: 1200000, absoluteExpiresAt: 43200000, serverNow: 0 };
    mockApi(t, [{ url: '/api/me', body: { ...user, role, session: timing } },
      { url: '/api/me', status: 401, body: { code: 'SESSION_IDLE_EXPIRED', message: 'Idle expired' } }]);
    const state = createAuthSession(service); await state.restore();
    assert.deepEqual(state.getSnapshot().user.session, timing); await state.restore();
    assert.equal(state.getSnapshot().user, null); assert.equal(state.getSnapshot().idleExpired, true);
    assert.equal(state.getSnapshot().error, null); assert.doesNotMatch(render(state, AdminRoute, 'PRIVATE'), /PRIVATE/);
    assert.match(render(state, Login), /20-minute inactivity/);
    state.expireIdle(true); assert.match(render(state, Login), /could not be reached to confirm/);
  }
});

test('real activity transport uses CSRF, renews expired access once and never submits a client deadline', async (t) => {
  const timing = { key: 'public-timing-key', idleExpiresAt: 1200000, absoluteExpiresAt: 43200000, serverNow: 0 };
  const calls = mockApi(t, [csrf(), { url: '/api/auth/activity', status: 401, body: { code: 'UNAUTHORIZED' } },
    csrf(), { url: '/api/auth/refresh', body: { user } }, csrf(), { url: '/api/auth/activity', body: { session: timing } }]);
  assert.deepEqual(await sessionService.recordSessionActivity(), timing);
  assert.ok(Object.keys(JSON.parse(calls[5].options.body)).every((key) => key === 'elapsedMs'));
  assert.equal(calls[5].options.headers['X-CSRF-Token'], 'fabricated-csrf');
  assert.equal(calls.filter((call) => call.url === '/api/auth/refresh').length, 1);
});

test('idle access expiry with an interrupted refresh retains customer/admin session until a secure retry succeeds', async (t) => {
  for (const role of ['customer', 'admin']) {
    const identity = { ...user, role };
    const calls = mockApi(t, [{ url: '/api/me', body: identity },
      { url: '/api/me', status: 401, body: { code: 'UNAUTHORIZED' } }, csrf(),
      { url: '/api/auth/refresh', error: new TypeError('offline') },
      { url: '/api/me', status: 401, body: { code: 'UNAUTHORIZED' } }, csrf(),
      { url: '/api/auth/refresh', body: { user: identity } }, { url: '/api/me', body: identity }]);
    const state = createAuthSession(service); await state.restore();
    await state.restore();
    assert.equal(state.getSnapshot().status, 'authenticated'); assert.equal(state.getSnapshot().user.role, role);
    assert.equal(state.getSnapshot().error.code, 'NETWORK_ERROR'); assert.equal(calls.length, 4, 'No blind network retry');
    assert.doesNotMatch(render(state, ProtectedRoute, 'PRIVATE CONTENT'), /PRIVATE CONTENT/);
    await state.restore();
    assert.equal(state.getSnapshot().status, 'authenticated'); assert.equal(state.getSnapshot().error, null);
    assert.equal(state.getSnapshot().user.role, role); assert.equal(calls.length, 8);
    assert.equal(calls[6].options.headers['X-CSRF-Token'], 'fabricated-csrf');
    assert.ok(!calls.some((call) => call.url === '/api/auth/logout'));
  }
});

test('transient recovery never preserves rejected, unverified or demoted admin privileges', async (t) => {
  for (const failure of [
    { url: '/api/me', status: 403, body: { code: 'PROFILE_UNAVAILABLE' } },
    { url: '/api/me', body: { ...user, role: 'unknown' } },
    { url: '/api/me', body: { ...user, verified: false } },
  ]) {
    mockApi(t, [{ url: '/api/me', body: { ...user, role: 'admin' } }, failure]);
    const state = createAuthSession(service); await state.restore(); await state.restore();
    assert.equal(state.getSnapshot().user, null); assert.equal(state.getSnapshot().status, 'error');
    assert.doesNotMatch(render(state, AdminRoute, 'ADMIN CONTENT'), /ADMIN CONTENT/);
  }
  mockApi(t, [{ url: '/api/me', body: { ...user, role: 'admin' } },
    { url: '/api/me', status: 503, body: { code: 'DATABASE_UNAVAILABLE' } },
    { url: '/api/me', body: user }, { url: '/api/me', status: 401, body: { code: 'UNAUTHORIZED' } },
    csrf(), { url: '/api/auth/refresh', status: 401, body: { code: 'UNAUTHORIZED' } }]);
  const state = createAuthSession(service); await state.restore(); await state.restore(); await state.restore();
  assert.equal(state.getSnapshot().user.role, 'customer'); assert.doesNotMatch(render(state, AdminRoute, 'ADMIN CONTENT'), /ADMIN CONTENT/);
  await state.restore(); assert.equal(state.getSnapshot().user, null); assert.equal(state.getSnapshot().status, 'anonymous');
});
