import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createAdminRouter } from '../src/routes/admin.js';
import { createCookieSessions } from '../src/sessions.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { errorHandler } from '../src/errors.js';
import { unauthorized } from '../src/auth.js';
import { toProduct } from '../src/routes/products.js';
import { imageList, publicImageUrl, sniffImageType } from '../src/productImages.js';

process.env.SUPABASE_URL ??= 'https://fabricated-project.supabase.co';
const admin = '11111111-1111-4111-8111-111111111111';
const customer = '22222222-2222-4222-8222-222222222222';
const profile = { id: admin, role: 'admin', name: 'Administrator', phone: '', created_at: '2026-01-01' };
const collection = { id: 'col-power', stone: 'power', color: 'Purple', gemstone: 'Amethyst', slug: 'power', stone_name: 'Power Stone' };
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const saved = [`products/p-01/${uuid(1)}.jpg`, `products/p-01/${uuid(2)}.png`, `products/p-01/${uuid(3)}.webp`];
const legacy = 'https://cdn.example.test/legacy-ring.jpg';
const product = { id: 'p-01', slug: 'test-ring', name: 'Ring', type: 'Ring', stone: 'power', material: '925 Sterling Silver', price: '900.10', stock: 10,
  customizable_size: true, customizable_color: true, customization_fee: '150', sizes: ['US 5', 'US 6'], default_size: 'US 5',
  short_description: 'Test product', details: '', archived: false, is_featured: true, images: [...saved], rating: '0', review_count: 0 };
const body = { name: 'New Ring', type: 'Ring', stone: 'power', material: '925 Sterling Silver', price: 1000, stock: 5,
  customizable: { size: true, color: true }, customizationFee: 150, sizes: ['US 5', 'US 6'], defaultSize: 'US 5', shortDescription: 'New product' };
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = Uint8Array.from([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0x24, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))));
const GIF = Uint8Array.from([...'GIF89a'].map((c) => c.charCodeAt(0)).concat([1, 0, 1, 0, 0, 0]));
const bytesFor = (path) => ({ jpg: JPEG, png: PNG, webp: WEBP })[path.split('.').pop()];

function fakeStorage(objects, calls, options = {}) {
  return { from(bucket) {
    assert.equal(bucket, 'product-images');
    return {
      async createSignedUploadUrl(path) {
        calls.push({ storage: 'sign', path });
        if (options.signFails) return { error: { message: 'private storage detail' } };
        return { data: { path, token: 'fabricated-token', signedUrl: `https://fabricated-project.supabase.co/storage/v1/object/upload/sign/product-images/${path}?token=fabricated-token` } };
      },
      async download(path) {
        calls.push({ storage: 'download', path });
        return objects.has(path) ? { data: new Blob([objects.get(path)]) } : { error: { status: 400, statusCode: '404', message: 'Object not found' } };
      },
      async move(from, to) {
        calls.push({ storage: 'move', from, to });
        if (!objects.has(from)) return { error: { message: 'missing' } };
        objects.set(to, objects.get(from)); objects.delete(from); return { data: {} };
      },
      async remove(paths) {
        calls.push({ storage: 'remove', paths });
        for (const path of paths) objects.delete(path);
        return { data: paths.map((name) => ({ name })) };
      },
    };
  } };
}

function fakeDatabase(options = {}) {
  const tables = { profiles: [structuredClone(profile), { ...profile, id: customer, role: 'customer', name: 'Customer' }],
    collections: [structuredClone(collection)], products: [structuredClone(product)] };
  const calls = [];
  const objects = new Map([...saved.map((path) => [path, bytesFor(path)]), ...(options.objects ?? [])]);
  const db = { tables, calls, objects, storage: fakeStorage(objects, calls, options), from(table) {
    let action = 'read', payload, single = false;
    const filters = [];
    const query = { select() { return query; }, eq(key, value) { filters.push((row) => row[key] === value); return query; },
      contains(key, value) { filters.push((row) => value.every((item) => row[key].includes(item))); return query; },
      containedBy(key, value) { filters.push((row) => row[key].every((item) => value.includes(item))); return query; },
      order() { return query; }, range() { return query; },
      insert(value) { action = 'insert'; payload = value; return query; }, update(value) { action = 'update'; payload = value; return query; },
      maybeSingle() { single = true; return run(); }, then(resolve, reject) { return run().then(resolve, reject); } };
    async function run() {
      calls.push({ table, action, payload });
      if (action === 'update') options.beforeUpdate?.(tables);
      if (action === 'insert') tables[table].push(structuredClone(payload));
      let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (action === 'insert') rows = rows.filter((row) => row.id === payload.id);
      if (action === 'update') rows.forEach((row) => Object.assign(row, structuredClone(payload)));
      const values = rows.map((row) => table === 'products' ? { ...row, collection: tables.collections.find((item) => item.stone === row.stone) } : { ...row });
      return { data: single ? values[0] ?? null : values };
    }
    return query;
  } };
  return db;
}

