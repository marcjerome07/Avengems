import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { cartItems, checkoutBody, quoteCart, cents, toOrder } from '../src/checkout.js';
import { createCartQuoteRouter } from '../src/routes/checkout.js';
import { createMeRouter } from '../src/routes/me.js';
import { createCookieSessions } from '../src/sessions.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { errorHandler } from '../src/errors.js';
import { unauthorized } from '../src/auth.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const key = '33333333-3333-4333-8333-333333333333';
const product = { id: 'p-01', name: 'Original Ring', slug: 'original-ring', type: 'Ring', material: 'Silver', stone: 'power',
  collection: { color: 'Purple' }, price: '900.10', customization_fee: '100.20', stock: 10, sizes: ['US 5', 'US 6'],
  default_size: 'US 5', customizable_size: true, customizable_color: true, archived: false, images: [] };
const collections = [{ stone: 'power', color: 'Purple' }, { stone: 'space', color: 'Blue' }];
const request = { items: [{ productId: 'p-01', quantity: 2, color: 'Blue', size: 'US 6' }],
  customer: { name: 'Customer Name', email: 'customer@example.test', phone: '09171234567' },
  shipping: { address: '12 Test Street', city: 'Manila', province: 'Metro Manila', postalCode: '1000' }, paymentMethod: 'cod' };
const order = { id: 'AVG-2026-TEST', user_id: owner, created_at: '2026-01-01', status: 'Pending', payment_method: 'cod',
  customer_name: 'Customer Name', customer_email: 'customer@example.test', customer_phone: '09171234567',
  ship_address: '12 Original Street', ship_city: 'Manila', ship_province: 'Metro Manila', ship_postal_code: '1000',
  subtotal: '1800.20', customization_total: '200.40', shipping_fee: '0', total: '2000.60',
  checkout_key: key, checkout_request: request, items: [{ id: 1, product_id: 'p-01', product_name: 'Original Ring',
    product_slug: 'original-ring', type: 'Ring', material: 'Silver', stone: 'space', color: 'Blue', size: 'US 6',
    base_price: '900.10', customization_fee: '100.20', unit_price: '1000.30', customized: true, quantity: 2 }] };

function database(options = {}) {
  const calls = [];
  const db = { calls, from(table) {
    let filters = [], ids;
    const query = { select() { return query; }, eq(name, value) { filters.push([name, value]); return query; },
      in(_name, values) { ids = values; return query; }, order() { return query; }, range() { return query; },
      maybeSingle() { return run(true); }, then(resolve, reject) { return run(false).then(resolve, reject); } };
    async function run(single) {
      calls.push({ table, filters, ids });
      if (options.failTable === table) {
        if (options.throws) throw new Error('private database details');
        return { error: { message: 'private database details' } };
      }
      let rows;
      if (table === 'profiles') rows = [{ id: owner, name: 'Customer Name', role: options.role ?? 'customer', phone: '', created_at: '2026-01-01' }];
      else if (table === 'products') rows = (options.products ?? [product]).filter((row) => ids.includes(row.id));
      else if (table === 'collections') rows = options.collections ?? collections;
      else if (table === 'store_settings') rows = options.noSettings ? [] : [options.settings ?? { shipping_fee: '120.00', free_shipping_threshold: '2000.00' }];
      else if (table === 'orders') rows = options.orders ?? [order, { ...order, id: 'OTHER', user_id: other }];
      else assert.fail(`Unexpected table operation ${table}`);
      rows = rows.filter((row) => filters.every(([name, value]) => name === 'id' && table === 'store_settings' ? value === 1 : row[name] === value));
      return { data: single ? rows[0] ?? null : rows };
    }
    return query;
  }, async rpc(name, args) {
    calls.push({ rpc: name, args });
    if (name === 'customer_cancellation_version') return options.capabilityError ? { error: { code: 'PGRST202' } } : { data: options.capability ?? 1 };
    if (options.rpcThrows) throw new Error('private transaction details');
    return options.rpc ? options.rpc(args) : { data: options.rpcData ?? (name === 'customer_cancel_order' ? { ...order, status: 'Cancelled' } : order), error: options.rpcError };
  } };
  return db;
}

