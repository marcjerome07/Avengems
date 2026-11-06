import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createMeRouter } from '../src/routes/me.js';
import { createCookieSessions } from '../src/sessions.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { errorHandler } from '../src/errors.js';
import { addressPatch, toAddress } from '../src/customer.js';
import { unauthorized } from '../src/auth.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const address = { label: 'Home', fullName: 'Customer Name', phone: '0917 123 4567', address: '12 Main Street', city: 'Manila', province: 'Metro Manila', postalCode: '1000', isDefault: false };
const row = { id, user_id: owner, ...addressPatch(address, true) };

async function api(run, options = {}) {
  const profile = { id: owner, name: 'Customer Name', phone: '', role: 'customer', created_at: '2026-01-01' };
  const calls = [];
  const db = { from(table) {
    const filters = [];
    let patch;
    const query = {
      select() { return query; },
      update(value) { patch = value; return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      order() { return query; },
      maybeSingle() { return execute(true); },
      then(resolve, reject) { return execute(false).then(resolve, reject); },
    };
    async function execute(single) {
      calls.push({ table, filters, patch });
      if (options.dbThrows) throw new Error('private database detail');
      if (options.dbError) return { data: null, error: { message: 'private database detail' } };
      if (table === 'profiles') {
        assert.deepEqual(filters, [['id', owner]]);
        if (options.missingProfile) return { data: null };
        if (patch) Object.assign(profile, patch);
        return { data: { ...profile, role: options.role ?? profile.role } };
      }
      assert.ok(filters.some(([key, value]) => key === 'user_id' && value === owner));
      const found = (options.rows ?? [row]).filter((item) => filters.every(([key, value]) => item[key] === value));
      return { data: single ? found[0] ?? null : found };
    }
    return query;
  }, async rpc(name, args) {
    calls.push({ rpc: name, args });
    if (options.rpcThrows) throw new Error('private RPC detail');
    if (options.rpcError) return { data: null, error: options.rpcError };
    return { data: options.rpcRows ?? [row] };
  } };
  const sessions = createCookieSessions({ origin: 'http://localhost:5173',
    createAuthClient: () => ({ auth: { signInWithPassword: async () => ({ data: {
      user: { id: owner }, session: { access_token: 'cookie-access', refresh_token: 'cookie-refresh', expires_at: Date.now() / 1000 + 3600 },
    } }) } }), loadUser: async () => ({ ...profile, verified: true }),
  });
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(sessions));
  app.use('/api/me', createMeRouter({ client: db, cookieSessions: sessions, verifyAccessToken: async (token) => {
    if (token === 'expired' || options.expired) throw unauthorized();
    return { id: owner, email: 'customer@example.test', email_confirmed_at: options.unverified ? null : '2026-01-01' };
  } }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const csrfResponse = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = await csrfResponse.json();
  let cookie = csrfResponse.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  if (options.cookies) {
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST',
      headers: { Origin: 'http://localhost:5173', Cookie: cookie, 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer@example.test', password: 'fabricated-password' }) });
    assert.equal(login.status, 200);
    const jar = new Map();
    for (const value of login.headers.getSetCookie()) {
      const pair = value.split(';')[0];
      jar.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
    }
    cookie = [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
    const loginBody = await login.json();
    options.csrfToken = loginBody.csrfToken;
  }
  async function send(path = '', method = 'GET', body, headers = {}) {
    const response = await fetch(`${base}/api/me${path}`, { method,
      headers: { ...(options.cookies ? {} : { Authorization: 'Bearer valid' }), Origin: 'http://localhost:5173', Cookie: cookie,
        'X-CSRF-Token': options.csrfToken ?? csrfToken, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  try { await run({ send, calls, profile }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('profile GET retains contract; PATCH persists only normalized name and phone', async () => {
  await api(async ({ send, profile }) => {
    const before = await send();
    assert.deepEqual(Object.keys(before.body).sort(), ['id', 'name', 'email', 'role', 'phone', 'verified', 'createdAt'].sort());
    const result = await send('', 'PATCH', { name: '  Updated   Name ', phone: '+63 917-123-4567' });
    assert.equal(result.status, 200);
    assert.equal(profile.name, 'Updated Name');
    assert.equal(profile.phone, '+639171234567');
    assert.equal(result.body.email, 'customer@example.test');
    assert.equal((await send()).body.name, 'Updated Name');
    assert.equal(result.headers.get('cache-control'), 'no-store');
  });
});

test('profile rejects protected/unknown fields and invalid values without updates', async () => {
  await api(async ({ send, calls }) => {
    for (const body of [{}, [], null, { id: other }, { role: 'admin' }, { email: 'x@test.com' }, { verified: true },
      { createdAt: 'yesterday' }, { user_metadata: {} }, { name: 'A' }, { name: 'X'.repeat(101) },
      { name: 'Name\nInjected' }, { phone: null }, { phone: '123' }]) {
      assert.equal((await send('', 'PATCH', body)).status, 400);
    }
    assert.equal(calls.some((call) => call.patch), false);
    assert.equal((await send('', 'PATCH', { phone: '' })).status, 200);
  });
});

test('missing authentication cannot reach privileged database', async () => {
  await api(async ({ send, calls }) => {
    assert.equal((await send('', 'PATCH', { name: 'Valid Name' }, { Authorization: '' })).status, 401);
    assert.equal(calls.length, 0);
  });
});

test('expired authentication rejects every customer operation before database access', async () => {
  await api(async ({ send, calls }) => {
    for (const [path, method, body] of [['', 'PATCH', { name: 'Valid Name' }], ['/addresses', 'GET'],
      ['/addresses', 'POST', address], [`/addresses/${id}`, 'PATCH', { city: 'Pasig' }],
      [`/addresses/${id}`, 'DELETE', {}], [`/addresses/${id}/default`, 'PATCH', {}]]) {
      assert.equal((await send(path, method, body)).status, 401);
    }
    assert.equal(calls.length, 0);
  }, { expired: true });
});

test('real cookie-session middleware supports profile and address writes with rotated CSRF', async () => {
  await api(async ({ send, calls }) => {
    assert.equal((await send('', 'PATCH', { name: 'Cookie Customer' })).status, 200);
    assert.equal((await send('/addresses', 'POST', address)).status, 201);
    assert.equal((await send('/addresses')).status, 200);
    assert.equal(calls.at(-1).table, 'addresses');
    assert.equal((await send('', 'PATCH', { phone: '' }, { 'X-CSRF-Token': 'invalid' })).status, 403);
  }, { cookies: true });
});

test('all writes require exact Origin and CSRF even with Bearer authentication', async () => {
  await api(async ({ send, calls }) => {
    for (const [path, method, body] of [['', 'PATCH', { name: 'Valid Name' }], ['/addresses', 'POST', address],
      [`/addresses/${id}`, 'PATCH', { city: 'Pasig' }], [`/addresses/${id}`, 'DELETE', {}], [`/addresses/${id}/default`, 'PATCH', {}]]) {
      for (const headers of [{ Origin: 'https://attacker.test' }, { Origin: '' }, { 'X-CSRF-Token': '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
        const result = await send(path, method, body, headers);
        assert.equal(result.status, 403);
        assert.equal(result.body.code, 'CSRF_REJECTED');
      }
    }
    assert.equal(calls.length, 0);
  });
});

test('unverified customers and administrators cannot mutate customer data', async () => {
  for (const options of [{ unverified: true }, { role: 'admin' }]) await api(async ({ send, calls }) => {
    assert.equal((await send('', 'PATCH', { name: 'Valid Name' })).status, 403);
    assert.equal((await send('/addresses')).status, 403);
    assert.equal(calls.some((call) => call.rpc || call.patch), false);
  }, options);
});

test('missing profiles and database failures return safe, private errors', async () => {
  for (const options of [{ missingProfile: true }, { dbError: true }, { dbThrows: true }]) await api(async ({ send }) => {
    const result = await send('', 'PATCH', { name: 'Valid Name' });
    assert.equal(result.status, options.missingProfile ? 403 : 503);
    assert.doesNotMatch(JSON.stringify(result.body), /private/);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }, options);
});

test('address list maps schema fields and scopes reads to verified owner', async () => {
  await api(async ({ send }) => {
    const result = await send('/addresses?userId=' + other);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { items: [toAddress(row)] });
    assert.equal(result.body.items[0].user_id, undefined);
  }, { rows: [row, { ...row, id: other, user_id: other }] });
  await api(async ({ send }) => assert.deepEqual((await send('/addresses')).body, { items: [] }), { rows: [] });
});

test('creation uses verified owner and normalized schema payload through atomic RPC', async () => {
  await api(async ({ send, calls }) => {
    const result = await send('/addresses', 'POST', address);
    assert.equal(result.status, 201);
    assert.deepEqual(calls.at(-1), { rpc: 'customer_address_mutate', args: {
      p_user_id: owner, p_action: 'create', p_id: null, p_data: addressPatch(address, true),
    } });
    assert.deepEqual(result.body.items, [toAddress(row)]);
  });
});

test('invalid address fields, IDs, owner injection, and optional field types are rejected', async () => {
  await api(async ({ send, calls }) => {
    for (const body of [{ ...address, userId: other }, { ...address, user_id: other }, { ...address, id },
      { ...address, postalCode: '10000' }, { ...address, phone: '12' }, { ...address, city: '' },
      { ...address, label: null }, { ...address, isDefault: 'true' }, { ...address, address: 'x'.repeat(301) }, { fullName: 'Valid Name' }]) {
      assert.equal((await send('/addresses', 'POST', body)).status, 400);
    }
    assert.equal((await send('/addresses/not-a-uuid', 'DELETE', {})).status, 400);
    assert.equal((await send(`/addresses/${id}/default`, 'PATCH', { userId: other })).status, 400);
    assert.equal(calls.some((call) => call.rpc), false);
  });
  assert.equal(addressPatch({ ...address, label: '' }, true).label, '');
});

test('address edits, deletion and default selection delegate atomically after ownership checks', async () => {
  for (const [action, path, method, body] of [
    ['update', `/addresses/${id}`, 'PATCH', { city: ' Pasig ' }],
    ['delete', `/addresses/${id}`, 'DELETE', {}],
    ['default', `/addresses/${id}/default`, 'PATCH', {}],
  ]) await api(async ({ send, calls }) => {
    const result = await send(path, method, body);
    assert.equal(result.status, 200);
    assert.equal(calls.at(-1).args.p_action, action);
    assert.equal(calls.at(-1).args.p_id, id);
    assert.equal(calls.at(-1).args.p_user_id, owner);
    if (action === 'update') assert.deepEqual(calls.at(-1).args.p_data, { city: 'Pasig' });
  });
});

test('other-user and nonexistent IDs return indistinguishable 404 without RPC', async () => {
  for (const rows of [[], [{ ...row, user_id: other }]]) await api(async ({ send, calls }) => {
    for (const [path, method, body] of [[`/addresses/${id}`, 'PATCH', { city: 'Pasig' }],
      [`/addresses/${id}`, 'DELETE', {}], [`/addresses/${id}/default`, 'PATCH', {}]]) {
      const result = await send(path, method, body);
      assert.equal(result.status, 404);
      assert.deepEqual(result.body, { code: 'NOT_FOUND', message: 'Address not found.' });
    }
    assert.equal(calls.some((call) => call.rpc), false);
  }, { rows });
});

test('API preserves authoritative RPC outcomes for first/default/reassigned/empty lists', async () => {
  const defaults = [{ ...row, is_default: true }, { ...row, id: other, is_default: false }];
  for (const [path, method, body, rpcRows] of [
    ['/addresses', 'POST', address, [defaults[0]]],
    [`/addresses/${id}/default`, 'PATCH', {}, defaults],
    [`/addresses/${id}`, 'DELETE', {}, [{ ...defaults[1], is_default: true }]],
    [`/addresses/${id}`, 'DELETE', {}, []],
  ]) await api(async ({ send }) => {
    const result = await send(path, method, body);
    assert.deepEqual(result.body.items, rpcRows.map(toAddress));
    assert.ok(result.body.items.filter((item) => item.isDefault).length <= 1);
  }, { rpcRows });
});

test('missing RPC fails closed; provider errors and ownership races are sanitized', async () => {
  for (const [options, status, code] of [
    [{ rpcError: { code: 'PGRST202', message: 'private' } }, 503, 'ADDRESS_MIGRATION_REQUIRED'],
    [{ rpcError: { code: '42883' } }, 503, 'ADDRESS_MIGRATION_REQUIRED'],
    [{ rpcError: { code: 'P0002' } }, 404, 'NOT_FOUND'],
    [{ rpcError: { code: '23505', message: 'private' } }, 503, 'DATABASE_UNAVAILABLE'],
    [{ rpcThrows: true }, 503, 'DATABASE_UNAVAILABLE'],
  ]) await api(async ({ send }) => {
    const result = await send(`/addresses/${id}/default`, 'PATCH', {});
    assert.equal(result.status, status);
    assert.equal(result.body.code, code);
    assert.doesNotMatch(JSON.stringify(result.body), /private/);
  }, options);
});

test('unsupported content types are rejected before writes', async () => {
  await api(async ({ send, calls }) => {
    assert.equal((await send('', 'PATCH', { name: 'Valid Name' }, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal(calls.some((call) => call.patch || call.rpc), false);
  });
});
