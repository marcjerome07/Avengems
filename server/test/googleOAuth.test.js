import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createAuthClientFactory, createOAuthClientFactory, createAccessTokenVerifier } from '../src/auth.js';
import { createGoogleOAuth, OAUTH_LIFETIME_MS } from '../src/googleOAuth.js';
import { createCookieSessions, SESSION_IDLE_MS } from '../src/sessions.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { createRequireAuth } from '../src/middleware/auth.js';
import { ApiError, errorHandler } from '../src/errors.js';

const origin = 'http://localhost:5173';
const supabaseUrl = 'https://provider.example.test';
const defaultUser = { id: '11111111-1111-4111-8111-111111111111', email: 'google@example.test',
  email_confirmed_at: '2026-01-01T00:00:00Z', identities: [{ provider: 'google' }],
  user_metadata: { name: 'Google Customer', role: 'admin' } };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { resolve, promise }; };

// Real Supabase SDK and real Express routes, with ALL provider HTTP calls replaced.
async function withOAuth(run, options = {}) {
  let time = Date.now(), sequence = 0;
  const calls = { exchange: [], signout: 0, refresh: 0, profiles: [] };
  const codes = new Map(), tokens = new Map(), jar = new Map(), persistent = new Map();
  const appOrigin = options.production ? 'https://store.example.test' : origin;
  const user = () => options.user ?? defaultUser;
  function session(subject = user()) {
    sequence += 1;
    const payload = Buffer.from(JSON.stringify({ sub: subject.id, exp: Math.floor(time / 1000) + 3600 })).toString('base64url');
    const access = `eyJhbGciOiJIUzI1NiJ9.${payload}.fabricated-${sequence}`;
    tokens.set(access, subject);
    return { access_token: access, refresh_token: `fabricated-refresh-${sequence}`, token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(time / 1000) + 3600, user: subject };
  }
  const providerFetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(url.origin, supabaseUrl, 'No real network/provider requests');
    if (url.pathname === '/auth/v1/token') {
      const body = JSON.parse(init.body);
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        calls.refresh += 1;
        return options.refreshRevoked ? Response.json({ msg: 'Revoked' }, { status: 400 }) : Response.json(session());
      }
      calls.exchange.push(body);
      const allowed = codes.get(body.auth_code);
      codes.delete(body.auth_code);
      assert.ok(body.code_verifier, 'PKCE verifier must stay on the server and reach the token endpoint');
      const challenge = createHash('sha256').update(body.code_verifier).digest('base64url');
      if (!allowed || allowed.challenge !== challenge) return Response.json({ msg: 'Invalid code/verifier' }, { status: 400 });
      options.exchangeStarted?.resolve();
      if (options.exchangeBarrier) await options.exchangeBarrier.promise;
      return Response.json(session(allowed.user));
    }
    if (url.pathname === '/auth/v1/user') {
      const headers = new Headers(init.headers);
      const subject = tokens.get(headers.get('authorization')?.replace(/^Bearer /, ''));
      return subject ? Response.json(subject) : Response.json({ msg: 'Unauthorized' }, { status: 401 });
    }
    if (url.pathname === '/auth/v1/logout') { calls.signout += 1; return new Response(null, { status: 204 }); }
    throw new Error(`Unexpected provider path: ${url.pathname}`);
  };
  const config = { url: supabaseUrl, publishableKey: 'fabricated-key', clientFactory: (url, key, settings) =>
    createClient(url, key, { ...settings, global: { fetch: providerFetch } }) };
  async function loadUser(subject) {
    calls.profiles.push(subject.id);
    if (options.profileError) throw new ApiError(403, 'PROFILE_UNAVAILABLE', 'Profile unavailable.');
    return { id: subject.id, email: subject.email, name: 'DB Name', verified: Boolean(subject.email_confirmed_at),
      role: options.role ?? 'customer' };
  }
  let sessions, oauth;
  function setup() {
    sessions = createCookieSessions({ createAuthClient: createAuthClientFactory(config), loadUser,
      origin: appOrigin, production: options.production, now: () => time });
    oauth = createGoogleOAuth({ createOAuthClient: createOAuthClientFactory(options.missingConfig ? {} : config), cookieSessions: sessions,
      origin: appOrigin, supabaseUrl, production: options.production, now: () => time, maxAttempts: options.maxAttempts });
  }
  setup();
  const app = express();
  app.use(express.json());
  app.use('/api/auth', (req, res, next) => createAuthRouter(sessions, undefined, undefined, oauth)(req, res, next));
  app.use('/api/me', (req, res, next) => sessions.requireSession(req, res, next),
    (req, res, next) => createRequireAuth(createAccessTokenVerifier(config), { cookieSessions: sessions })(req, res, next));
  app.get('/api/me', async (req, res) => res.json({ ...(await loadUser({ ...user(), id: req.auth.userId })), session: sessions.metadata(req, res) }));
  app.get('/api/admin/probe', (req, res, next) => sessions.requireSession(req, res, next),
    async (_req, res) => {
      if ((options.role ?? 'customer') !== 'admin') throw new ApiError(403, 'ADMIN_REQUIRED', 'Admin required.');
      res.json({ ok: true });
    });
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  async function send(path, { method = 'GET', body, cookies = jar, headers = {}, csrf = true, trustedOrigin = true } = {}) {
    const requestHeaders = { ...headers, Cookie: [...cookies].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('; ') };
    if (method === 'POST') {
      if (trustedOrigin) requestHeaders.Origin = appOrigin;
      if (csrf) requestHeaders['X-CSRF-Token'] = cookies.get(options.production ? '__Host-avg_csrf' : 'avg_csrf') ?? '';
      requestHeaders['Content-Type'] = 'application/json';
    }
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: requestHeaders, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookies = response.headers.getSetCookie();
    for (const cookie of setCookies) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('='), name = pair.slice(0, index), value = decodeURIComponent(pair.slice(index + 1));
      if (!value) { cookies.delete(name); persistent.delete(name); }
      else { cookies.set(name, value); persistent.set(name, /Max-Age=/.test(cookie)); }
    }
    return { status: response.status, location: response.headers.get('location')?.replace(/#$/, ''), setCookies,
      headers: response.headers, body: response.status === 303 ? null : await response.json() };
  }
  async function start(remember = true) {
    await send('/api/auth/csrf');
    const result = await send('/api/auth/google', { method: 'POST', body: { remember } });
    assert.equal(result.status, 200);
    const url = new URL(result.body.url);
    const callback = new URL(url.searchParams.get('redirect_to'));
    assert.equal(callback.origin, appOrigin);
    const code = `fabricated-code-${codes.size}-${sequence}`;
    codes.set(code, { challenge: url.searchParams.get('code_challenge'), user: user() });
    return { result, url, callback: `${callback.pathname}?code=${code}`, path: callback.pathname };
  }
  const restart = () => { oauth.dispose(); setup(); };
  try { await run({ send, start, jar, calls, options, restart, invalidate: () => sessions.invalidateUser(user().id, user().email),
    advance: (ms) => { time += ms; }, restartBrowser: () => {
      for (const name of jar.keys()) if (!persistent.get(name)) jar.delete(name);
    } }); }
  finally { oauth.dispose(); await new Promise((done) => server.close(done)); }
}