test('quote uses integer centavos and authoritative prices, fees and shipping threshold', async () => {
  const quote = await quoteCart(database(), cartItems(request.items));
  assert.deepEqual(quote.totals, { itemCount: 2, subtotal: 1800.2, customizationTotal: 200.4, shippingFee: 0,
    total: 2000.6, freeThreshold: 2000, freeShippingRemaining: 0 });
  assert.equal(quote.items[0].unitPrice, 1000.3);
  assert.equal(quote.items[0].stone, 'space');
  const regular = await quoteCart(database(), cartItems([{ productId: 'p-01', quantity: 1 }]));
  assert.equal(regular.totals.customizationTotal, 0);
  assert.equal(regular.totals.shippingFee, 120);
  assert.equal(regular.totals.total, 1020.1);
  const boundary = await quoteCart(database({ products: [{ ...product, price: '1000' }] }), cartItems([{ productId: 'p-01', quantity: 2 }]));
  assert.equal(boundary.totals.shippingFee, 0);
  assert.equal(cents('0.10'), 10);
});

test('quote rejects missing/archived products, invalid options, duplicate variants and aggregate stock shortages', async () => {
  for (const [options, items, code] of [
    [{ products: [] }, request.items, 'PRODUCT_UNAVAILABLE'],
    [{ products: [{ ...product, archived: true }] }, request.items, 'PRODUCT_UNAVAILABLE'],
    [{ products: [{ ...product, customizable_color: false }] }, request.items, 'INVALID_CUSTOMIZATION'],
    [{}, [{ productId: 'p-01', quantity: 1, size: 'Invalid' }], 'INVALID_CUSTOMIZATION'],
    [{}, [{ productId: 'p-01', quantity: 1, color: 'Unknown' }], 'INVALID_CUSTOMIZATION'],
    [{ products: [{ ...product, stock: 3 }] }, [{ productId: 'p-01', quantity: 2 }, { productId: 'p-01', quantity: 2, color: 'Blue' }], 'INSUFFICIENT_STOCK'],
    [{}, [{ productId: 'p-01', quantity: 1 }, { productId: 'p-01', quantity: 1 }], 'VALIDATION_ERROR'],
  ]) await assert.rejects(quoteCart(database(options), cartItems(items)), { code });
});

test('cart/checkout allowlists reject prices, stock, ownership, statuses, payment details and invalid quantities', () => {
  for (const items of [[], Array(51).fill(request.items[0]), [{ ...request.items[0], quantity: 0 }], [{ ...request.items[0], quantity: 1.5 }],
    [{ ...request.items[0], quantity: 11 }], [{ ...request.items[0], price: 1 }], [{ ...request.items[0], stock: 999 }]]) assert.throws(() => cartItems(items));
  for (const extra of [{ userId: other }, { total: 1 }, { status: 'Delivered' }, { cardNumber: 'not-allowed' }]) assert.throws(() => checkoutBody({ ...request, ...extra }));
  assert.throws(() => checkoutBody({ ...request, paymentMethod: 'paid' }));
  assert.throws(() => checkoutBody({ ...request, shipping: { addressId: owner, city: 'injected' } }));
  assert.throws(() => checkoutBody({ ...request, customer: { ...request.customer, email: 'bad' } }));
  const normalized = checkoutBody({ ...request, customer: { ...request.customer, name: ' Customer   Name ', phone: '0917 123 4567', email: ' CUSTOMER@EXAMPLE.TEST ' } });
  assert.equal(normalized.customer.email, 'customer@example.test');
  assert.equal(normalized.customer.phone, '09171234567');
});

test('missing settings, invalid monetary values and database failures fail closed', async () => {
  for (const options of [{ noSettings: true }, { failTable: 'products' }, { failTable: 'collections', throws: true }, { settings: { shipping_fee: '-1', free_shipping_threshold: '2000' } }]) {
    await assert.rejects(quoteCart(database(options), cartItems([{ productId: 'p-01', quantity: 1 }])), (error) => error.status === 503 && !error.message.includes('private'));
  }
});

