import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createProductsRouter } from '../src/routes/products.js';
import { errorHandler } from '../src/errors.js';

const row = {
  id: 'p-01', slug: 'power-stone-ring', name: 'Power Stone Ring', type: 'Ring', stone: 'power',
  material: '925 Sterling Silver', price: '649.00', stock: 14, rating: '4.8', review_count: 124,
  is_new: false, is_featured: true, customizable_size: true, customizable_color: true,
  customization_fee: '250.00', sizes: ['US 7'], default_size: 'US 7',
  short_description: 'Amethyst ring', details: 'Details', images: [], added_at: '2026-04-02',
  archived: false, collection: { color: 'Purple', gemstone: 'Amethyst' },
};

async function withApi(run, respond = () => [row]) {
  const requests = [];
  // Use the real Supabase query builder with a fake transport: no network or secrets.
  const client = createClient('https://example.supabase.co', 'test-key', {
    global: { fetch: async (input) => {
      const url = new URL(input);
      requests.push(url);
      const result = respond(url);
      if (result instanceof Response) return result;
      return new Response(JSON.stringify(result), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } },
  });
  const app = express();
  app.use('/api/products', createProductsRouter(client));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const get = async (path = '') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/products${path}`);
    return { status: response.status, body: await response.json() };
  };
  try { await run(get, requests); } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('list preserves the frontend shape and explicitly excludes archived rows', async () => {
  await withApi(async (get, requests) => {
    const { status, body } = await get();
    assert.equal(status, 200);
    assert.equal(body.total, 1);
    const product = body.items[0];
    assert.equal(product.price, 649);
    assert.equal(product.rating, 4.8);
    assert.equal(product.customizationFee, 250);
    assert.deepEqual(product.customizable, { size: true, color: true });
    assert.equal(product.color, 'Purple');
    assert.equal(product.gemstone, 'Amethyst');
    assert.equal(product.reviewCount, 124);
    assert.equal(product.defaultSize, 'US 7');
    assert.equal('collection' in product, false);
    assert.equal('archived' in product, false);
    assert.equal(requests[0].searchParams.get('archived'), 'eq.false');
    assert.match(requests[0].searchParams.get('select'), /collections!inner/);
    assert.equal(requests[0].searchParams.get('order'), 'is_featured.desc,id.asc');
  });
});

test('combines multi-value filters, IDs, prices, stock, customization and sorting', async () => {
  await withApi(async (get, requests) => {
    const params = new URLSearchParams({ type: 'Ring,Necklace', stone: 'power,space',
      material: '925 Sterling Silver', ids: 'p-01,p-02', minPrice: '100', maxPrice: '900',
      inStock: 'true', customizable: '1', sort: 'rating' });
    assert.equal((await get(`?${params}`)).status, 200);
    const q = requests[0].searchParams;
    assert.equal(q.get('type'), 'in.(Ring,Necklace)');
    assert.equal(q.get('stone'), 'in.(power,space)');
    assert.equal(q.get('material'), 'in.(925 Sterling Silver)');
    assert.equal(q.get('id'), 'in.(p-01,p-02)');
    assert.deepEqual(q.getAll('price'), ['gte.100', 'lte.900']);
    assert.equal(q.get('stock'), 'gt.0');
    assert.equal(q.get('or'), '(customizable_size.eq.true,customizable_color.eq.true)');
    assert.equal(q.get('order'), 'rating.desc,review_count.desc,id.asc');
  });
});

test('supports all sort modes and Shop URL aliases', async () => {
  await withApi(async (get, requests) => {
    for (const [sort, order] of [['newest', 'added_at.desc,id.asc'], ['price-asc', 'price.asc,id.asc'],
      ['price-desc', 'price.desc,id.asc']]) {
      await get(`?sort=${sort}&min=0&max=900&instock=1`);
      const q = requests.at(-1).searchParams;
      assert.equal(q.get('order'), order);
      assert.deepEqual(q.getAll('price'), ['gte.0', 'lte.900']);
      assert.equal(q.get('stock'), 'gt.0');
    }
    await get('?inStock=false&customizable=0');
    assert.equal(requests.at(-1).searchParams.has('stock'), false);
    assert.equal(requests.at(-1).searchParams.has('or'), false);
  });
});

test('search matches multiple tokens, plurals and collection fields literally', async () => {
  await withApi(async (get) => {
    for (const q of ['PURPLE rings', 'amethyst silver', 'power']) {
      assert.equal((await get(`?q=${encodeURIComponent(q)}`)).body.total, 1);
    }
    for (const q of ['blue', '%', 'ring),archived.eq.true']) {
      assert.deepEqual((await get(`?q=${encodeURIComponent(q)}`)).body, { items: [], total: 0 });
    }
  });
});

test('invalid filters return 400 without calling the database', async () => {
  await withApi(async (get, requests) => {
    for (const query of ['minPrice=-1', 'maxPrice=NaN', 'minPrice=1.001', 'min=10&max=1',
      'sort=unknown', 'sort=toString', 'type=Hat', 'stone=unknown', 'material=Gold',
      'inStock=yes', 'customizable=yes', 'q=one&q=two']) {
      const result = await get(`?${query}`);
      assert.equal(result.status, 400, query);
      assert.equal(result.body.code, 'VALIDATION_ERROR');
    }
    assert.equal(requests.length, 0);
  });
});

test('detail returns a product; missing or archived products return 404', async () => {
  await withApi(async (get, requests) => {
    const result = await get('/power-stone-ring');
    assert.equal(result.status, 200);
    assert.equal(result.body.slug, row.slug);
    assert.equal(requests[0].searchParams.get('archived'), 'eq.false');
    assert.equal(requests[0].searchParams.get('slug'), 'eq.power-stone-ring');
  });
  await withApi(async (get) => {
    assert.deepEqual(await get('/missing'), { status: 404,
      body: { code: 'NOT_FOUND', message: 'This product is no longer available.' } });
  }, () => []);
});

test('database errors use the existing error envelope without exposing internals', async () => {
  await withApi(async (get) => {
    for (const path of ['', '/power-stone-ring']) {
      const result = await get(path);
      assert.equal(result.status, 503);
      assert.equal(result.body.code, 'DATABASE_UNAVAILABLE');
      assert.equal(JSON.stringify(result.body).includes('private database detail'), false);
    }
  }, () => new Response(JSON.stringify({ message: 'private database detail', code: 'TEST_ERROR' }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  }));
});

test('search and total include matches beyond the first database batch', async () => {
  await withApi(async (get, requests) => {
    const result = await get('?q=purple');
    assert.equal(result.body.total, 101);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].searchParams.get('offset'), '100');
  }, (url) => Array.from({ length: url.searchParams.get('offset') === '0' ? 100 : 1 }, () => row));
});