test('Google new/existing customer uses real SDK PKCE, trusted profile and existing cookie sessions', async () => {
  for (const remember of [false, true]) await withOAuth(async ({ start, send, calls, jar, restartBrowser }) => {
    const begun = await start(remember);
    assert.equal(begun.url.searchParams.get('code_challenge_method'), 's256');
    assert.doesNotMatch(JSON.stringify(begun.result.body), /code_verifier|access_token|refresh_token/);
    // Only the Lax binding is available on a real cross-site callback.
    const callbackJar = new Map([['avg_google', jar.get('avg_google')]]);
    const result = await send(begun.callback, { cookies: callbackJar });
    for (const [key, value] of callbackJar) jar.set(key, value);
    assert.equal(result.location, `${origin}/account`);
    assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(result.headers.get('location').endsWith('#'), 'Do not inherit provider fragments');
    assert.equal(calls.exchange.length, 1);
    assert.deepEqual(calls.profiles, [defaultUser.id]);
    assert.equal(result.setCookies.length, 5); // access, refresh, session, Remember Me marker, csrf
    assert.ok(result.setCookies.every((cookie) => /HttpOnly/.test(cookie) && /SameSite=Strict/.test(cookie)));
    assert.equal(result.setCookies.every((cookie) => /Max-Age=/.test(cookie)), remember);
    assert.equal((await send('/api/admin/probe')).status, 403, 'Google role metadata cannot create admin');
    const me = await send('/api/me');
    assert.equal(me.body.role, 'customer'); assert.equal(me.body.name, 'DB Name');
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 200);
    restartBrowser();
    assert.equal((await send('/api/me')).status, remember ? 200 : 401);
    // Existing Google customer login follows the same subject/profile path.
    const again = await start(remember);
    assert.equal((await send(again.callback)).location, `${origin}/account`);
    const stolen = new Map(jar);
    assert.equal((await send('/api/auth/logout', { method: 'POST' })).status, 200);
    assert.equal((await send('/api/me', { cookies: stolen })).status, 401);
    assert.ok(calls.signout > 0);
  });
});

