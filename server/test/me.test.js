import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createAccessTokenVerifier } from '../src/auth.js';
import { createMeRouter } from '../src/routes/me.js';
import { errorHandler } from '../src/errors.js';

// All credentials and identities below are fabricated. No real Auth or DB calls.
const subject = '11111111-1111-4111-8111-111111111111';
const authUser = {
  id: subject, email: 'customer@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
  user_metadata: { role: 'admin', name: 'Untrusted metadata' },
  role: 'authenticated', created_at: '2026-01-01T00:00:00Z',
};
const profile = { id: subject, name: 'Customer', phone: null, role: 'customer', created_at: '2026-01-02T00:00:00Z' };

async function withApi(run, { authResult = { data: { user: authUser }, error: null },
  profileResult = { data: profile, error: null }, authThrows = false, dbThrows = false } = {}) {
  const authCalls = [];
  const databaseCalls = [];
  const verifyAccessToken = createAccessTokenVerifier({ url: 'https://example.supabase.co',
    publishableKey: 'test-publishable-key', clientFactory: (...args) => {
      authCalls.push({ args });
      return { auth: { getUser: async (token) => {
        authCalls.at(-1).token = token;
        if (authThrows) throw new Error('private auth detail and token');
        return authResult;
      } } };
    } });
  const client = { from: (table) => {
    const call = { table };
    databaseCalls.push(call);
    return { select: (columns) => {
      call.columns = columns;
      return { eq: (column, value) => {
        call.column = column;
        call.value = value;
        return { maybeSingle: async () => {
          if (dbThrows) throw new Error('private database detail and token');
          return profileResult;
        } };
      } };
    } };
  } };
  const app = express();
  app.use('/api/me', createMeRouter({ client, verifyAccessToken }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/me`;
  const get = async (headers = {}, query = '') => {
    const response = await fetch(`${base}${query}`, { headers });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  try { await run({ get, authCalls, databaseCalls, base }); } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('missing/malformed credentials cannot reach Auth or privileged DB; query/cookies are ignored', async () => {
  await withApi(async ({ get, authCalls, databaseCalls }) => {
    for (const headers of [{}, { Authorization: 'Basic abc' }, { Authorization: 'Bearer' },
      { Authorization: 'Bearer token extra' }, { Authorization: 'Bearer a,b' },
      { Cookie: 'access_token=fake-token' }]) {
      const result = await get(headers, '?access_token=fake-token&userId=other&role=admin');
      assert.equal(result.status, 401);
      assert.deepEqual(result.body, { code: 'UNAUTHORIZED', message: 'A valid access token is required.' });
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.match(result.headers.get('www-authenticate'), /^Bearer /);
    }
    assert.equal(authCalls.length, 0);
    assert.equal(databaseCalls.length, 0);
  });
});

test('duplicate authorization headers are rejected', async () => {
  await withApi(async ({ base, authCalls, databaseCalls }) => {
    const status = await new Promise((resolve, reject) => {
      const req = request(base, { headers: { Authorization: ['Bearer first', 'Bearer second'] } }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 401);
    assert.equal(authCalls.length, 0);
    assert.equal(databaseCalls.length, 0);
  });
});

test('invalid/expired tokens return 401 without privileged database access', async () => {
  for (const code of ['bad_jwt', 'jwt_expired']) {
    await withApi(async ({ get, databaseCalls }) => {
      const result = await get({ Authorization: 'Bearer fabricated-invalid-token' });
      assert.equal(result.status, 401);
      assert.equal(result.body.code, 'UNAUTHORIZED');
      assert.equal(databaseCalls.length, 0);
      assert.equal(JSON.stringify(result.body).includes(code), false);
    }, { authResult: { data: { user: null }, error: { status: 401, code, message: 'private auth detail' } } });
  }
});

test('valid identity maps only allowed fields and ignores requester identity and metadata role', async () => {
  await withApi(async ({ get, authCalls, databaseCalls }) => {
    const result = await get({ Authorization: 'bearer fabricated-valid-token', 'X-User-Id': 'other',
      'X-Role': 'admin', 'X-Email': 'other@example.test' }, '?userId=other&role=admin&email=other');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { id: subject, name: 'Customer', email: 'customer@example.test',
      role: 'customer', phone: '', verified: true, createdAt: profile.created_at });
    assert.deepEqual(databaseCalls, [{ table: 'profiles', columns: 'id, name, phone, role, created_at', column: 'id', value: subject }]);
    assert.equal(authCalls[0].token, 'fabricated-valid-token');
    assert.deepEqual(authCalls[0].args, ['https://example.supabase.co', 'test-publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }]);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.match(result.headers.get('vary'), /Authorization/);
  });
});

test('database admin role is authoritative, and absent email confirmation maps to false', async () => {
  await withApi(async ({ get }) => {
    const { body } = await get({ Authorization: 'Bearer fabricated-token' });
    assert.equal(body.role, 'admin');
    assert.equal(body.verified, false);
    assert.equal(body.phone, '09123456789');
  }, { authResult: { data: { user: { ...authUser, email_confirmed_at: null } }, error: null },
    profileResult: { data: { ...profile, role: 'admin', phone: '09123456789' }, error: null } });
});

test('a new Auth client is created for every verification, without shared sessions', async () => {
  await withApi(async ({ get, authCalls }) => {
    await Promise.all([get({ Authorization: 'Bearer token-one' }), get({ Authorization: 'Bearer token-two' })]);
    assert.equal(authCalls.length, 2);
    assert.deepEqual(authCalls.map((call) => call.token).sort(), ['token-one', 'token-two']);
  });
});

test('missing profiles, mismatched profile IDs and invalid database roles fail closed', async () => {
  for (const data of [null, { ...profile, id: 'other' }, { ...profile, role: 'superadmin' }]) {
    await withApi(async ({ get }) => {
      const result = await get({ Authorization: 'Bearer fabricated-token' });
      assert.equal(result.status, 403);
      assert.deepEqual(result.body, { code: 'PROFILE_UNAVAILABLE', message: 'Your account profile is unavailable.' });
    }, { profileResult: { data, error: null } });
  }
});

test('Auth service and database failures return safe errors without logging secrets', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  for (const options of [
    { authThrows: true },
    { authResult: { data: null, error: { status: 503, message: 'private auth detail and token' } } },
    { profileResult: { data: null, error: { message: 'private database detail and token' } } },
    { dbThrows: true },
  ]) {
    await withApi(async ({ get }) => {
      const result = await get({ Authorization: 'Bearer fabricated-secret-token' });
      assert.equal(result.status, 503);
      assert.ok(['AUTH_UNAVAILABLE', 'DATABASE_UNAVAILABLE'].includes(result.body.code));
      assert.doesNotMatch(JSON.stringify(result.body), /private|fabricated-secret/);
    }, options);
  }
  assert.equal(log.mock.calls.length, 0);
});

test('missing Auth configuration fails safely without constructing a client', async () => {
  const verify = createAccessTokenVerifier({ url: 'https://example.supabase.co', clientFactory: () => assert.fail('No client expected') });
  await assert.rejects(verify('fabricated-token'), { status: 503, code: 'AUTH_UNAVAILABLE' });
});

test('an empty Auth user response is not accepted as authenticated', async () => {
  await withApi(async ({ get, databaseCalls }) => {
    assert.equal((await get({ Authorization: 'Bearer fabricated-token' })).status, 401);
    assert.equal(databaseCalls.length, 0);
  }, { authResult: { data: { user: null }, error: null } });
});

test('real SDK sends the token to Auth getUser without constructing a local session', async () => {
  const requests = [];
  const verify = createAccessTokenVerifier({ url: 'https://example.supabase.co', publishableKey: 'test-publishable-key',
    clientFactory: (url, key, options) => createClient(url, key, { ...options,
      global: { fetch: async (input, init) => {
        requests.push({ url: String(input), headers: new Headers(init.headers) });
        return Response.json(authUser);
      } },
    }),
  });
  assert.equal((await verify('fabricated-token')).id, subject);
  assert.equal(requests[0].url, 'https://example.supabase.co/auth/v1/user');
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer fabricated-token');
  assert.equal(requests[0].headers.get('apikey'), 'test-publishable-key');
});
