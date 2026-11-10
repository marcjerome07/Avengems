import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createAccessTokenVerifier, createAuthClientFactory } from '../src/auth.js';
import { createCookieSessions } from '../src/sessions.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { createMeRouter } from '../src/routes/me.js';
import { getPublicUser, identityFromUser } from '../src/profile.js';
import { errorHandler } from '../src/errors.js';
import { createRequireAuth } from '../src/middleware/auth.js';
import { createRequireAdmin } from '../src/middleware/admin.js';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'customer@example.test',
  email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: { role: 'admin' } };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

async function withApi(run, options = {}) {
  let time = Date.parse('2026-10-30T00:00:00Z');
  let sequence = 0;
  const tokens = new Map();
  const calls = { clients: 0, login: [], refresh: [], logout: [], profile: [], setSession: [] };
  const jar = new Map();
  // Model browser persistence separately from values. Existing request tests can
  // still supply stale/forged Maps without pretending they are browser jars.
  const cookieExpiries = new Map();
  function expireCookies() {
    for (const [name, expiry] of cookieExpiries) {
      if (expiry !== null && expiry <= time) { jar.delete(name); cookieExpiries.delete(name); }
    }
  }
  function restartBrowser() {
    expireCookies();
    for (const [name, expiry] of cookieExpiries) {
      if (expiry === null) { jar.delete(name); cookieExpiries.delete(name); }
    }
  }
  function makeSession() {
    sequence += 1;
    const session = { access_token: `fabricated-access-${sequence}`, refresh_token: `fabricated-refresh-${sequence}`,
      expires_at: time / 1000 + (options.accessLifetimeSeconds ?? 3600) };
    tokens.set(session.access_token, session.expires_at);
    return { data: { user, session }, error: null };
  }
  const clientFactory = () => {
    calls.clients += 1;
    return { auth: {
      signInWithPassword: async (input) => {
        calls.login.push(input);
        if (options.loginThrows) throw new Error('private password secret');
        if (options.loginError) return { data: {}, error: options.loginError };
        return makeSession();
      },
      refreshSession: async (input) => {
        calls.refresh.push(input);
        options.refreshStarted?.resolve();
        if (options.refreshBarrier) await options.refreshBarrier.promise;
        if (options.refreshThrows) throw new Error('private refresh secret');
        if (options.refreshError) return { data: {}, error: options.refreshError };
        const result = makeSession();
        if (options.wrongRefreshUser) result.data.user = { ...user, id: 'another-user' };
        return result;
      },
      getUser: async (token) => {
        const expiry = tokens.get(token);
        if (options.nextUserBarrier) {
          const barrier = options.nextUserBarrier; options.nextUserBarrier = undefined;
          options.nextUserStarted?.resolve(); await barrier.promise;
        }
        if (expiry && expiry * 1000 <= time && options.expiredLookupBarrier) {
          options.expiredLookupStarted?.resolve(); await options.expiredLookupBarrier.promise;
        }
        if (!expiry || expiry * 1000 <= time) return { data: { user: null }, error: { status: 401 } };
        return { data: { user }, error: null };
      },
      setSession: async (session) => { calls.setSession.push(session); return { data: {}, error: null }; },
      signOut: async (scope) => {
        calls.logout.push(scope);
        if (options.logoutThrows) throw new Error('private logout token');
        return { error: options.logoutError ?? null };
      },
    } };
  };
  const db = { from: (table) => {
    assert.equal(table, 'profiles');
    return { select: () => ({ eq: (column, value) => {
      calls.profile.push({ column, value });
      return { maybeSingle: async () => ({ data: options.missingProfile ? null : {
        id: user.id, name: 'Customer', role: options.role ?? 'customer', phone: null,
        created_at: '2026-01-01T00:00:00Z',
      }, error: options.profileError ?? null }) };
    } }) };
  } };
  const config = { url: 'https://example.supabase.co', publishableKey: 'fabricated-key', clientFactory };
  const sessions = createCookieSessions({ createAuthClient: createAuthClientFactory(config),
    loadUser: (authUser) => getPublicUser(db, identityFromUser(authUser)), origin: options.origin ?? 'http://localhost:5173',
    production: options.production, now: () => time, loginLimit: options.loginLimit ?? 100,
    maxSessions: options.maxSessions ?? 100, maxRateKeys: options.maxRateKeys ?? 100 });
  const app = express();
  app.use(['/api/auth', '/api/me'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(sessions));
  if (options.enforceAppSession) app.use('/api/me', sessions.requireSession);
  app.use('/api/admin', sessions.requireSession, createRequireAuth(createAccessTokenVerifier(config), { cookieSessions: sessions }), createRequireAdmin(db));
  app.get('/api/admin/probe', (_req, res) => res.json({ ok: true }));
  app.use('/api/me', createMeRouter({ client: db, verifyAccessToken: createAccessTokenVerifier(config), cookieSessions: sessions }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  async function send(path, { method = 'GET', body, headers = {}, cookies = jar,
    origin = true, csrf = true, update = true } = {}) {
    if (cookies === jar) expireCookies();
    const requestHeaders = { ...headers };
    if (cookies) requestHeaders.Cookie = [...cookies].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('; ');
    if (method === 'POST') {
      if (origin) requestHeaders.Origin = options.origin ?? 'http://localhost:5173';
      if (csrf) requestHeaders['X-CSRF-Token'] = cookies?.get(options.production ? '__Host-avg_csrf' : 'avg_csrf') ?? '';
    }
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookies = response.headers.getSetCookie();
    if (update && cookies) for (const cookie of setCookies) {
      const pair = cookie.split(';')[0];
      const index = pair.indexOf('=');
      const key = pair.slice(0, index);
      const value = decodeURIComponent(pair.slice(index + 1));
      if (!value) cookies.delete(key); else cookies.set(key, value);
      if (cookies === jar) {
        const maxAge = /; Max-Age=(-?\d+)/i.exec(cookie);
        if (!value) cookieExpiries.delete(key);
        else cookieExpiries.set(key, maxAge ? time + Number(maxAge[1]) * 1000 : null);
      }
    }
    return { status: response.status, body: await response.json(), headers: response.headers, setCookies };
  }
  async function login(body = { email: ' Customer@Example.Test ', password: 'fabricated-password' }) {
    await send('/api/auth/csrf');
    return send('/api/auth/login', { method: 'POST', body });
  }
  try { await run({ send, login, jar, calls, advance: (ms) => { time += ms; }, restartBrowser, options }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('login returns a sanitized DB-backed user, HttpOnly scoped cookies, and no Auth tokens', async () => {
  await withApi(async ({ login, send, calls, jar }) => {
    const result = await login();
    assert.equal(result.status, 200);
    assert.equal(result.body.user.id, user.id);
    assert.equal(result.body.user.role, 'customer');
    assert.equal(result.body.user.phone, '');
    assert.doesNotMatch(JSON.stringify(result.body), /fabricated-access|fabricated-refresh|fabricated-password|user_metadata/);
    assert.equal(calls.login[0].email, 'customer@example.test');
    assert.ok(result.setCookies.every((cookie) => /HttpOnly/.test(cookie) && /SameSite=Strict/.test(cookie)));
    assert.match(result.setCookies.find((cookie) => cookie.startsWith('avg_access=')), /Path=\/api;/);
    assert.match(result.setCookies.find((cookie) => cookie.startsWith('avg_refresh=')), /Path=\/api\/auth;/);
    assert.ok(result.setCookies.every((cookie) => !/Max-Age=/.test(cookie)));
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal((await send('/api/me')).body.id, user.id);
    assert.ok(calls.profile.every(({ value }) => value === user.id));
    // The header remains authoritative even with valid cookies present.
    assert.equal((await send('/api/me', { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    assert.ok(jar.has('avg_refresh'));
    assert.equal((await send('/api/me')).status, 200);
  });
});

test('production cookies use Secure host prefixes; remember adds bounded persistence', async () => {
  await withApi(async ({ login }) => {
    const result = await login({ email: user.email, password: 'fabricated', remember: true });
    assert.equal(result.status, 200);
    assert.ok(result.setCookies.every((cookie) => /Secure/.test(cookie) && /HttpOnly/.test(cookie) && /Max-Age=/.test(cookie) && !/Domain=/.test(cookie)));
    assert.ok(result.setCookies.some((cookie) => cookie.startsWith('__Host-avg_session=') && /Path=\//.test(cookie)));
  }, { production: true, origin: 'https://store.example.test' });
});

test('input validation rejects identity/role injection and wrong types without calling Auth', async () => {
  await withApi(async ({ send, calls }) => {
    await send('/api/auth/csrf');
    for (const body of [null, [], {}, { email: user.email, password: '' },
      { email: 'invalid', password: 'a' }, { email: user.email, password: 'a', role: 'admin' },
      { email: user.email, password: 'a', userId: user.id }, { email: user.email, password: 'a', remember: 'yes' }]) {
      assert.equal((await send('/api/auth/login', { method: 'POST', body })).status, 400);
    }
    assert.equal(calls.login.length, 0);
  });
});

test('browser restart restores only remembered sessions, including expired access, without renewing idle time', async () => {
  for (const role of ['customer', 'admin']) for (const remember of [false, true]) {
    await withApi(async ({ login, send, advance, restartBrowser, jar }) => {
      const logged = await login({ email: user.email, password: 'fabricated', remember });
      const initial = logged.body.session;
      const sid = jar.get('avg_session');
      advance(5 * 60 * 1000);
      // A reload uses the same jar; expiration of access requires protected refresh.
      assert.equal((await send('/api/me')).status, 401);
      const refreshed = await send('/api/auth/refresh', { method: 'POST' });
      assert.equal(refreshed.status, 200);
      assert.equal(refreshed.body.session.idleExpiresAt, initial.idleExpiresAt);
      // Every CSRF bootstrap must preserve the session's persistence preference.
      const bootstrapped = await send('/api/auth/csrf');
      assert.equal(/Max-Age=/.test(bootstrapped.setCookies[0]), remember);
      assert.equal(/Expires=/.test(bootstrapped.setCookies[0]), remember);
      advance(2 * 60 * 1000);
      restartBrowser();
      if (!remember) {
        assert.equal(jar.size, 0);
        assert.equal((await send('/api/me')).status, 401);
        await send('/api/auth/csrf');
        assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 401);
        return;
      }
      assert.equal(jar.get('avg_session'), sid);
      assert.equal(jar.has('avg_access'), false, 'Provider access expiry is independent of browser restart');
      assert.equal((await send('/api/me')).status, 401);
      await send('/api/auth/csrf');
      const restored = await send('/api/auth/refresh', { method: 'POST' });
      assert.equal(restored.status, 200);
      assert.equal(restored.body.user.role, role);
      assert.equal(restored.body.session.key, initial.key);
      assert.equal(restored.body.session.idleExpiresAt, initial.idleExpiresAt);
      assert.equal(restored.body.session.absoluteExpiresAt, initial.absoluteExpiresAt);
      assert.equal((await send('/api/me')).status, 200);
      advance(13 * 60 * 1000);
      restartBrowser();
      assert.equal((await send('/api/me')).body.code, 'SESSION_IDLE_EXPIRED');
      assert.equal(jar.size, 0);
    }, { role, accessLifetimeSeconds: 60, enforceAppSession: true });
  }
});

test('a new login replaces remembered cookies with session cookies when Remember Me is unchecked', async () => {
  for (const role of ['customer', 'admin']) await withApi(async ({ login, send, jar, restartBrowser }) => {
    await login({ email: user.email, password: 'fabricated', remember: true });
    const previous = new Map(jar);
    const result = await login({ email: user.email, password: 'fabricated', remember: false });
    assert.equal(result.status, 200);
    assert.ok(result.setCookies.every((cookie) => !/Max-Age=|Expires=/.test(cookie)));
    assert.equal((await send('/api/me', { cookies: previous })).status, 401);
    assert.equal((await send('/api/me')).status, 200);
    restartBrowser();
    assert.equal(jar.size, 0);
    assert.equal((await send('/api/me')).status, 401);
  }, { role, enforceAppSession: true });
});

test('activity preserves persistence and the absolute deadline; logout prevents remembered browser restoration', async () => {
  for (const role of ['customer', 'admin']) for (const remember of [false, true]) {
    await withApi(async ({ login, send, advance, restartBrowser, jar }) => {
      const logged = await login({ email: user.email, password: 'fabricated', remember });
      advance(19 * 60 * 1000);
      const activity = await send('/api/auth/activity', { method: 'POST', body: {} });
      assert.equal(activity.status, 200);
      assert.equal(activity.body.session.idleExpiresAt, logged.body.session.idleExpiresAt + 19 * 60 * 1000);
      assert.equal(activity.body.session.absoluteExpiresAt, logged.body.session.absoluteExpiresAt);
      advance(2 * 60 * 1000);
      if (remember) restartBrowser();
      assert.equal((await send('/api/me')).status, 200);
      const replay = new Map(jar);
      assert.equal((await send('/api/auth/logout', { method: 'POST' })).status, 200);
      restartBrowser();
      assert.equal(jar.size, 0);
      assert.equal((await send('/api/me', { cookies: new Map(replay) })).status, 401);
      assert.equal((await send('/api/auth/refresh', { method: 'POST', cookies: new Map(replay) })).status, 401);
    }, { role, enforceAppSession: true });
  }
});

test('invalid credentials are generic, and unusable profiles never establish app sessions', async () => {
  await withApi(async ({ login, jar }) => {
    const result = await login();
    assert.equal(result.status, 401);
    assert.equal(result.body.code, 'INVALID_CREDENTIALS');
    assert.doesNotMatch(JSON.stringify(result.body), /private/);
    assert.equal(jar.has('avg_access'), false);
  }, { loginError: { status: 400, message: 'private account existence' } });
  await withApi(async ({ login, calls, jar }) => {
    assert.equal((await login()).status, 403);
    assert.equal(calls.logout.length, 1);
    assert.equal(jar.has('avg_access'), false);
  }, { missingProfile: true });
});

test('all state-changing endpoints require trusted Origin and matching signed CSRF', async () => {
  await withApi(async ({ send, login, jar, calls }) => {
    await login();
    for (const path of ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout']) {
      assert.equal((await send(path, { method: 'POST', origin: false })).status, 403);
      assert.equal((await send(path, { method: 'POST', csrf: false })).status, 403);
      assert.equal((await send(path, { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
      const forged = new Map(jar);
      forged.set('avg_csrf', 'attacker-controlled');
      assert.equal((await send(path, { method: 'POST', cookies: forged })).status, 403);
    }
    assert.equal((await send('/api/auth/logout', { method: 'POST', origin: false,
      headers: { Origin: 'https://attacker.example.test' } })).status, 403);
    assert.equal((await send('/api/auth/csrf', { headers: { Origin: 'https://attacker.example.test' } })).status, 403);
    assert.equal(calls.logout.length, 0);
    assert.equal(calls.refresh.length, 0);
  });
});

test('login rate limiting ignores spoofed forwarded IPs and returns Retry-After', async () => {
  await withApi(async ({ send, calls }) => {
    await send('/api/auth/csrf');
    for (let i = 0; i < 2; i += 1) {
      assert.equal((await send('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'wrong' },
        headers: { 'X-Forwarded-For': `192.0.2.${i}` } })).status, 401);
    }
    const result = await send('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'wrong' },
      headers: { 'X-Forwarded-For': '192.0.2.99' } });
    assert.equal(result.status, 429);
    assert.ok(Number(result.headers.get('retry-after')) > 0);
    assert.equal(calls.login.length, 2);
  }, { loginLimit: 2, loginError: { status: 400 } });
});

test('missing sessions return 401; expired access can explicitly refresh without losing refresh cookies', async () => {
  await withApi(async ({ send, login, advance, jar, calls }) => {
    await send('/api/auth/csrf');
    assert.equal((await send('/api/me')).status, 401);
    await send('/api/auth/csrf');
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 401);
    await login();
    advance(61 * 1000);
    assert.equal((await send('/api/me')).status, 401);
    assert.ok(jar.has('avg_refresh'));
    const result = await send('/api/auth/refresh', { method: 'POST' });
    assert.equal(result.status, 200);
    assert.equal(result.body.user.id, user.id);
    assert.equal(calls.refresh.length, 1);
    assert.equal((await send('/api/me')).status, 200);
  }, { accessLifetimeSeconds: 60 });
});

test('customer/admin sessions securely renew after five idle minutes and expired access cookies', async () => {
  for (const role of ['customer', 'admin']) for (const remember of [false, true]) {
    await withApi(async ({ send, login, advance, jar, calls }) => {
      assert.equal((await login({ email: user.email, password: 'fabricated-password', remember })).status, 200);
      const sid = jar.get('avg_session');
      advance(5 * 60 * 1000); // Access TTL is 60s; no heartbeat/requests during idle.
      if (remember) jar.delete('avg_access'); // Browser expires persistent access cookie.
      assert.equal((await send('/api/me')).status, 401);
      assert.equal(jar.get('avg_session'), sid); assert.ok(jar.has('avg_refresh'));
      assert.equal((await send('/api/auth/refresh', { method: 'POST', origin: false })).status, 403);
      const refreshed = await send('/api/auth/refresh', { method: 'POST' });
      assert.equal(refreshed.status, 200); assert.equal(refreshed.body.user.role, role);
      assert.ok(refreshed.setCookies.every((cookie) => /HttpOnly/.test(cookie) && /SameSite=Strict/.test(cookie)));
      if (remember) assert.match(refreshed.setCookies.find((cookie) => cookie.startsWith('avg_session=')), /Max-Age=2591700;/);
      else assert.ok(refreshed.setCookies.every((cookie) => !/Max-Age=/.test(cookie)));
      assert.equal(calls.refresh.length, 1);
      assert.equal((await send('/api/me')).body.role, role);
    }, { role, accessLifetimeSeconds: 60 });
  }
});

test('transient idle refresh failure preserves cookies for retry and never extends the absolute deadline', async () => {
  await withApi(async ({ send, login, advance, jar, options }) => {
    await login({ email: user.email, password: 'fabricated-password', remember: true });
    const sid = jar.get('avg_session'), refresh = jar.get('avg_refresh');
    advance(5 * 60 * 1000); jar.delete('avg_access');
    options.refreshThrows = true;
    const failed = await send('/api/auth/refresh', { method: 'POST' }); assert.equal(failed.status, 503);
    assert.equal(jar.get('avg_session'), sid); assert.equal(jar.get('avg_refresh'), refresh);
    options.refreshThrows = false;
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 200);
    assert.equal((await send('/api/me')).status, 200);
    advance(30 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000 + 1);
    assert.equal((await send('/api/me')).status, 401);
    assert.equal(jar.size, 0);
  }, { role: 'admin', accessLifetimeSeconds: 60 });
});

test('concurrent refreshes rotate only once; stale parallel cookies converge within a short grace window', async () => {
  const started = deferred();
  const barrier = deferred();
  await withApi(async ({ login, send, jar, calls, advance }) => {
    await login();
    const stale = new Map(jar);
    const first = send('/api/auth/refresh', { method: 'POST', cookies: new Map(stale) });
    await started.promise;
    const second = send('/api/auth/refresh', { method: 'POST', cookies: new Map(stale) });
    barrier.resolve();
    const results = await Promise.all([first, second]);
    assert.ok(results.every((result) => result.status === 200));
    assert.equal(calls.refresh.length, 1);
    const retryJar = new Map(stale);
    assert.equal((await send('/api/auth/refresh', { method: 'POST', cookies: retryJar })).status, 200);
    assert.notEqual(retryJar.get('avg_refresh'), stale.get('avg_refresh'));
    assert.equal(calls.refresh.length, 1);
    advance(11000);
    assert.equal((await send('/api/auth/refresh', { method: 'POST', cookies: stale })).status, 401);
    assert.equal((await send('/api/me', { cookies: retryJar })).status, 200);
  }, { refreshStarted: started, refreshBarrier: barrier });
});

test('a delayed expired-access response cannot clear a newer rotated access cookie', async () => {
  const started = deferred(), barrier = deferred();
  await withApi(async ({ login, send, jar, advance }) => {
    await login(); advance(61 * 1000);
    const delayed = send('/api/me'); await started.promise;
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 200);
    const fresh = jar.get('avg_access'); barrier.resolve();
    assert.equal((await delayed).status, 401);
    assert.equal(jar.get('avg_access'), fresh, 'Stale response must not delete the new cookie');
    assert.equal((await send('/api/me')).status, 200);
  }, { accessLifetimeSeconds: 60, expiredLookupStarted: started, expiredLookupBarrier: barrier });
});

test('invalid/revoked refresh credentials clear cookies and reject subsequent session reads', async () => {
  await withApi(async ({ login, send, jar }) => {
    await login();
    const result = await send('/api/auth/refresh', { method: 'POST' });
    assert.equal(result.status, 401);
    assert.ok(result.setCookies.length === 4);
    assert.equal(jar.size, 0);
    assert.equal((await send('/api/me')).status, 401);
  }, { refreshError: { status: 400, message: 'private revoked refresh token' } });
});

test('absolute session expiry clears cookies; server memory is bounded', async () => {
  await withApi(async ({ login, send, advance, jar }) => {
    await login();
    advance(12 * 60 * 60 * 1000 + 1);
    assert.equal((await send('/api/me')).status, 401);
    assert.equal(jar.size, 0);
  });
  await withApi(async ({ login }) => { assert.equal((await login()).status, 503); }, { maxSessions: 0 });
});

test('logout revokes only the local provider session, clears cookies, and prevents replay', async () => {
  await withApi(async ({ login, send, calls, jar }) => {
    await login();
    const stolen = new Map(jar);
    const result = await send('/api/auth/logout', { method: 'POST' });
    assert.deepEqual(result.body, { ok: true });
    assert.equal(result.status, 200);
    assert.deepEqual(calls.logout, [{ scope: 'local' }]);
    assert.equal(jar.size, 0);
    assert.equal((await send('/api/me', { cookies: stolen })).status, 401);
    await send('/api/auth/csrf');
    assert.equal((await send('/api/auth/logout', { method: 'POST' })).status, 401);
  });
});

test('logout racing rotation wins; a delayed refresh cannot resurrect the app session', async () => {
  const started = deferred();
  const barrier = deferred();
  await withApi(async ({ login, send, jar, calls }) => {
    await login();
    const old = new Map(jar);
    const rotating = send('/api/auth/refresh', { method: 'POST', cookies: new Map(old) });
    await started.promise;
    const signingOut = send('/api/auth/logout', { method: 'POST', cookies: new Map(old) });
    // Observe the local close before releasing rotation; no timing-based sleep.
    let closed = false;
    for (let attempt = 0; attempt < 10 && !closed; attempt += 1) {
      closed = (await send('/api/me', { cookies: new Map(old) })).status === 401;
    }
    assert.equal(closed, true);
    barrier.resolve();
    assert.equal((await rotating).status, 401);
    assert.equal((await signingOut).status, 200);
    assert.equal(calls.setSession[0].refresh_token, 'fabricated-refresh-2');
    assert.equal((await send('/api/me', { cookies: old })).status, 401);
  }, { refreshStarted: started, refreshBarrier: barrier });
});

test('provider and DB failures are sanitized; logout failure still closes the app session', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  await withApi(async ({ login }) => { assert.equal((await login()).status, 503); }, { loginThrows: true });
  await withApi(async ({ login, send, jar }) => {
    await login();
    const result = await send('/api/auth/refresh', { method: 'POST' });
    assert.equal(result.status, 503);
    assert.doesNotMatch(JSON.stringify(result.body), /private|fabricated/);
    assert.ok(jar.has('avg_refresh'));
  }, { refreshThrows: true });
  await withApi(async ({ login, send, jar }) => {
    await login();
    const replay = new Map(jar);
    assert.equal((await send('/api/auth/logout', { method: 'POST' })).status, 503);
    assert.equal(jar.size, 0);
    assert.equal((await send('/api/me', { cookies: replay })).status, 401);
  }, { logoutThrows: true });
  await withApi(async ({ login }) => {
    assert.equal((await login()).body.code, 'DATABASE_UNAVAILABLE');
  }, { profileError: { message: 'private database token' } });
  assert.equal(log.mock.calls.length, 0);
});

test('a profile outage after rotation still synchronizes the rotated cookies for retry', async () => {
  await withApi(async ({ login, send, options, jar, calls }) => {
    await login();
    const previous = jar.get('avg_refresh');
    options.profileError = { message: 'private profile failure' };
    const result = await send('/api/auth/refresh', { method: 'POST' });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'DATABASE_UNAVAILABLE');
    assert.notEqual(jar.get('avg_refresh'), previous);
    options.profileError = null;
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 200);
    assert.equal(calls.refresh.length, 1);
  });
});

test('refresh must preserve the subject and a usable database role', async () => {
  await withApi(async ({ login, send, jar }) => {
    await login();
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 401);
    assert.equal(jar.size, 0);
  }, { wrongRefreshUser: true });
  await withApi(async ({ login, send, options, jar }) => {
    await login();
    options.role = 'superadmin';
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 403);
    assert.equal(jar.size, 0);
  });
});

test('expired CSRF protection requires a fresh bootstrap; production Origin must use HTTPS', async () => {
  await withApi(async ({ login, send, advance, jar }) => {
    await login({ email: user.email, password: 'fabricated', remember: true });
    const previous = jar.get('avg_csrf');
    for (let i = 0; i < 95; i++) {
      advance(15 * 60 * 1000);
      assert.equal((await send('/api/auth/activity', { method: 'POST', body: {} })).status, 200);
    }
    advance(15 * 60 * 1000 + 1);
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 403);
    assert.equal((await send('/api/auth/csrf')).status, 200);
    assert.notEqual(jar.get('avg_csrf'), previous);
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 200);
  }, { accessLifetimeSeconds: 48 * 60 * 60 });
  await withApi(async ({ send }) => {
    assert.equal((await send('/api/auth/csrf')).status, 503);
  }, { production: true, origin: 'http://localhost:5173' });
});

test('20-minute inactivity rejects customer/admin cookies and Bearer bypasses; polling and rotation never extend it', async () => {
  for (const role of ['customer', 'admin']) for (const remember of [false, true]) await withApi(async ({ login, send, advance, jar }) => {
    const logged = await login({ email: user.email, password: 'fabricated', remember });
    const deadline = logged.body.session.idleExpiresAt;
    const token = jar.get('avg_access');
    advance(19 * 60 * 1000);
    assert.equal((await send('/api/me')).body.session.idleExpiresAt, deadline);
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).body.session.idleExpiresAt, deadline);
    assert.equal((await send('/api/auth/idle', { method: 'POST', body: {} })).body.session.idleExpiresAt, deadline);
    assert.equal((await send('/api/admin/probe')).status, role === 'admin' ? 200 : 403);
    const stale = new Map(jar);
    advance(60 * 1000);
    const expired = await send('/api/me'); assert.equal(expired.status, 401); assert.equal(expired.body.code, 'SESSION_IDLE_EXPIRED');
    assert.equal(jar.size, 0);
    assert.equal((await send('/api/me', { cookies: stale, headers: { Authorization: `Bearer ${token}` } })).status, 401);
    assert.equal((await send('/api/admin/probe', { cookies: stale })).status, 401);
    assert.equal((await send('/api/me', { cookies: null, headers: { Authorization: `Bearer ${token}` } })).status, 401);
  }, { role, enforceAppSession: true });
});

test('only protected verified activity moves the shared server deadline; invalid requests and 503 do not', async () => {
  for (const role of ['customer', 'admin']) await withApi(async ({ login, send, advance, options }) => {
    const logged = await login(); const first = logged.body.session;
    advance(19 * 60 * 1000);
    for (const request of [{ origin: false }, { csrf: false }, { body: { idleExpiresAt: Number.MAX_SAFE_INTEGER } },
      { body: { elapsedMs: -1 } }, { body: { elapsedMs: 30001 } }])
      assert.ok([400, 403].includes((await send('/api/auth/activity', { method: 'POST', body: {}, ...request })).status));
    options.profileError = { message: 'private outage' };
    assert.equal((await send('/api/auth/activity', { method: 'POST', body: {} })).status, 503);
    options.profileError = null;
    assert.equal((await send('/api/auth/idle', { method: 'POST' })).body.session.idleExpiresAt, first.idleExpiresAt);
    const active = await send('/api/auth/activity', { method: 'POST', body: {} }); assert.equal(active.status, 200);
    assert.equal(active.body.session.idleExpiresAt, first.idleExpiresAt + 19 * 60 * 1000);
    assert.equal(active.body.session.absoluteExpiresAt, first.absoluteExpiresAt);
    advance(19 * 60 * 1000); assert.equal((await send('/api/me')).status, 200);
    advance(60 * 1000); assert.equal((await send('/api/me')).status, 401);
  }, { role, enforceAppSession: true });
});

test('a pending refresh cannot resurrect a session crossing its idle deadline', async () => {
  const started = deferred(), barrier = deferred();
  await withApi(async ({ login, send, advance, jar }) => {
    await login(); advance(19 * 60 * 1000);
    const pending = send('/api/auth/refresh', { method: 'POST' }); await started.promise;
    advance(60 * 1000); assert.equal((await send('/api/me')).status, 401);
    barrier.resolve(); assert.equal((await pending).status, 401); assert.equal(jar.size, 0);
  }, { refreshStarted: started, refreshBarrier: barrier });
});

test('explicit Bearer tokens are bound to the active application record on production private routes', async () => {
  await withApi(async ({ login, send, jar }) => {
    await login(); const token = jar.get('avg_access');
    assert.equal((await send('/api/me', { headers: { Authorization: `Bearer ${token}` } })).status, 200);
    assert.equal((await send('/api/me', { headers: { Authorization: 'Bearer another-token' } })).status, 401);
    assert.equal((await send('/api/me', { cookies: null, headers: { Authorization: `Bearer ${token}` } })).status, 401);
    assert.equal((await send('/api/me')).status, 200);
  }, { enforceAppSession: true });
});

test('coalesced activity age uses the real past event time and cannot accept a future client deadline', async () => {
  await withApi(async ({ login, send, advance }) => {
    const logged = await login(); advance(19 * 60 * 1000);
    const activity = await send('/api/auth/activity', { method: 'POST', body: { elapsedMs: 15000 } });
    assert.equal(activity.body.session.idleExpiresAt, logged.body.session.idleExpiresAt + 19 * 60 * 1000 - 15000);
    advance(20 * 60 * 1000 - 15001); assert.equal((await send('/api/me')).status, 200);
    advance(1); assert.equal((await send('/api/me')).status, 401);
  });
});

test('overlapping activity reports cannot move the server deadline backwards', async () => {
  const started = deferred(), barrier = deferred();
  await withApi(async ({ login, send, advance, options }) => {
    await login(); advance(10 * 60 * 1000);
    options.nextUserStarted = started; options.nextUserBarrier = barrier;
    const older = send('/api/auth/activity', { method: 'POST', body: {} }); await started.promise;
    advance(60 * 1000);
    const newer = await send('/api/auth/activity', { method: 'POST', body: {} });
    barrier.resolve(); const late = await older;
    assert.equal(late.status, 200); assert.equal(late.body.session.idleExpiresAt, newer.body.session.idleExpiresAt);
  });
});