test('trusted database admin role remains authoritative and production cookies remain Secure', async () => {
  await withOAuth(async ({ start, send }) => {
    const begun = await start(false);
    assert.match(begun.result.setCookies.at(-1), /__Host-avg_google=.*HttpOnly; Secure; SameSite=Lax/);
    const result = await send(begun.callback);
    assert.equal(result.location, 'https://store.example.test/admin');
    assert.ok(result.setCookies.every((cookie) => /HttpOnly; Secure; SameSite=Strict/.test(cookie) && !/Max-Age=/.test(cookie)));
    assert.equal((await send('/api/admin/probe')).status, 200);
  }, { production: true, role: 'admin' });
});

test('callback state, browser binding, PKCE substitution and replay fail closed', async () => {
  await withOAuth(async ({ start, send, jar, calls }) => {
    const first = await start();
    assert.match((await send('/api/auth/google/callback/forged?code=forged')).location, /oauth=invalid$/);
    assert.match((await send(first.callback, { cookies: new Map() })).location, /oauth=invalid$/);
    const duplicated = new Map(jar);
    assert.match((await send(first.callback, { cookies: duplicated })).location, /\/account$/);
    assert.match((await send(first.callback)).location, /oauth=invalid$/);
    assert.equal(calls.exchange.length, 1);
    const second = await start();
    const third = await start(); // Cancels second and replaces browser binding.
    assert.match((await send(second.callback)).location, /oauth=invalid$/);
    const substitutedCode = new URL(`http://test${second.callback}`).searchParams.get('code');
    assert.match((await send(`${third.path}?code=${substitutedCode}`)).location, /oauth=failed$/);
    assert.match((await send(third.callback)).location, /oauth=invalid$/);
  });
});

