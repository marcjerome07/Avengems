import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createAuthClientFactory, createAccessTokenVerifier } from '../src/auth.js';
import { createCookieSessions } from '../src/sessions.js';
import { createRecovery } from '../src/recovery.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { createMeRouter } from '../src/routes/me.js';
import { errorHandler } from '../src/errors.js';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'customer@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };
const password = 'FabricatedNew1!';
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

async function withApi(run, options = {}) {
  let time = Date.parse('2026-10-30T00:00:00Z');
  let clientId = 0;
  const calls = [];
  const session = (kind) => ({ access_token: `fabricated-${kind}-access`, refresh_token: `fabricated-${kind}-refresh`, expires_at: time / 1000 + 3600 });
  const clientFactory = () => {
    const id = ++clientId;
    function method(name, fallback) {
      return async (input) => {
        calls.push({ id, name, input });
        options[`${name}Started`]?.resolve();
        if (options[`${name}Barrier`]) await options[`${name}Barrier`].promise;
        if (options.throws === name) throw new Error('private token password detail');
        return options[name] ?? (typeof fallback === 'function' ? fallback(input) : fallback);
      };
    }
    return { auth: {
      resetPasswordForEmail: method('send', { data: {}, error: null }),
      verifyOtp: method('verify', () => ({ data: { user, session: session('recovery') }, error: null })),
      setSession: method('establish', () => ({ data: { user, session: session('recovery') }, error: null })),
      getUser: method('identity', (token) => ({ data: { user: token.startsWith('fabricated-') ? user : null }, error: token.startsWith('fabricated-') ? null : { status: 401 } })),
      updateUser: method('update', { data: { user }, error: null }),
      signOut: method('signOut', { error: null }),
      admin: { signOut: (token, scope) => {
        assert.equal(token, 'fabricated-recovery-access');
        return method('signOut', { error: null })({ scope });
      } },
      signInWithPassword: method('login', () => ({ data: { user, session: session('normal') }, error: null })),
      refreshSession: method('refresh', () => ({ data: { user, session: session('normal') }, error: null })),
    } };
  };
  const config = { url: 'https://example.supabase.co', publishableKey: 'fabricated-key', clientFactory };
  const publicUser = { ...user, name: 'Customer', role: 'customer', verified: true, phone: '', createdAt: '2026-01-01T00:00:00Z' };
  const cookies = createCookieSessions({ createAuthClient: createAuthClientFactory(config), loadUser: async () => publicUser,
    origin: 'http://localhost:5173', now: () => time });
  const recovery = createRecovery({ createAuthClient: createAuthClientFactory(config), cookieSessions: cookies,
    now: () => time, production: options.production, sendLimit: options.sendLimit ?? 100, verifyLimit: options.verifyLimit ?? 100 });
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
    id: user.id, name: 'Customer', phone: null, role: 'customer', created_at: '2026-01-01T00:00:00Z',
  }, error: null }) }) }) }) };
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(cookies, undefined, recovery));
  app.use('/api/me', createMeRouter({ client: db, verifyAccessToken: async (token) => {
    recovery.assertNormalAccessToken(token);
    return createAccessTokenVerifier(config)(token);
  }, cookieSessions: cookies }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  async function send(path, { method = 'POST', body, origin = true, csrf = true, useJar = jar, headers = {} } = {}) {
    const requestHeaders = { ...headers, Cookie: [...useJar].map(([key, value]) => `${key}=${value}`).join('; ') };
    if (method === 'POST') {
      if (origin) requestHeaders.Origin = 'http://localhost:5173';
      if (csrf) requestHeaders['X-CSRF-Token'] = useJar.get('avg_csrf') ?? '';
      requestHeaders['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${base}${path}`, { method, headers: requestHeaders,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });
    const setCookies = response.headers.getSetCookie();
    for (const cookie of setCookies) {
      const pair = cookie.split(';')[0];
      const index = pair.indexOf('=');
      const key = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (!value) useJar.delete(key); else useJar.set(key, value);
    }
    return { status: response.status, body: await response.json(), headers: response.headers, setCookies };
  }
  const bootstrap = (useJar = jar) => send('/api/auth/csrf', { method: 'GET', useJar });
  const verify = (useJar = jar) => send('/api/auth/verify-recovery', { body: { email: user.email, code: '123456' }, useJar });
  await bootstrap();
  try { await run({ send, bootstrap, verify, jar, calls, options, advance: (ms) => { time += ms; } }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('forgot-password uses resetPasswordForEmail and hides absent accounts and provider delivery limits', async () => {
  let expected;
  for (const sendResult of [null, { error: { status: 404, code: 'user_not_found' } },
    { error: { status: 429, code: 'over_email_send_rate_limit' } }, { error: { status: 403, code: 'email_address_not_authorized' } }]) {
    await withApi(async ({ send, calls }) => {
      const result = await send('/api/auth/forgot-password', { body: { email: ' CUSTOMER@example.test ' } });
      assert.equal(result.status, 202);
      expected ??= result.body;
      assert.deepEqual(result.body, expected);
      assert.deepEqual(calls[0], { id: 1, name: 'send', input: user.email });
      assert.doesNotMatch(JSON.stringify(result.body), /token|password|11111111/);
      assert.equal(result.headers.get('cache-control'), 'no-store');
    }, sendResult ? { send: sendResult } : {});
  }
});

test('CSRF/Origin and uniform resend/attempt limits protect every recovery write', async () => {
  await withApi(async ({ send, calls }) => {
    for (const path of ['/forgot-password', '/verify-recovery', '/reset-password']) {
      assert.equal((await send(`/api/auth${path}`, { origin: false })).status, 403);
      assert.equal((await send(`/api/auth${path}`, { csrf: false })).status, 403);
    }
    assert.equal(calls.length, 0);
    assert.equal((await send('/api/auth/forgot-password', { body: { email: user.email } })).status, 202);
    const limited = await send('/api/auth/forgot-password', { body: { email: user.email } });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('Retry-After'), '60');
  });
  await withApi(async ({ verify }) => {
    assert.equal((await verify()).status, 200);
    assert.equal((await verify()).status, 429);
  }, { verifyLimit: 1 });
});

test('provider recovery OTP creates only a short-lived opaque HttpOnly authorization, never an app session', async () => {
  await withApi(async ({ verify, send, bootstrap, calls, jar }) => {
    const result = await verify();
    assert.deepEqual(result.body, { verified: true, expiresIn: 300 });
    assert.deepEqual(calls[0].input, { email: user.email, token: '123456', type: 'recovery' });
    assert.equal(result.setCookies.length, 1);
    assert.match(result.setCookies[0], /^avg_recovery=/);
    assert.match(result.setCookies[0], /HttpOnly/);
    assert.match(result.setCookies[0], /SameSite=Strict/);
    assert.match(result.setCookies[0], /Path=\/api\/auth\/reset-password/);
    assert.doesNotMatch(result.setCookies[0], /fabricated/);
    assert.equal(jar.has('avg_access'), false);
    assert.equal((await send('/api/me', { method: 'GET', headers: { Authorization: 'Bearer fabricated-recovery-access' } })).status, 401);
    assert.equal((await send('/api/me', { method: 'GET' })).status, 401);
    await bootstrap();
    assert.equal((await send('/api/auth/refresh')).status, 401);
    assert.ok(jar.has('avg_recovery'));
  });
});

test('invalid/expired OTP and arbitrary identities cannot authorize a password update', async () => {
  await withApi(async ({ verify, jar }) => {
    const result = await verify();
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'INVALID_CODE');
    assert.equal(jar.has('avg_recovery'), false);
  }, { verify: { data: {}, error: { status: 403, message: 'private expired token' } } });
  await withApi(async ({ send, calls }) => {
    for (const body of [{ email: user.email, code: 123456 }, { email: user.email, code: '123' },
      { email: user.email, code: '123456', userId: user.id }, { email: user.email, code: '123456', type: 'email' }]) {
      assert.equal((await send('/api/auth/verify-recovery', { body })).status, 400);
    }
    assert.equal((await send('/api/auth/reset-password', { body: { password, userId: user.id } })).status, 400);
    assert.equal(calls.length, 0);
  });
});

test('reset requires recovery authorization; normal customer cookies and forged IDs are insufficient', async () => {
  await withApi(async ({ send, calls, jar }) => {
    assert.equal((await send('/api/auth/reset-password', { body: { password } })).status, 401);
    assert.equal(calls.length, 0);
    assert.equal((await send('/api/auth/login', { body: { email: user.email, password } })).status, 200);
    assert.ok(jar.has('avg_access'));
    assert.equal((await send('/api/auth/reset-password', { body: { password } })).status, 401);
    assert.equal(calls.filter((call) => call.name === 'update').length, 0);
  });
});

test('successful reset uses session-bound updateUser, globally signs out, clears cookies and rejects replay', async () => {
  await withApi(async ({ verify, send, bootstrap, calls, jar }) => {
    await verify();
    const replay = new Map(jar);
    const result = await send('/api/auth/reset-password', { body: { password } });
    assert.deepEqual(result.body, { ok: true, signInRequired: true, sessionRevocationConfirmed: true });
    assert.equal(result.status, 200);
    assert.deepEqual(calls.find((call) => call.name === 'update').input, { password });
    assert.deepEqual(calls.at(-1).input, { scope: 'global' });
    assert.equal(jar.size, 0);
    await bootstrap(replay);
    assert.equal((await send('/api/auth/reset-password', { body: { password }, useJar: replay })).status, 401);
    assert.equal(calls.filter((call) => call.name === 'update').length, 1);
  });
});

test('expired authorization and concurrent replay attempts cannot update twice', async () => {
  await withApi(async ({ verify, send, advance, calls }) => {
    await verify();
    advance(300001);
    assert.equal((await send('/api/auth/reset-password', { body: { password } })).status, 401);
    assert.equal(calls.filter((call) => call.name === 'update').length, 0);
  });
  const started = deferred();
  const barrier = deferred();
  await withApi(async ({ verify, send, jar, calls }) => {
    await verify();
    const replay = new Map(jar);
    const first = send('/api/auth/reset-password', { body: { password } });
    await started.promise;
    const second = await send('/api/auth/reset-password', { body: { password }, useJar: replay });
    assert.equal(second.status, 401);
    barrier.resolve();
    assert.equal((await first).status, 200);
    assert.equal(calls.filter((call) => call.name === 'update').length, 1);
  }, { updateStarted: started, updateBarrier: barrier });
});

test('reset invalidates all matching app sessions and a late login cannot resurrect one', async () => {
  await withApi(async ({ send, verify, bootstrap, jar }) => {
    await send('/api/auth/login', { body: { email: user.email, password } });
    const otherDevice = new Map(jar);
    await verify();
    assert.equal((await send('/api/auth/reset-password', { body: { password } })).status, 200);
    assert.equal((await send('/api/me', { method: 'GET', useJar: otherDevice })).status, 401);
    await bootstrap(otherDevice);
    assert.equal((await send('/api/auth/refresh', { useJar: otherDevice })).status, 401);
  });
  const started = deferred();
  const barrier = deferred();
  await withApi(async ({ send, verify, jar }) => {
    await verify();
    const loginJar = new Map(jar);
    const login = send('/api/auth/login', { body: { email: user.email, password }, useJar: loginJar });
    await started.promise;
    assert.equal((await send('/api/auth/reset-password', { body: { password } })).status, 200);
    barrier.resolve();
    assert.equal((await login).status, 401);
    assert.equal((await send('/api/me', { method: 'GET', useJar: loginJar })).status, 401);
  }, { loginStarted: started, loginBarrier: barrier });
});

test('weak provider passwords and uncertain updates consume authorization; revocation failure is explicit', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  await withApi(async ({ verify, send, calls }) => {
    await verify();
    assert.equal((await send('/api/auth/reset-password', { body: { password: 'weak' } })).status, 400);
    assert.equal(calls.filter((call) => call.name === 'update').length, 0);
  });
  for (const options of [{ update: { error: { status: 422, code: 'weak_password' } } }, { throws: 'update' }]) {
    await withApi(async ({ verify, send, bootstrap, jar, calls }) => {
      await verify();
      const replay = new Map(jar);
      const result = await send('/api/auth/reset-password', { body: { password } });
      assert.ok([400, 503].includes(result.status));
      assert.doesNotMatch(JSON.stringify(result.body), /private|fabricated/);
      await bootstrap(replay);
      assert.equal((await send('/api/auth/reset-password', { body: { password }, useJar: replay })).status, 401);
      assert.equal(calls.filter((call) => call.name === 'update').length, 1);
    }, options);
  }
  await withApi(async ({ verify, send }) => {
    await verify();
    const result = await send('/api/auth/reset-password', { body: { password } });
    assert.equal(result.status, 200);
    assert.equal(result.body.sessionRevocationConfirmed, false);
  }, { signOut: { error: { status: 503, message: 'private revoke failure' } } });
  assert.equal(log.mock.calls.length, 0);
});

test('installed SDK transports the template OTP as recovery and updates with the user JWT, not admin privileges', async () => {
  const requests = [];
  const access = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fabricated-signature`;
  const client = createClient('https://example.supabase.co', 'fabricated-publishable', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, method: init.method, body: init.body && JSON.parse(init.body), headers: new Headers(init.headers) });
      if (url.endsWith('/recover')) return Response.json({});
      if (url.endsWith('/verify')) return Response.json({ access_token: access, refresh_token: 'fabricated-refresh', expires_in: 3600, token_type: 'bearer', user });
      return Response.json({ user });
    } },
  });
  await client.auth.resetPasswordForEmail(user.email);
  assert.equal((await client.auth.verifyOtp({ email: user.email, token: '123456', type: 'recovery' })).error, null);
  assert.equal((await client.auth.updateUser({ password })).error, null);
  assert.equal((await client.auth.admin.signOut(access, 'global')).error, null);
  assert.equal(requests[0].url, 'https://example.supabase.co/auth/v1/recover');
  assert.equal(requests[1].body.type, 'recovery');
  assert.equal(requests[2].method, 'PUT');
  assert.equal(requests[2].headers.get('Authorization'), `Bearer ${access}`);
  assert.equal(requests[2].headers.get('apikey'), 'fabricated-publishable');
  assert.equal(requests[3].url, 'https://example.supabase.co/auth/v1/logout?scope=global');
  assert.equal(requests[3].headers.get('Authorization'), `Bearer ${access}`);
  assert.ok(requests.every((request) => !request.url.includes('/admin')));
});

test('CSRF rejection does not consume authorization; a newer verified flow invalidates the old one', async () => {
  await withApi(async ({ verify, send, jar, bootstrap }) => {
    await verify();
    assert.equal((await send('/api/auth/reset-password', { body: { password }, csrf: false })).status, 403);
    const old = new Map(jar);
    await verify();
    assert.notEqual(jar.get('avg_recovery'), old.get('avg_recovery'));
    assert.equal((await send('/api/auth/reset-password', { body: { password }, useJar: old })).status, 401);
    await bootstrap();
    assert.equal((await send('/api/auth/reset-password', { body: { password } })).status, 200);
  });
  const started = deferred();
  const barrier = deferred();
  await withApi(async ({ verify, send, jar, options }) => {
    await verify();
    options.verifyStarted = started;
    options.verifyBarrier = barrier;
    const pending = verify(new Map(jar));
    await started.promise;
    assert.equal((await send('/api/auth/reset-password', { body: { password } })).status, 200);
    barrier.resolve();
    assert.equal((await pending).status, 401);
  });
});

test('production recovery cookies are Secure; recovery never sets a provider token cookie', async () => {
  await withApi(async ({ verify }) => {
    const result = await verify();
    assert.equal(result.status, 200);
    assert.match(result.setCookies[0], /^__Secure-avg_recovery=/);
    assert.match(result.setCookies[0], /; Secure/);
    assert.match(result.setCookies[0], /Max-Age=300/);
    assert.doesNotMatch(result.setCookies[0], /fabricated|avg_access|avg_refresh|Domain=/);
  }, { production: true });
});

test('an in-flight app refresh cannot restore a session after reset', async () => {
  const started = deferred();
  const barrier = deferred();
  await withApi(async ({ send, verify, jar }) => {
    await send('/api/auth/login', { body: { email: user.email, password } });
    await verify();
    const old = new Map(jar);
    const refresh = send('/api/auth/refresh', { useJar: old });
    await started.promise;
    const reset = send('/api/auth/reset-password', { body: { password } });
    let closed = false;
    for (let i = 0; i < 10 && !closed; i += 1) {
      closed = (await send('/api/me', { method: 'GET', useJar: new Map(old) })).status === 401;
    }
    assert.equal(closed, true);
    barrier.resolve();
    assert.equal((await refresh).status, 401);
    assert.equal((await reset).status, 200);
    assert.equal((await send('/api/me', { method: 'GET', useJar: old })).status, 401);
  }, { refreshStarted: started, refreshBarrier: barrier });
});