test('all configured product and shipping money rejects non-finite, negative, malformed and missing values', async () => {
  const invalidMoney = ['NaN', 'Infinity', '-Infinity', NaN, Infinity, -Infinity, '-0.01', -1,
    null, undefined, '', ' ', '1.001', '100000000', '1e2', true, {}, ['120']];
  for (const value of invalidMoney) {
    assert.throws(() => cents(value), { status: 503, code: 'CATALOG_UNAVAILABLE' });
    for (const field of ['price', 'customization_fee']) {
      // Both default and customized lines validate the configured fee.
      for (const items of [[{ productId: 'p-01', quantity: 1 }], request.items]) {
        await assert.rejects(quoteCart(database({ products: [{ ...product, [field]: value }] }), cartItems(items)),
          { status: 503, code: 'CATALOG_UNAVAILABLE' });
      }
    }
    for (const field of ['shipping_fee', 'free_shipping_threshold']) {
      // The ordinary quote already qualifies for free shipping; invalid fees must still fail.
      await assert.rejects(quoteCart(database({ settings: { shipping_fee: '120.00', free_shipping_threshold: '2000.00', [field]: value } }), cartItems(request.items)),
        { status: 503, code: 'CATALOG_UNAVAILABLE' });
    }
  }
});

test('finite monetary boundaries preserve zero fees, exact centavos and free-shipping rules', async () => {
  for (const [value, expected] of [[0, 0], [-0, 0], ['0.00', 0], ['0.10', 10], ['120.00', 12000], ['99999999.99', 9999999999]]) assert.equal(cents(value), expected);
  const quote = await quoteCart(database({ products: [{ ...product, price: '999.99', customization_fee: '0' }] }), cartItems([{ productId: 'p-01', quantity: 2 }]));
  assert.equal(quote.totals.subtotal, 1999.98);
  assert.equal(quote.totals.freeShippingRemaining, 0.02);
  assert.equal(quote.totals.shippingFee, 120);
  const free = await quoteCart(database({ settings: { shipping_fee: '0', free_shipping_threshold: '0' } }), cartItems(request.items));
  assert.equal(free.totals.shippingFee, 0);
  assert.equal(free.totals.freeShippingRemaining, 0);
});

test('collection matching rejects ambiguity regardless of row order and does not choose an arbitrary stone', async () => {
  const duplicate = { stone: 'duplicate', color: 'Blue' };
  for (const rows of [[...collections, duplicate], [duplicate, ...collections]]) {
    await assert.rejects(quoteCart(database({ collections: rows }), cartItems(request.items)),
      { status: 503, code: 'CATALOG_UNAVAILABLE' });
  }
  await assert.rejects(quoteCart(database({ collections: collections.filter((row) => row.color !== 'Blue') }), cartItems(request.items)),
    { code: 'INVALID_CUSTOMIZATION' });
  const unique = await quoteCart(database({ collections: [...collections].reverse() }), cartItems(request.items));
  assert.equal(unique.items[0].stone, 'space');
});