test('denial, cancellation, expiry, malformed callbacks and server restart never install a session', async () => {
  for (const kind of ['denied', 'no-code', 'cancel', 'expired', 'restart', 'duplicate-code', 'token-url']) {
    await withOAuth(async ({ start, send, advance, restart, calls }) => {
      const begun = await start();
      let path = begun.callback;
      if (kind === 'denied') path = `${begun.path}?error=access_denied&error_description=untrusted`;
      if (kind === 'no-code') path = begun.path;
      if (kind === 'cancel') await send('/api/auth/google/cancel', { method: 'POST', body: {} });
      if (kind === 'expired') advance(OAUTH_LIFETIME_MS);
      if (kind === 'restart') restart();
      if (kind === 'duplicate-code') path += '&code=another';
      if (kind === 'token-url') path += '&access_token=forged';
      const result = await send(path);
      assert.match(result.location, /\/login\?oauth=(denied|invalid|expired)$/);
      assert.doesNotMatch(result.location, /untrusted|forged|access_token/);
      assert.ok(result.headers.get('location').endsWith('#'));
      assert.equal(calls.exchange.length, 0);
      assert.equal((await send('/api/me')).status, 401);
    });
  }
});

test('initiation/cancellation require CSRF and Origin, reject role/redirect injection, and bound storage', async () => {
  await withOAuth(async ({ send }) => {
    await send('/api/auth/csrf');
    for (const path of ['/api/auth/google', '/api/auth/google/cancel']) {
      assert.equal((await send(path, { method: 'POST', body: { remember: true }, csrf: false })).status, 403);
      assert.equal((await send(path, { method: 'POST', body: { remember: true }, trustedOrigin: false })).status, 403);
      assert.equal((await send(path, { method: 'POST', body: { remember: true }, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    }
    for (const body of [{}, { remember: 'true' }, { remember: true, role: 'admin' },
      { remember: true, redirectTo: 'https://attacker.example' }, { remember: true, userId: defaultUser.id }]) {
      assert.equal((await send('/api/auth/google', { method: 'POST', body })).status, 400);
    }
    assert.equal((await send('/api/auth/google', { method: 'POST', body: { remember: true } })).status, 503);
  }, { maxAttempts: 0 });
});

test('verified Supabase subject alone selects the profile; unverified/missing Google identities and unusable profiles fail closed', async () => {
  for (const subject of [{ ...defaultUser, email_confirmed_at: null }, { ...defaultUser, identities: [{ provider: 'email' }] }]) {
    await withOAuth(async ({ start, send, calls }) => {
      assert.match((await send((await start()).callback)).location, /oauth=failed$/);
      assert.equal(calls.profiles.length, 0);
      assert.equal((await send('/api/me')).status, 401);
      assert.equal(calls.signout, 1);
    }, { user: subject });
  }
  await withOAuth(async ({ start, send }) => {
    assert.match((await send((await start()).callback)).location, /oauth=failed$/);
    assert.equal((await send('/api/me')).status, 401);
  }, { profileError: true });
  // Models the provider's linked account response, not an app-side email merge.
  const linked = { ...defaultUser, id: '22222222-2222-4222-8222-222222222222',
    identities: [{ provider: 'email' }, { provider: 'google' }] };
  await withOAuth(async ({ start, send, calls }) => {
    await send((await start()).callback);
    assert.equal((await send('/api/me')).body.id, linked.id);
    assert.ok(calls.profiles.every((id) => id === linked.id));
  }, { user: linked });
});

test('Google sessions retain 20-minute inactivity, genuine activity renewal and fixed absolute limits in both modes', async () => {
  for (const remember of [false, true]) await withOAuth(async ({ start, send, advance }) => {
    await send((await start(remember)).callback);
    const initial = (await send('/api/me')).body.session;
    assert.equal(initial.absoluteExpiresAt - initial.serverNow, (remember ? 30 * 24 : 12) * 3600000);
    advance(19 * 60000);
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).body.session.idleExpiresAt, initial.idleExpiresAt);
    assert.equal((await send('/api/auth/idle', { method: 'POST' })).body.session.idleExpiresAt, initial.idleExpiresAt);
    const active = await send('/api/auth/activity', { method: 'POST', body: {} });
    assert.equal(active.body.session.idleExpiresAt, initial.idleExpiresAt + 19 * 60000);
    assert.equal(active.body.session.absoluteExpiresAt, initial.absoluteExpiresAt);
    advance(SESSION_IDLE_MS);
    assert.equal((await send('/api/me')).body.code, 'SESSION_IDLE_EXPIRED');
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 403); // Cookies cleared, including CSRF.
  });
});

test('session fixation is prevented and logout/cancel wins over an in-flight callback', async () => {
  await withOAuth(async ({ start, send, jar }) => {
    await send((await start()).callback);
    const old = new Map(jar);
    const next = await start();
    // Cross-site callback cannot send the old Strict authentication cookie.
    const callbackJar = new Map([['avg_google', jar.get('avg_google')]]);
    await send(next.callback, { cookies: callbackJar });
    assert.notEqual(callbackJar.get('avg_session'), old.get('avg_session'));
    assert.equal((await send('/api/me', { cookies: old })).status, 401);
  });
  const started = deferred(), barrier = deferred();
  await withOAuth(async ({ start, send, calls }) => {
    const begun = await start();
    const pending = send(begun.callback);
    await started.promise;
    await send('/api/auth/logout', { method: 'POST' }); // No current session: still cancels the pending OAuth attempt.
    barrier.resolve();
    assert.match((await pending).location, /oauth=failed$/);
    assert.equal((await send('/api/me')).status, 401);
    assert.ok(calls.signout >= 1);
  }, { exchangeStarted: started, exchangeBarrier: barrier });
});

test('pending callbacks cannot outlive cancellation, expiry or account revocation, and concurrent replay cannot exchange twice', async () => {
  for (const outcome of ['replay', 'expiry', 'revocation', 'new-attempt']) {
    const started = deferred(), barrier = deferred();
    await withOAuth(async ({ start, send, advance, invalidate, jar, calls }) => {
      const begun = await start();
      const pending = send(begun.callback);
      await started.promise;
      let binding;
      if (outcome === 'replay') assert.match((await send(begun.callback)).location, /oauth=invalid$/);
      if (outcome === 'expiry') advance(OAUTH_LIFETIME_MS);
      if (outcome === 'revocation') await invalidate();
      if (outcome === 'new-attempt') { await start(); binding = jar.get('avg_google'); }
      barrier.resolve();
      const result = await pending;
      assert.equal(calls.exchange.length, 1);
      assert.equal(result.location, outcome === 'replay' ? `${origin}/account` : `${origin}/login?oauth=failed`);
      if (binding) assert.equal(jar.get('avg_google'), binding, 'Old callback cannot erase the new browser binding');
      assert.equal((await send('/api/me')).status, outcome === 'replay' ? 200 : 401);
    }, { exchangeStarted: started, exchangeBarrier: barrier });
  }
});

test('missing OAuth configuration fails safely and existing profile trigger defaults new Google users to customer', async () => {
  await withOAuth(async ({ send, calls }) => {
    await send('/api/auth/csrf');
    const result = await send('/api/auth/google', { method: 'POST', body: { remember: true } });
    assert.equal(result.status, 503); assert.equal(result.body.code, 'GOOGLE_UNAVAILABLE');
    assert.equal(calls.exchange.length, 0);
  }, { missingConfig: true });
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /role text not null default 'customer'/);
  const trigger = schema.slice(schema.indexOf('create function public.handle_new_user()'), schema.indexOf('create table addresses'));
  assert.match(trigger, /insert into public.profiles \(id, name\)/);
  assert.match(trigger, /after insert on auth.users/);
  assert.doesNotMatch(trigger, /->>\s*'role'/);
});

test('Google refresh revocation clears app authentication', async () => {
  await withOAuth(async ({ start, send, options }) => {
    await send((await start()).callback);
    options.refreshRevoked = true;
    assert.equal((await send('/api/auth/refresh', { method: 'POST' })).status, 401);
    assert.equal((await send('/api/me')).status, 401);
  });
});
