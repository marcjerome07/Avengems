import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createMeRouter } from '../src/routes/me.js';
import { createCookieSessions } from '../src/sessions.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { unauthorized } from '../src/auth.js';
import { errorHandler } from '../src/errors.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const product = { id: 'p-01', slug: 'test-ring', name: 'Test Ring', type: 'Ring', stone: 'power',
  material: '925 Sterling Silver', price: '1000', stock: 0, rating: '4.5', review_count: 2,
  collection: { color: 'Purple', gemstone: 'Amethyst' }, archived: false };
const origin = 'http://localhost:5173';

async function api(run, options = {}) {
  const calls = [];
  const products = options.products ?? [product, { ...product, id: 'p-02' }, { ...product, id: 'archived', archived: true }];
  const records = options.records ?? [];
  const identity = (id) => ({ id, email: 'customer@example.test', email_confirmed_at: options.unverified ? null : '2026-01-01' });
  const profile = (id) => ({ id, name: 'Customer Name', role: options.role ?? 'customer', phone: '', created_at: '2026-01-01' });
  const db = { from(table) {
    let action = 'select';
    let input;
    let upsertOptions;
    let columns;
    let bounds;
    const filters = [];
    const query = {
      select(value) { columns = value; return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      order() { return query; },
      range(start, end) { bounds = [start, end]; return query; },
      upsert(value, config) { action = 'upsert'; input = value; upsertOptions = config; return query; },
      delete() { action = 'delete'; return query; },
      maybeSingle() { return execute(true); },
      then(resolve, reject) { return execute(false).then(resolve, reject); },
    };
    async function execute(single) {
      calls.push({ table, action, input, upsertOptions, filters, columns, bounds });
      if (table === options.failTable) {
        if (options.dbThrows) throw new Error('private database credential detail');
        return { data: null, error: { code: options.dbCode ?? 'private', message: 'private database credential detail' } };
      }
      if (table === 'profiles') return { data: profile(filters.find(([key]) => key === 'id')[1]) };
      const matches = (row) => filters.every(([key, value]) => key === 'product.archived'
        ? products.find((item) => item.id === row.product_id)?.archived === value : row[key] === value);
      if (table === 'products') return { data: products.find(matches) ?? null };
      assert.equal(table, 'wishlist_items');
      if (action === 'upsert') {
        assert.deepEqual(upsertOptions, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
        if (!records.some((row) => row.user_id === input.user_id && row.product_id === input.product_id)) records.push({ ...input, created_at: 'unchanged' });
        return { data: null };
      }
      assert.ok(filters.some(([key]) => key === 'user_id'), 'Privileged reads/deletes require an owner filter');
      if (action === 'delete') {
        for (let i = records.length - 1; i >= 0; i--) if (matches(records[i])) records.splice(i, 1);
        return { data: null };
      }
      let rows = records.filter(matches).sort((a, b) => a.product_id.localeCompare(b.product_id));
      if (bounds) rows = rows.slice(bounds[0], bounds[1] + 1);
      const data = rows.map((row) => ({ product_id: row.product_id, product: products.find((item) => item.id === row.product_id) }));
      return { data: single ? data[0] : data };
    }
    return query;
  } };
  const sessions = createCookieSessions({ origin, createAuthClient: () => ({ auth: {
    signInWithPassword: async () => ({ data: { user: identity(alice), session: {
      access_token: 'alice', refresh_token: 'fabricated-refresh', expires_at: Date.now() / 1000 + 3600,
    } } }),
  } }), loadUser: async () => ({ ...profile(alice), verified: true }) });
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(sessions));
  app.use('/api/me', createMeRouter({ client: db, cookieSessions: sessions, verifyAccessToken: async (token) => {
    if (!['alice', 'bob'].includes(token)) throw unauthorized();
    return identity(token === 'alice' ? alice : bob);
  } }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const csrfResponse = await fetch(`${base}/api/auth/csrf`);
  let { csrfToken } = await csrfResponse.json();
  let cookie = csrfResponse.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ');
  if (options.cookies) {
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: {
      Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json',
    }, body: JSON.stringify({ email: 'customer@example.test', password: 'fabricated-password' }) });
    assert.equal(response.status, 200);
    cookie = response.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ');
    csrfToken = (await response.json()).csrfToken;
  }
  async function send(method = 'GET', path = '', body, headers = {}) {
    const response = await fetch(`${base}/api/me/wishlist${path}`, { method, headers: {
      ...(options.cookies ? {} : { Authorization: 'Bearer alice' }), Origin: origin, Cookie: cookie,
      'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json', ...headers,
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  try { await run({ send, calls, records }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('wishlist retrieval is private, owner-scoped, sanitized and excludes archived products', async () => {
  await api(async ({ send }) => {
    const result = await send('GET', '?userId=' + bob);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.deepEqual(result.body.items.map((item) => item.id), ['p-01']);
    assert.equal(result.body.items[0].price, 1000);
    assert.equal(result.body.items[0].color, 'Purple');
    assert.equal(result.body.items[0].user_id, undefined);
    assert.equal(result.body.items[0].archived, undefined);
  }, { records: [{ user_id: alice, product_id: 'p-01' }, { user_id: alice, product_id: 'archived' }, { user_id: bob, product_id: 'p-02' }] });
});

test('wishlist handles an empty list and reads beyond one database batch', async () => {
  await api(async ({ send }) => assert.deepEqual((await send()).body, { items: [] }));
  const products = Array.from({ length: 105 }, (_, i) => ({ ...product, id: `p-${String(i).padStart(3, '0')}` }));
  await api(async ({ send, calls }) => {
    assert.equal((await send()).body.items.length, 105);
    assert.equal(calls.filter((call) => call.table === 'wishlist_items').length, 2);
  }, { products, records: products.map((item) => ({ user_id: alice, product_id: item.id })) });
});

test('cookie authentication supports add/list/delete and duplicate requests are idempotent', async () => {
  await api(async ({ send, records }) => {
    const first = await send('POST', '', { productId: 'p-01' });
    assert.equal(first.status, 200);
    assert.equal(first.body.item.stock, 0, 'Out-of-stock catalog products can be saved');
    await Promise.all([send('POST', '', { productId: 'p-01' }), send('POST', '', { productId: 'p-01' })]);
    assert.equal(records.length, 1);
    assert.equal(records[0].created_at, 'unchanged');
    assert.equal((await send()).body.items.length, 1);
    for (let i = 0; i < 2; i++) assert.deepEqual((await send('DELETE', '/p-01', {})).body, { ok: true, productId: 'p-01' });
    assert.deepEqual((await send()).body, { items: [] });
  }, { cookies: true });
});

test('missing, malformed and expired authentication cannot reach privileged tables', async () => {
  await api(async ({ send, calls }) => {
    for (const Authorization of ['', 'Bearer expired', 'Basic invalid']) {
      for (const [method, path, body] of [['GET', '', undefined], ['POST', '', { productId: 'p-01' }], ['DELETE', '/p-01', {}]]) {
        assert.equal((await send(method, path, body, { Authorization })).status, 401);
      }
    }
    assert.equal(calls.length, 0);
  });
});

test('wishlist writes require exact Origin and signed CSRF even for valid Bearer identity', async () => {
  await api(async ({ send, calls }) => {
    for (const [method, path, body] of [['POST', '', { productId: 'p-01' }], ['DELETE', '/p-01', {}]]) {
      for (const headers of [{ Origin: '' }, { Origin: 'https://attacker.test' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'X-CSRF-Token': '' }]) {
        const result = await send(method, path, body, headers);
        assert.equal(result.status, 403);
        assert.equal(result.body.code, 'CSRF_REJECTED');
      }
    }
    assert.equal(calls.length, 0);
  });
});

test('owner/role injection and invalid identifiers never reach wishlist writes', async () => {
  await api(async ({ send, calls }) => {
    for (const body of [{}, [], null, { productId: '' }, { productId: 1 }, { productId: 'x'.repeat(101) },
      { productId: 'p-01,other' }, { productId: ' p-01' }, { productId: 'p-01', userId: bob },
      { productId: 'p-01', user_id: bob }, { productId: 'p-01', role: 'admin' }]) {
      assert.equal((await send('POST', '', body)).status, 400);
    }
    assert.equal((await send('DELETE', '/bad%20id', {})).status, 400);
    assert.equal((await send('DELETE', '/p-01', { userId: bob })).status, 400);
    assert.equal((await send('POST', '', { productId: 'p-01' }, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal(calls.some((call) => call.table === 'wishlist_items'), false);
  });
});

test('nonexistent and archived products cannot be added; removal remains possible', async () => {
  await api(async ({ send }) => {
    for (const id of ['missing', 'archived']) {
      const result = await send('POST', '', { productId: id });
      assert.equal(result.status, 404);
      assert.equal(result.body.code, 'PRODUCT_UNAVAILABLE');
      assert.equal((await send('DELETE', '/' + id, {})).status, 200);
    }
  });
});

test('cross-account reads and malicious removal query cannot affect another customer', async () => {
  await api(async ({ send, records }) => {
    await send('POST', '', { productId: 'p-01' });
    await send('POST', '', { productId: 'p-02' }, { Authorization: 'Bearer bob' });
    assert.deepEqual((await send('GET', '?userId=' + bob)).body.items.map((item) => item.id), ['p-01']);
    assert.deepEqual((await send('GET', '', undefined, { Authorization: 'Bearer bob' })).body.items.map((item) => item.id), ['p-02']);
    await send('DELETE', '/p-02?userId=' + bob, {});
    assert.ok(records.some((row) => row.user_id === bob && row.product_id === 'p-02'));
    await send('DELETE', '/p-01', {}, { Authorization: 'Bearer bob' });
    assert.ok(records.some((row) => row.user_id === alice && row.product_id === 'p-01'));
  });
});

test('unconfirmed and admin identities cannot use customer wishlist APIs', async () => {
  for (const options of [{ role: 'admin' }, { unverified: true }]) await api(async ({ send, calls }) => {
    assert.equal((await send()).status, 403);
    assert.equal((await send('POST', '', { productId: 'p-01' })).status, 403);
    assert.equal(calls.some((call) => call.table === 'wishlist_items'), false);
  }, options);
});

test('database exceptions and provider errors never expose internal details', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  for (const options of [{ failTable: 'products' }, { failTable: 'wishlist_items' }, { failTable: 'wishlist_items', dbThrows: true }]) {
    await api(async ({ send }) => {
      for (const [method, path, body] of [['POST', '', { productId: 'p-01' }], ...(options.failTable === 'wishlist_items' ? [['GET', '', undefined], ['DELETE', '/p-01', {}]] : [])]) {
        const result = await send(method, path, body);
        assert.equal(result.status, 503);
        assert.equal(result.body.code, 'DATABASE_UNAVAILABLE');
        assert.doesNotMatch(JSON.stringify(result.body), /private|credential/);
        assert.equal(result.headers.get('cache-control'), 'no-store');
      }
    }, options);
  }
  assert.equal(log.mock.calls.length, 0);
});

test('foreign-key race during insert returns a safe unavailable-product response', async () => {
  await api(async ({ send }) => {
    const result = await send('POST', '', { productId: 'p-01' });
    assert.equal(result.status, 404);
    assert.equal(result.body.code, 'PRODUCT_UNAVAILABLE');
  }, { failTable: 'wishlist_items', dbCode: '23503' });
});