async function api(run, options = {}) {
  const db = database(options);
  const sessions = createCookieSessions({ origin: 'http://localhost:5173' });
  const app = express(); app.use(express.json());
  app.use('/api/auth', createAuthRouter(sessions));
  app.use('/api/cart', createCartQuoteRouter(db, sessions));
  app.use('/api/me', createMeRouter({ client: db, cookieSessions: sessions, payments: options.payments, customerCancellationEnabled: options.customerCancellationEnabled, verifyAccessToken: async (token) => {
    if (token !== 'valid') throw unauthorized();
    return { id: owner, email: 'customer@example.test', email_confirmed_at: options.unconfirmed ? null : '2026-01-01' };
  } }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const csrf = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = await csrf.json();
  const cookie = csrf.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  async function send(path, method = 'GET', body, headers = {}) {
    const response = await fetch(base + path, { method, headers: { Authorization: 'Bearer valid', Origin: 'http://localhost:5173',
      Cookie: cookie, 'X-CSRF-Token': csrfToken, 'Idempotency-Key': key, 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  try { await run({ send, calls: db.calls }); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('selected subset quotes only submitted products and recalculates shipping without unselected stock', async () => {
  await api(async ({ send, calls }) => {
    const chosen = [{ productId: product.id, quantity: 1, color: 'Purple', size: 'US 5' }];
    const result = await send('/api/cart/quote', 'POST', { items: chosen });
    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 1);
    assert.equal(result.body.totals.subtotal, 900.1);
    assert.equal(result.body.totals.shippingFee, 120);
    assert.equal(result.body.totals.total, 1020.1);
    assert.equal(result.body.totals.freeShippingRemaining, 1099.9);
    assert.deepEqual(calls.find((call) => call.table === 'products').ids, [product.id]);
  }, { products: [product, { ...product, id: 'unselected', stock: 0, archived: true }] });
});

test('subset placement forwards only the submitted lines to the atomic RPC with the same retry key', async () => {
  await api(async ({ send, calls }) => {
    const body = { ...request, items: [{ productId: product.id, quantity: 1, color: 'Purple', size: 'US 5' }] };
    for (let retry = 0; retry < 2; retry++) assert.equal((await send('/api/me/orders', 'POST', body)).status, 200);
    const placements = calls.filter((call) => call.rpc === 'customer_checkout');
    assert.equal(placements.length, 2);
    for (const call of placements) assert.deepEqual(call.args, { p_user_id: owner, p_key: key, p_request: checkoutBody(body) });
    assert.equal(calls.some((call) => call.table === 'products'), false, 'No sequential client-side inventory writes');
  });
});

test('empty selections, forged selection metadata and changed stock fail before order placement', async () => {
  await api(async ({ send, calls }) => {
    for (const items of [[], [{ ...request.items[0], selected: true }], [{ ...request.items[0], quantity: 0 }]]) {
      assert.equal((await send('/api/me/orders', 'POST', { ...request, items })).status, 400);
    }
    assert.equal(calls.some((call) => call.rpc === 'customer_checkout'), false);
    const changed = await send('/api/cart/quote', 'POST', { items: request.items });
    assert.equal(changed.status, 409);
    assert.equal(changed.body.code, 'INSUFFICIENT_STOCK');
  }, { products: [{ ...product, stock: 1 }] });
});

test('payment routes inherit verified customer, Origin and CSRF protections', async () => {
  let invoked=0;
  const payments={capabilities:async()=>({methods:['cod'],online:false}),status:async()=>({status:'pending'}),
    initiate:async(id,userId)=>{invoked++;assert.equal(userId,owner);assert.equal(id,'AVG-TEST');return{payment:{status:'pending'}};}};
  for(const options of [{role:'admin'},{unconfirmed:true}])await api(async({send})=>{
    assert.equal((await send('/api/me/payments/methods')).status,403);
    assert.equal((await send('/api/me/payments/AVG-TEST/start','POST',{})).status,403);
  },{...options,payments});
  await api(async({send})=>{
    assert.equal((await send('/api/me/payments/AVG-TEST/start','POST',{}, {Authorization:''})).status,401);
    assert.equal((await send('/api/me/payments/AVG-TEST/start','POST',{}, {'X-CSRF-Token':''})).status,403);
    assert.equal((await send('/api/me/payments/AVG-TEST/start','POST',{amount:1})).status,400);
    assert.equal((await send('/api/me/payments/AVG-TEST/start','POST',{})).status,200);
  },{payments});
  assert.equal(invoked,1);
});

test('online checkout cannot use the former demo path when the payment integration is absent',async()=>{
  await api(async({send,calls})=>{
    for(const method of ['gcash','maya','card'])assert.equal((await send('/api/me/orders','POST',{...request,paymentMethod:method})).status,503);
    assert.equal(calls.some(call=>call.rpc==='customer_checkout'),false);
    assert.equal((await send('/api/me/orders','POST',request)).status,200);
  });
});

test('quote endpoint is available to guests, protected by Origin/CSRF, and returns no-store', async () => {
  await api(async ({ send }) => {
    const result = await send('/api/cart/quote', 'POST', { items: request.items }, { Authorization: '' });
    assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
    for (const headers of [{ Origin: '' }, { Origin: 'https://attacker.test' }, { 'X-CSRF-Token': '' }]) assert.equal((await send('/api/cart/quote', 'POST', { items: request.items }, headers)).status, 403);
    assert.equal((await send('/api/cart/quote', 'POST', { items: request.items, total: 1 })).status, 400);
  });
});

test('private order routes reject expired/missing auth and all writes require CSRF/Origin', async () => {
  await api(async ({ send, calls }) => {
    for (const path of ['/api/me/orders', '/api/me/orders/AVG-2026-TEST']) assert.equal((await send(path, 'GET', undefined, { Authorization: 'Bearer expired' })).status, 401);
    assert.equal((await send('/api/me/orders', 'POST', request, { Authorization: '' })).status, 401);
    for (const headers of [{ Origin: 'https://attacker.test' }, { 'X-CSRF-Token': '' }]) assert.equal((await send('/api/me/orders', 'POST', request, headers)).status, 403);
    assert.equal(calls.length, 0);
  });
});

test('order placement forwards verified ownership and exactly one transactional RPC, never REST writes', async () => {
  await api(async ({ send, calls }) => {
    const result = await send('/api/me/orders', 'POST', request);
    assert.equal(result.status, 200);
    assert.deepEqual(calls.filter((call) => call.rpc), [{ rpc: 'customer_checkout', args: { p_user_id: owner, p_key: key, p_request: checkoutBody(request) } }]);
    assert.deepEqual(calls.filter((call) => call.table).map((call) => call.table), ['profiles']);
    assert.equal(result.body.items[0].name, 'Original Ring');
    assert.equal(result.body.checkout_request, undefined);
    assert.equal(result.body.user_id, undefined);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal((await send('/api/me/orders', 'POST', request, { 'Idempotency-Key': 'bad' })).status, 400);
    assert.equal((await send('/api/me/orders', 'POST', { ...request, userId: other })).status, 400);
  });
});

test('order reads are owner-scoped and use historical snapshots without looking up current products', async () => {
  await api(async ({ send, calls }) => {
    const list = await send('/api/me/orders?userId=' + other);
    assert.deepEqual(list.body.items.map((item) => item.id), [order.id]);
    const result = await send('/api/me/orders/' + order.id);
    assert.equal(result.body.shipping.address, '12 Original Street');
    assert.equal(result.body.items[0].unitPrice, 1000.3);
    assert.equal((await send('/api/me/orders/OTHER?isAdmin=true')).status, 404);
    assert.equal(calls.some((call) => call.table === 'products'), false);
  });
  assert.equal(toOrder(order).checkout_key, undefined);
});

test('customer cancellation is disabled by default and requires the validated version capability', async () => {
  for (const options of [{}, { customerCancellationEnabled: true, capabilityError: true }, { customerCancellationEnabled: true, capability: 0 }]) {
    await api(async ({ send, calls }) => {
      assert.equal((await send('/api/me/orders/' + order.id)).body.canCancel, false);
      const result = await send(`/api/me/orders/${order.id}/cancel`, 'POST', {});
      assert.equal(result.status, 503); assert.equal(result.body.code, 'CUSTOMER_CANCELLATION_DISABLED');
      assert.equal(calls.some((call) => call.rpc === 'customer_cancel_order' || call.rpc === 'admin_cancel_order'), false);
    }, options);
  }
});

test('eligible customer cancellation is owner-scoped, uses only the customer RPC and preserves internal ID', async () => {
  await api(async ({ send, calls }) => {
    assert.equal((await send('/api/me/orders/' + order.id)).body.canCancel, true);
    const result = await send(`/api/me/orders/${order.id}/cancel`, 'POST', {});
    assert.equal(result.status, 200); assert.equal(result.body.id, order.id); assert.equal(result.body.status, 'Cancelled');
    assert.equal(result.body.canCancel, false); assert.equal(result.body.checkout_request, undefined);
    assert.deepEqual(calls.filter((call) => call.rpc === 'customer_cancel_order'), [
      { rpc: 'customer_cancel_order', args: { p_user_id: owner, p_order_id: order.id } },
    ]);
    assert.equal(calls.some((call) => call.rpc === 'admin_cancel_order'), false);
    assert.ok(calls.filter((call) => call.table === 'orders').every((call) => call.filters.some(([field, value]) => field === 'user_id' && value === owner)));
  }, { customerCancellationEnabled: true });
  assert.equal(toOrder({ ...order, order_reference: 'AVG-2026-0001' }).reference, 'AVG-2026-0001');
  assert.equal(toOrder(order).reference, null); assert.equal(toOrder({ ...order, order_reference: 'untrusted' }).reference, null);
});

test('customer cancellation rejects other owners, injected identities, CSRF/Origin and unauthenticated requests', async () => {
  await api(async ({ send, calls }) => {
    assert.equal((await send('/api/me/orders/OTHER/cancel', 'POST', {})).status, 404);
    for (const body of [{ userId: other }, { p_admin_id: owner }, { status: 'Cancelled' }, { quantity: 99 }, []])
      assert.equal((await send(`/api/me/orders/${order.id}/cancel`, 'POST', body)).status, 400);
    for (const headers of [{ Origin: '' }, { Origin: 'https://attacker.test' }, { 'X-CSRF-Token': '' }])
      assert.equal((await send(`/api/me/orders/${order.id}/cancel`, 'POST', {}, headers)).status, 403);
    assert.equal((await send(`/api/me/orders/${order.id}/cancel`, 'POST', {}, { Authorization: '' })).status, 401);
    assert.equal(calls.some((call) => call.rpc === 'customer_cancel_order'), false);
  }, { customerCancellationEnabled: true });
  for (const options of [{ unconfirmed: true }, { role: 'admin' }]) await api(async ({ send, calls }) => {
    assert.equal((await send(`/api/me/orders/${order.id}/cancel`, 'POST', {})).status, 403);
    assert.equal(calls.some((call) => call.rpc), false);
  }, { ...options, customerCancellationEnabled: true });
});

test('terminal and legacy orders cannot cancel; stale status and inventory failures are sanitized', async () => {
  for (const changed of [{ status: 'Cancelled' }, { status: 'Shipped' }, { status: 'Delivered' }, { checkout_key: null }, { checkout_request: null }])
    await api(async ({ send, calls }) => {
      assert.equal((await send('/api/me/orders/' + order.id)).body.canCancel, false);
      assert.equal((await send(`/api/me/orders/${order.id}/cancel`, 'POST', {})).status, 409);
      assert.equal(calls.some((call) => call.rpc === 'customer_cancel_order'), false);
    }, { customerCancellationEnabled: true, orders: [{ ...order, ...changed }] });
  for (const [code, status] of [['P3001', 403], ['P3002', 404], ['P3003', 409], ['P3004', 409], ['PGRST202', 503], ['private', 503]])
    await api(async ({ send }) => {
      const result = await send(`/api/me/orders/${order.id}/cancel`, 'POST', {});
      assert.equal(result.status, status); assert.doesNotMatch(JSON.stringify(result.body), /private/);
    }, { customerCancellationEnabled: true, rpcError: { code, message: 'private raw transaction error' } });
});

test('RPC outcomes for ownership, stock, conflicts, rollback and missing migration are safe', async () => {
  for (const [code, status, expected] of [['P1001', 409, 'IDEMPOTENCY_CONFLICT'], ['P1002', 409, 'INSUFFICIENT_STOCK'],
    ['P1003', 409, 'PRODUCT_UNAVAILABLE'], ['P1004', 400, 'INVALID_CUSTOMIZATION'], ['P1005', 404, 'NOT_FOUND'],
    ['PGRST202', 503, 'CHECKOUT_MIGRATION_REQUIRED'], ['23514', 503, 'CHECKOUT_UNAVAILABLE']]) await api(async ({ send, calls }) => {
    const result = await send('/api/me/orders', 'POST', { ...request, shipping: { addressId: other } });
    assert.equal(result.status, status); assert.equal(result.body.code, expected);
    assert.doesNotMatch(JSON.stringify(result.body), /private/);
    assert.equal(calls.filter((call) => call.rpc).length, 1);
    assert.equal(calls.filter((call) => call.table !== 'profiles' && call.table).length, 0);
  }, { rpcError: { code, message: 'private transaction detail' } });
});

test('duplicate concurrent API requests preserve the same user/key and accept the RPC replay result', async () => {
  // Contract fixture only: actual SQL locking/rollback requires approved PostgreSQL staging tests.
  let invocations = 0;
  await api(async ({ send }) => {
    const results = await Promise.all([send('/api/me/orders', 'POST', request), send('/api/me/orders', 'POST', request)]);
    assert.deepEqual(results.map((result) => result.body.id), [order.id, order.id]);
    assert.equal(invocations, 2);
  }, { rpc: async (args) => { invocations++; assert.equal(args.p_key, key); assert.equal(args.p_user_id, owner); return { data: order }; } });
});

test('simultaneous purchase outcomes are passed through without a non-atomic fallback', async () => {
  let calls = 0;
  await api(async ({ send }) => {
    const results = await Promise.all([send('/api/me/orders', 'POST', request), send('/api/me/orders', 'POST', request, { 'Idempotency-Key': '44444444-4444-4444-8444-444444444444' })]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  }, { rpc: async () => ++calls === 1 ? { data: order } : { error: { code: 'P1002' } } });
});

test('thrown and invalid RPC responses never falsely confirm an order', async () => {
  for (const options of [{ rpcThrows: true }, { rpcData: { id: order.id, user_id: other, items: [] } }, { rpcData: {} }]) await api(async ({ send }) => {
    const result = await send('/api/me/orders', 'POST', request);
    assert.equal(result.status, 503); assert.equal(result.body.code, 'CHECKOUT_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(result.body), /private/);
  }, options);
});
