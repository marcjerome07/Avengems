import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createAuthClientFactory } from '../src/auth.js';
import { createRegistration } from '../src/registration.js';
import { createCookieSessions } from '../src/sessions.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { createMeRouter } from '../src/routes/me.js';
import { getPublicUser, identityFromUser } from '../src/profile.js';
import { errorHandler } from '../src/errors.js';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'developer@example.test', email_confirmed_at: '2026-10-30T00:00:00Z' };
const session = { access_token: 'fabricated-access-token', refresh_token: 'fabricated-refresh-token' };
const valid = { name: 'Developer Customer', email: ' Developer@Example.Test ', password: 'Fabricated1!' };

async function withApi(run, options = {}) {
  const calls = [];
  const profiles = [];
  let clients = 0;
  const factory = createAuthClientFactory({ url: 'https://example.supabase.co', publishableKey: 'fabricated-publishable',
    clientFactory: () => {
      clients += 1;
      const id = clients;
      const operation = (name, fallback) => async (input) => {
        calls.push({ id, name, input });
        if (options.throws === name) throw new Error('private password token smtp detail');
        return options[name] ?? fallback;
      };
      return { auth: {
        signUp: operation('signUp', { data: { user: { ...user, email_confirmed_at: null }, session: null }, error: null }),
        resend: operation('resend', { data: {}, error: null }),
        verifyOtp: operation('verifyOtp', { data: { user, session }, error: null }),
        setSession: operation('setSession', { data: { user, session }, error: null }),
        getUser: operation('getUser', { data: { user }, error: null }),
        signOut: operation('signOut', { error: null }),
      } };
    } });
  const db = { from: (table) => {
    assert.equal(table, 'profiles');
    return { select: (columns) => ({ eq: (key, value) => {
      profiles.push({ columns, key, value });
      return { maybeSingle: async () => ({ data: options.missingProfile ? null : {
        id: user.id, name: valid.name, role: options.role ?? 'customer', phone: null, created_at: '2026-10-30T00:00:00Z',
      }, error: options.dbError ?? null }) };
    } }) };
  } };
  const dependencies = { createAuthClient: factory, loadUser: (authUser) => getPublicUser(db, identityFromUser(authUser)), origin: 'http://localhost:5173' };
  const sessions = createCookieSessions(dependencies);
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(sessions, createRegistration({ ...dependencies, limit: options.limit ?? 100 })));
  app.use('/api/me', createMeRouter({ client: db, cookieSessions: sessions,
    verifyAccessToken: () => assert.fail('Registration must not set a login cookie') }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const challenge = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = await challenge.json();
  const cookie = challenge.headers.getSetCookie()[0].split(';')[0];
  async function post(path, body, { origin = true, csrf = true, json = true } = {}) {
    const headers = { Cookie: cookie };
    if (origin) headers.Origin = 'http://localhost:5173';
    if (csrf) headers['X-CSRF-Token'] = csrfToken;
    if (json) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}/api/auth/${path}`, { method: 'POST', headers,
      body: json ? JSON.stringify(body) : 'not-json' });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  try { await run({ post, calls, profiles, base, options }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('registration sends only normalized email, password and name metadata to request-scoped signUp', async () => {
  await withApi(async ({ post, calls, profiles, base }) => {
    const result = await post('register', valid);
    assert.equal(result.status, 202);
    assert.equal(result.body.email, user.email);
    assert.deepEqual(calls[0].input, { email: user.email, password: valid.password,
      options: { data: { name: valid.name }, emailRedirectTo: 'http://localhost:5173/verify-email' } });
    assert.equal(calls[0].name, 'signUp');
    assert.equal(profiles.length, 0); // No privileged lookup of an unverified/possibly obfuscated signup identity.
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.deepEqual(result.headers.getSetCookie(), []);
    assert.doesNotMatch(JSON.stringify(result.body), /fabricated|user_metadata|11111111/);
    assert.equal((await fetch(`${base}/api/me`)).status, 401);
  });
});

test('validates all fields and rejects injected roles, IDs and SDK options before signUp', async () => {
  await withApi(async ({ post, calls }) => {
    for (const body of [null, [], {}, { ...valid, name: 'A' }, { ...valid, name: '9Bad' },
      { ...valid, email: 'invalid' }, { ...valid, password: 'weak' }, { ...valid, password: 'x'.repeat(129) },
      { ...valid, role: 'admin' }, { ...valid, userId: user.id }, { ...valid, options: { data: { role: 'admin' } } }]) {
      assert.equal((await post('register', body)).status, 400);
    }
    assert.equal(calls.length, 0);
  });
});

test('existing-email errors and obfuscated success produce the same non-enumerating accepted response', async () => {
  let expected;
  await withApi(async ({ post }) => { expected = (await post('register', valid)).body; });
  for (const signUp of [{ error: { code: 'user_already_exists', status: 422 } },
    { data: { user: { id: 'obfuscated-id', identities: [] }, session: null }, error: null }]) {
    await withApi(async ({ post, profiles }) => {
      const result = await post('register', valid);
      assert.equal(result.status, 202);
      assert.deepEqual(result.body, expected);
      assert.equal(profiles.length, 0);
    }, { signUp });
  }
});

test('all registration writes retain Origin, signed CSRF, rate limiting and JSON protections', async () => {
  await withApi(async ({ post, calls }) => {
    for (const path of ['register', 'resend-verification', 'verify-email']) {
      assert.equal((await post(path, valid, { origin: false })).status, 403);
      assert.equal((await post(path, valid, { csrf: false })).status, 403);
      assert.equal((await post(path, valid, { json: false })).status, 415);
    }
    assert.equal(calls.length, 0);
  });
  await withApi(async ({ post }) => {
    assert.equal((await post('register', valid)).status, 202);
    const result = await post('resend-verification', { email: user.email });
    assert.equal(result.status, 429);
    assert.ok(Number(result.headers.get('Retry-After')) > 0);
  }, { limit: 1 });
});

test('Supabase code and token-hash verification check confirmed Auth identity and customer profile, then sign out', async () => {
  for (const [proof, expected] of [[{ email: user.email, code: '123456' }, { email: user.email, token: '123456', type: 'email' }],
    [{ tokenHash: 'fabricated-hash' }, { token_hash: 'fabricated-hash', type: 'email' }]]) {
    await withApi(async ({ post, calls, profiles }) => {
      const result = await post('verify-email', proof);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { verified: true });
      assert.deepEqual(calls[0].input, expected);
      assert.deepEqual(calls.map((call) => call.name), ['verifyOtp', 'getUser', 'signOut']);
      assert.ok(calls.every((call) => call.id === calls[0].id));
      assert.deepEqual(profiles.map(({ key, value }) => ({ key, value })), [{ key: 'id', value: user.id }]);
      assert.deepEqual(result.headers.getSetCookie(), []);
    });
  }
});

test('default confirmation-link fragments are validated through setSession and getUser without auto-login', async () => {
  await withApi(async ({ post, calls }) => {
    const result = await post('verify-email', { accessToken: session.access_token, refreshToken: session.refresh_token });
    assert.deepEqual(result.body, { verified: true });
    assert.equal(result.status, 200);
    assert.deepEqual(calls.map((call) => call.name), ['setSession', 'getUser', 'signOut']);
    assert.deepEqual(result.headers.getSetCookie(), []);
  });
});

test('a project returning an immediate signup session still requires a confirmed identity/profile and does not log in', async () => {
  await withApi(async ({ post, calls }) => {
    const result = await post('register', valid);
    assert.equal(result.status, 202);
    assert.deepEqual(calls.map((call) => call.name), ['signUp', 'getUser', 'signOut']);
    assert.deepEqual(result.headers.getSetCookie(), []);
  }, { signUp: { data: { user, session }, error: null } });
});

test('expired proof, unconfirmed identity, missing trigger profile and incorrect role fail safely', async () => {
  for (const [options, expected] of [
    [{ verifyOtp: { error: { status: 403, message: 'private expired code' } } }, 400],
    [{ getUser: { data: { user: { ...user, email_confirmed_at: null } }, error: null } }, 400],
    [{ missingProfile: true }, 403], [{ role: 'admin' }, 403],
    [{ dbError: { message: 'private database detail' } }, 503],
  ]) {
    await withApi(async ({ post, calls }) => {
      const result = await post('verify-email', { email: user.email, code: '123456' });
      assert.equal(result.status, expected);
      assert.doesNotMatch(JSON.stringify(result.body), /private|fabricated/);
      if (!options.verifyOtp) assert.equal(calls.at(-1).name, 'signOut');
      assert.deepEqual(result.headers.getSetCookie(), []);
    }, options);
  }
});

test('resend uses only Supabase signup confirmation and hides absent accounts', async () => {
  await withApi(async ({ post, calls }) => {
    const result = await post('resend-verification', { email: user.email });
    assert.equal(result.status, 202);
    assert.deepEqual(calls[0].input, { type: 'signup', email: user.email,
      options: { emailRedirectTo: 'http://localhost:5173/verify-email' } });
    assert.equal(calls.length, 1);
  }, { resend: { error: { status: 400, code: 'user_not_found' } } });
});

test('delivery limits and provider/trigger failures are safe and never log raw credentials', async (t) => {
  const logs = t.mock.method(console, 'error', () => {});
  for (const options of [{ signUp: { error: { status: 429, code: 'over_email_send_rate_limit', message: 'private SMTP' } } },
    { signUp: { error: { status: 500, code: 'unexpected_failure', message: 'private trigger error' } } },
    { signUp: { error: { status: 403, code: 'email_address_not_authorized', message: 'private developer address' } } },
    { throws: 'signUp' }]) {
    await withApi(async ({ post }) => {
      const result = await post('register', valid);
      assert.ok([429, 503].includes(result.status));
      assert.doesNotMatch(JSON.stringify(result.body), /private|fabricated/);
      if (result.status === 429) assert.equal(result.headers.get('Retry-After'), '60');
    }, options);
  }
  assert.equal(logs.mock.calls.length, 0);
});