async function api(run, options = {}) {
  const db = fakeDatabase(options);
  const sessions = createCookieSessions({ origin: 'http://localhost:5173', createAuthClient: () => ({ auth: {} }), loadUser: async () => ({ ...profile, verified: true }) });
  const app = express(); app.use(express.json());
  app.use('/api/auth', createAuthRouter(sessions));
  app.use('/api/admin', createAdminRouter({ client: db, cookieSessions: sessions, now: () => new Date('2026-11-07T00:00:00Z'), verifyAccessToken: async (token) => {
    if (!['admin', 'customer'].includes(token)) throw unauthorized();
    return { id: token === 'customer' ? customer : admin, email: 'account@example.test', email_confirmed_at: '2026-01-01', user_metadata: { role: 'admin' } };
  } }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const csrf = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = await csrf.json();
  const cookie = csrf.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  async function send(path, method = 'GET', data, headers = {}) {
    const response = await fetch(base + path, { method, headers: { Authorization: 'Bearer admin', Origin: 'http://localhost:5173', Cookie: cookie,
      'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, body: await response.json() };
  }
  try { await run({ send, db }); } finally { await new Promise((resolve) => server.close(resolve)); }
}
const URL_PATH = '/api/admin/products/images/upload-url';
const upload = { fileName: 'ring.jpg', contentType: 'image/jpeg', size: 1024, count: 0 };

test('upload-url requires a verified admin, CSRF protection and JSON', async () => {
  await api(async ({ send, db }) => {
    for (const headers of [{ Authorization: 'Bearer customer' }, { Authorization: 'Bearer forged' }]) {
      assert.ok([401, 403].includes((await send(URL_PATH, 'POST', upload, headers)).status));
    }
    assert.equal((await send(URL_PATH, 'POST', upload, { 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.equal((await send(URL_PATH, 'POST', upload, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await send(URL_PATH, 'POST', upload, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal(db.calls.filter((call) => call.storage).length, 0);
  });
});

test('upload-url rejects unsupported types, mismatched extensions, oversize files and a sixth image', async () => {
  await api(async ({ send, db }) => {
    for (const [patch, code] of [
      [{ fileName: 'ring.gif', contentType: 'image/gif' }, 'UNSUPPORTED_IMAGE_TYPE'],
      [{ fileName: 'ring.svg', contentType: 'image/svg+xml' }, 'UNSUPPORTED_IMAGE_TYPE'],
      [{ fileName: 'ring.png', contentType: 'image/jpeg' }, 'UNSUPPORTED_IMAGE_TYPE'],
      [{ fileName: 'ring', contentType: 'image/jpeg' }, 'UNSUPPORTED_IMAGE_TYPE'],
      [{ size: 5 * 1024 * 1024 + 1 }, 'IMAGE_TOO_LARGE'],
      [{ size: 6 * 1024 * 1024 }, 'IMAGE_TOO_LARGE'],
      [{ size: 0 }, 'VALIDATION_ERROR'],
      [{ count: 5 }, 'TOO_MANY_IMAGES'],
      [{ count: -1 }, 'VALIDATION_ERROR'],
      [{ extra: true }, 'VALIDATION_ERROR'],
      [{ productId: '../p-01' }, 'VALIDATION_ERROR'],
      [{ productId: 'tmp' }, 'VALIDATION_ERROR'],
    ]) {
      const result = await send(URL_PATH, 'POST', { ...upload, ...patch });
      assert.equal(result.status, 400, JSON.stringify(patch));
      assert.equal(result.body.code, code, JSON.stringify(patch));
    }
    assert.equal((await send(URL_PATH, 'POST', { ...upload, productId: 'p-missing' })).status, 404);
    assert.equal(db.calls.filter((call) => call.storage).length, 0);
  });
});

test('upload-url returns a signed URL under tmp or the product, sized exactly 5 MB allowed', async () => {
  await api(async ({ send, db }) => {
    const tmp = await send(URL_PATH, 'POST', { ...upload, size: 5 * 1024 * 1024, count: 4 });
    assert.equal(tmp.status, 201);
    assert.match(tmp.body.path, /^products\/tmp\/[0-9a-f-]{36}\.jpg$/);
    assert.ok(tmp.body.signedUrl.startsWith('https://') && tmp.body.signedUrl.includes(tmp.body.path));
    assert.equal(tmp.body.contentType, 'image/jpeg');
    const owned = await send(URL_PATH, 'POST', { fileName: 'ring.WEBP', contentType: 'image/webp', size: 10, count: 3, productId: 'p-01' });
    assert.equal(owned.status, 201);
    assert.match(owned.body.path, /^products\/p-01\/[0-9a-f-]{36}\.webp$/);
    assert.equal(db.calls.filter((call) => call.storage === 'sign').length, 2);
  });
  await api(async ({ send }) => {
    const result = await send(URL_PATH, 'POST', upload);
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'STORAGE_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(result.body), /private/);
  }, { signFails: true });
});

test('create verifies real file bytes, moves tmp uploads under the product and keeps order', async () => {
  const a = `products/tmp/${uuid(11)}.png`, b = `products/tmp/${uuid(12)}.jpg`;
  await api(async ({ send, db }) => {
    const result = await send('/api/admin/products', 'POST', { ...body, images: [a, legacy, b] });
    assert.equal(result.status, 201);
    const id = result.body.id;
    const stored = db.tables.products.find((row) => row.id === id).images;
    assert.deepEqual(stored, [`products/${id}/${uuid(11)}.png`, legacy, `products/${id}/${uuid(12)}.jpg`]);
    assert.ok(!db.objects.has(a) && !db.objects.has(b) && db.objects.has(stored[0]));
    assert.deepEqual(result.body.images, [publicImageUrl(stored[0]), legacy, publicImageUrl(stored[2])]);
    assert.ok(result.body.images[0].startsWith('https://fabricated-project.supabase.co/storage/v1/object/public/product-images/products/'));
    assert.deepEqual(result.body.imageSources.map((item) => item.source), stored);
  }, { objects: [[a, PNG], [b, JPEG]] });
});

test('create rejects disguised files, missing uploads, other products\' paths and more than 5 images', async () => {
  const fake = `products/tmp/${uuid(21)}.jpg`;
  await api(async ({ send, db }) => {
    const disguised = await send('/api/admin/products', 'POST', { ...body, images: [fake] });
    assert.equal(disguised.status, 400); assert.equal(disguised.body.code, 'INVALID_IMAGE');
    assert.ok(!db.objects.has(fake), 'invalid upload is deleted');
    const missing = await send('/api/admin/products', 'POST', { ...body, images: [`products/tmp/${uuid(22)}.jpg`] });
    assert.equal(missing.status, 400); assert.equal(missing.body.code, 'IMAGE_UPLOAD_MISSING');
    assert.equal((await send('/api/admin/products', 'POST', { ...body, images: [saved[0]] })).status, 400);
    const six = Array.from({ length: 6 }, (_, i) => `products/tmp/${uuid(30 + i)}.jpg`);
    assert.equal((await send('/api/admin/products', 'POST', { ...body, images: six })).status, 400);
    assert.equal((await send('/api/admin/products', 'POST', { ...body, images: [legacy, legacy] })).status, 400);
    assert.equal((await send('/api/admin/products', 'POST', { ...body, images: ['javascript:alert(1)'] })).status, 400);
    assert.equal((await send('/api/admin/products', 'POST', { ...body, images: [], expectedImages: [] })).status, 400);
    assert.equal(db.tables.products.length, 1);
  }, { objects: [[fake, GIF]] });
});

test('update reorders, removes and adds images, deleting only removed Storage files after saving', async () => {
  const added = `products/p-01/${uuid(41)}.jpg`;
  await api(async ({ send, db }) => {
    const result = await send('/api/admin/products/p-01', 'PATCH', { images: [saved[2], added, saved[0]], expectedImages: saved });
    assert.equal(result.status, 200);
    assert.deepEqual(db.tables.products[0].images, [saved[2], added, saved[0]]);
    assert.equal(result.body.images[0], publicImageUrl(saved[2]), 'first image is the cover');
    const removals = db.calls.filter((call) => call.storage === 'remove');
    assert.deepEqual(removals, [{ storage: 'remove', paths: [saved[1]] }]);
    assert.ok(!db.objects.has(saved[1]) && db.objects.has(saved[0]) && db.objects.has(added));
    assert.equal(db.calls.filter((call) => call.storage === 'download').map((call) => call.path).join(), added, 'only new uploads are re-verified');
  }, { objects: [[added, JPEG]] });
});

test('image updates require expectedImages and reject stale lists without touching Storage', async () => {
  await api(async ({ send, db }) => {
    assert.equal((await send('/api/admin/products/p-01', 'PATCH', { images: [saved[0]] })).status, 400);
    assert.equal((await send('/api/admin/products/p-01', 'PATCH', { price: 5, expectedImages: saved })).status, 400);
    const stale = await send('/api/admin/products/p-01', 'PATCH', { images: [saved[0]], expectedImages: [saved[1], saved[0], saved[2]] });
    assert.equal(stale.status, 409); assert.equal(stale.body.code, 'IMAGES_CONFLICT');
    const foreign = await send('/api/admin/products/p-01', 'PATCH', { images: [`products/p-02/${uuid(51)}.jpg`], expectedImages: saved });
    assert.equal(foreign.status, 400);
    assert.equal((await send('/api/admin/products/p-01', 'PATCH', { images: [`products/tmp/${uuid(52)}.jpg`], expectedImages: saved })).status, 400);
    assert.deepEqual(db.tables.products[0].images, saved);
    assert.equal(db.calls.filter((call) => call.storage === 'remove').length, 0);
  });
  // Another admin changes images between the read and the guarded update.
  await api(async ({ send, db }) => {
    const result = await send('/api/admin/products/p-01', 'PATCH', { images: [saved[0]], expectedImages: saved });
    assert.equal(result.status, 409); assert.equal(result.body.code, 'IMAGES_CONFLICT');
    assert.equal(db.calls.filter((call) => call.storage === 'remove').length, 0);
    assert.ok(db.objects.has(saved[1]) && db.objects.has(saved[2]));
  }, { beforeUpdate: (tables) => { tables.products[0].images = [...saved, `products/p-01/${uuid(61)}.jpg`]; } });
});

test('stock conflicts still win and leave images and files unchanged', async () => {
  await api(async ({ send, db }) => {
    const result = await send('/api/admin/products/p-01', 'PATCH', { stock: 4, expectedStock: 9, images: [saved[0]], expectedImages: saved });
    assert.equal(result.status, 409); assert.equal(result.body.code, 'INVENTORY_CONFLICT');
    assert.deepEqual(db.tables.products[0].images, saved);
    assert.equal(db.calls.filter((call) => call.storage === 'remove').length, 0);
  });
});

test('archiving keeps images and files; discard never deletes saved product images', async () => {
  const pending = `products/p-01/${uuid(71)}.jpg`, tmp = `products/tmp/${uuid(72)}.png`;
  await api(async ({ send, db }) => {
    assert.equal((await send('/api/admin/products/p-01', 'DELETE', {})).status, 200);
    assert.equal(db.tables.products[0].archived, true);
    assert.deepEqual(db.tables.products[0].images, saved);
    const result = await send('/api/admin/products/images/discard', 'POST', { paths: [pending, tmp, saved[0]] });
    assert.equal(result.status, 200); assert.equal(result.body.removed, 2);
    assert.ok(!db.objects.has(pending) && !db.objects.has(tmp) && db.objects.has(saved[0]));
    for (const paths of [[], ['products/../secret.jpg'], ['avatars/x.jpg'], 'products/tmp/x.jpg']) {
      assert.equal((await send('/api/admin/products/images/discard', 'POST', { paths })).status, 400);
    }
    assert.equal((await send('/api/admin/products/images/discard', 'POST', { paths: [tmp] }, { Authorization: 'Bearer customer' })).status, 403);
  }, { objects: [[pending, JPEG], [tmp, PNG]] });
});

test('helpers: storefront URLs, legacy compatibility and magic-byte sniffing', () => {
  const row = { ...product, images: [saved[0], legacy, 'not-a-url'], collection };
  assert.deepEqual(toProduct(row).images, [publicImageUrl(saved[0]), legacy]);
  assert.deepEqual(toProduct({ ...product, images: [], collection }).images, []);
  assert.equal(publicImageUrl(saved[0], ''), null);
  assert.equal(sniffImageType(JPEG), 'image/jpeg');
  assert.equal(sniffImageType(PNG), 'image/png');
  assert.equal(sniffImageType(WEBP), 'image/webp');
  assert.equal(sniffImageType(GIF), null);
  assert.throws(() => imageList(['https://a.example/x,y.jpg']));
  assert.throws(() => imageList(['http://a.example/x.jpg']));
});
