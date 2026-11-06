import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

// Load through Vite to resolve the frontend's extensionless imports.
const vite = await createServer({ configFile: false, server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
after(() => vite.close());
const service = await vite.ssrLoadModule('/src/services/productService.js');
const { getCustomization } = await vite.ssrLoadModule('/src/utils/customization.js');
const product = {
  id: 'api-only', slug: 'api-only-ring', name: 'API ring', type: 'Ring', stone: 'power',
  color: 'Purple', gemstone: 'Amethyst', material: '925 Sterling Silver', price: 649,
  stock: 5, rating: 4.8, reviewCount: 124, isNew: false, isFeatured: true,
  customizable: { size: true, color: true }, customizationFee: 250,
  sizes: ['US 7', 'US 8'], defaultSize: 'US 7', images: [], addedAt: '2026-04-02',
};

test('listing translates frontend filters to encoded API parameters and preserves the response', async (t) => {
  const payload = { items: [product], total: 1 };
  t.mock.method(globalThis, 'fetch', async (url) => {
    const request = new URL(url, 'http://localhost');
    assert.equal(request.pathname, '/api/products');
    assert.deepEqual(Object.fromEntries(request.searchParams), {
      type: 'Ring,Necklace', stone: 'power,space', material: '925 Sterling Silver',
      q: 'purple & rings', minPrice: '0', maxPrice: '900', sort: 'price-asc',
      inStock: 'true', customizable: 'true',
    });
    return Response.json(payload);
  });
  assert.deepEqual(await service.getProducts({ types: ['Ring', 'Necklace'], stones: ['power', 'space'],
    materials: ['925 Sterling Silver'], q: 'purple & rings', minPrice: 0, maxPrice: 900,
    sort: 'price-asc', inStock: true, customizable: true }), payload);
});

test('default and empty filters fetch the full API catalog without a mock fallback', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/api/products');
    return Response.json({ items: [], total: 0 });
  });
  assert.deepEqual(await service.getProducts(), { items: [], total: 0 });
  assert.deepEqual(await service.getProducts({ q: '', types: [], stones: [], materials: [],
    minPrice: '', maxPrice: null, inStock: false, customizable: false }), { items: [], total: 0 });
});

test('detail uses an encoded slug and preserves customization and numeric fields', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/api/products/ring%2Fwith%20space%3F');
    return Response.json(product);
  });
  const result = await service.getProductBySlug('ring/with space?');
  assert.deepEqual(result, product);
  assert.equal(result.price + getCustomization(result, 'Blue', 'US 8').fee, 899);
  assert.equal(getCustomization(result, result.color, result.defaultSize).fee, 0);
});

test('API failures preserve error codes and messages', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'NOT_FOUND',
    message: 'This product is no longer available.' }, { status: 404 }));
  await assert.rejects(service.getProductBySlug('missing'), {
    code: 'NOT_FOUND', message: 'This product is no longer available.',
  });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'DATABASE_UNAVAILABLE',
    message: 'Products are temporarily unavailable.' }, { status: 503 }));
  await assert.rejects(service.getProducts(), { code: 'DATABASE_UNAVAILABLE' });
});

test('network and non-JSON proxy failures reject with displayable errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(service.getProducts(), { code: 'NETWORK_ERROR' });
  t.mock.method(globalThis, 'fetch', async () => new Response('Proxy unavailable', { status: 502 }));
  await assert.rejects(service.getProducts(), { code: 'SERVER_ERROR' });
});

test('featured, ID, collection, related and suggested products use real catalog reads; packages remain static content', async (t) => {
  const other = { ...product, id: 'second', stone: 'space', isFeatured: false };
  const collection = { id: 'col-power', slug: 'power', stone: 'power', color: 'Purple', gemstone: 'Amethyst' };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    const query = new URL(url, 'http://localhost');
    if (query.pathname === '/api/collections') return Response.json({ items: [collection] });
    assert.equal(query.pathname, '/api/products');
    const ids = query.searchParams.get('ids')?.split(',');
    const stone = query.searchParams.get('stone');
    const items = [product, other].filter((item) => (!ids || ids.includes(item.id)) && (!stone || stone === item.stone));
    return Response.json({ items, total: items.length });
  });
  assert.deepEqual(await service.getFeaturedProducts(), [product]);
  assert.deepEqual(await service.getProductsByIds([product.id]), [product]);
  assert.deepEqual(await service.getProductsByIds([]), []);
  assert.deepEqual(await service.getCollections(), [collection]);
  assert.deepEqual((await service.getCollectionBySlug('power')).products, [product]);
  assert.deepEqual(await service.getRelatedProducts(product), [other]);
  assert.deepEqual(await service.getSuggestedProducts(['power']), [other]);
  const before = calls.length;
  assert.ok((await service.getPackages()).length > 0);
  assert.equal(calls.length, before);
  assert.equal(service.getMockProducts, undefined);
});
