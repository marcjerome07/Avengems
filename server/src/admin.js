import { ApiError } from './errors.js';
import { cents, only, invalid, toOrder } from './checkout.js';
import { imageList } from './productImages.js';

export const STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
export const TRANSITIONS = { Pending: ['Processing'], Processing: ['Shipped'], Shipped: ['Delivered'], Delivered: [], Cancelled: [] };
export const TYPES = ['Ring', 'Necklace', 'Bracelet', 'Earrings'];
export const MATERIALS = ['925 Sterling Silver', 'Stainless Steel'];
export const ORDER_SELECT = '*, items:order_items(*)';
export async function adminDatabase(operation) {
  let result;
  try { result = await operation(); }
  catch { throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Store data is temporarily unavailable. Please retry.'); }
  if (result.error) {
    if (result.error.code === '23505') throw new ApiError(409, 'CONFLICT', 'A record with that identifier already exists. Refresh and retry.');
    if (result.error.code === '23503') throw new ApiError(409, 'CONFLICT', 'A referenced record changed. Refresh and retry.');
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Store data is temporarily unavailable. Please retry.');
  }
  return result.data;
}
export async function allRows(client, table, select = '*', apply = (query) => query) {
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const data = await adminDatabase(() => apply(client.from(table).select(select)).order('id').range(offset, offset + 99));
    rows.push(...data);
    if (data.length < 100) return rows;
  }
}

/** Server-only Auth directory read. Never return or log raw Auth user objects. */
export async function customerEmails(client, ids) {
  const emails = new Map();
  const remaining = new Set(ids);
  if (!remaining.size) return { emails, available: true };
  if (typeof client.auth?.admin?.listUsers !== 'function') return { emails, available: false };
  // Bound directory work to 5,000 Auth users, with no per-customer requests.
  // Increment pages ourselves: SDK pagination link metadata is not needed.
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    let result;
    try { result = await client.auth.admin.listUsers({ page, perPage }); }
    catch { return { emails, available: false }; }
    const users = result?.data?.users;
    if (result?.error || !Array.isArray(users) || users.length > perPage) return { emails, available: false };
    for (const user of users) {
      if (!remaining.has(user?.id)) continue;
      remaining.delete(user.id);
      if (typeof user.email_confirmed_at === 'string' && user.email_confirmed_at
        && typeof user.email === 'string' && user.email.trim()) emails.set(user.id, user.email.trim());
    }
    if (!remaining.size || users.length < perPage) return { emails, available: true };
  }
  return { emails, available: false };
}

export function customerSummaries({ profiles, orders, addresses, emails }) {
  const saved = new Map(), history = new Map();
  for (const address of addresses) {
    const previous = saved.get(address.user_id);
    // Prefer default; break ties (including multiple defaults) by UUID ascending.
    if (!previous || (address.is_default && !previous.is_default)
      || (address.is_default === previous.is_default && address.id < previous.id)) saved.set(address.user_id, address);
  }
  for (const order of orders) {
    const summary = history.get(order.user_id) ?? { count: 0, spent: 0, latest: null };
    summary.count++;
    if (order.status !== 'Cancelled' && (!order.payment_state || order.payment_state === 'paid')) summary.spent += cents(order.total);
    if (!Number.isSafeInteger(summary.spent)) throw new ApiError(503, 'REPORT_UNAVAILABLE', 'Report amount exceeds supported precision.');
    if (!summary.latest || String(order.created_at) > String(summary.latest.created_at)
      || (order.created_at === summary.latest.created_at && order.id < summary.latest.id)) summary.latest = order;
    history.set(order.user_id, summary);
  }
  return profiles.filter((profile) => profile.role === 'customer').map((profile) => {
    const summary = history.get(profile.id);
    return { id: profile.id, name: profile.name, phone: profile.phone ?? '', email: emails.get(profile.id) ?? null,
      city: saved.get(profile.id)?.city ?? null, lastOrderEmail: summary?.latest?.customer_email ?? null,
      orderCount: summary?.count ?? 0, totalSpent: (summary?.spent ?? 0) / 100, lastOrderAt: summary?.latest?.created_at ?? null };
  }).sort((a, b) => b.totalSpent - a.totalSpent || a.id.localeCompare(b.id));
}
export function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,149}$/.test(value)) invalid('Invalid record identifier.');
  return value;
}
export function text(value, field, max, optional = false) {
  if (typeof value !== 'string' || value.length > max || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) invalid(`Invalid ${field}.`);
  const result = value.trim();
  if (!optional && !result) invalid(`${field} is required.`);
  return result;
}
export function money(value) {
  try { return cents(value) / 100; } catch { invalid('Use nonnegative money with at most two decimal places, up to 99,999,999.99.'); }
}
function bool(value) { if (typeof value !== 'boolean') invalid('Flags must be boolean.'); return value; }
export function stock(value) { if (!Number.isInteger(value) || value < 0 || value > 2147483647) invalid('Stock must be a nonnegative 32-bit integer.'); return value; }
export function settingsPatch(body) {
  only(body, ['storeName', 'contactEmail', 'shippingFee', 'freeShippingThreshold']);
  if (!Object.keys(body).length) invalid('Provide settings to update.');
  const row = {};
  if (Object.hasOwn(body, 'storeName')) row.store_name = text(body.storeName, 'store name', 100);
  if (Object.hasOwn(body, 'contactEmail')) {
    row.contact_email = text(body.contactEmail, 'email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.contact_email)) invalid('Use a valid contact email.');
  }
  if (Object.hasOwn(body, 'shippingFee')) row.shipping_fee = money(body.shippingFee);
  if (Object.hasOwn(body, 'freeShippingThreshold')) row.free_shipping_threshold = money(body.freeShippingThreshold);
  return row;
}
export const toSettings = (row) => ({ storeName: row.store_name, contactEmail: row.contact_email,
  shippingFee: cents(row.shipping_fee) / 100, freeShippingThreshold: cents(row.free_shipping_threshold) / 100 });
export function productPatch(body, creating = false) {
  const mapping = { name: 'name', type: 'type', stone: 'stone', material: 'material', price: 'price', stock: 'stock',
    shortDescription: 'short_description', details: 'details', customizationFee: 'customization_fee',
    isFeatured: 'is_featured', isNew: 'is_new', sizes: 'sizes', defaultSize: 'default_size', images: 'images', archived: 'archived' };
  only(body, [...Object.keys(mapping), 'customizable', 'expectedStock', 'expectedImages']);
  if (!Object.keys(body).length) invalid('Provide product fields.');
  if (creating && Object.hasOwn(body, 'expectedStock')) invalid('expectedStock is only for inventory updates.');
  if (creating && Object.hasOwn(body, 'expectedImages')) invalid('expectedImages is only for image updates.');
  if (creating) for (const field of ['name', 'type', 'stone', 'material', 'price', 'stock', 'shortDescription', 'sizes', 'defaultSize', 'customizable', 'customizationFee']) {
    if (!Object.hasOwn(body, field)) invalid(`${field} is required.`);
  }
  const row = {};
  for (const [key, column] of Object.entries(mapping)) {
    if (!Object.hasOwn(body, key)) continue;
    const value = body[key];
    if (['price', 'customizationFee'].includes(key)) row[column] = money(value);
    else if (key === 'stock') row[column] = stock(value);
    else if (['isFeatured', 'isNew', 'archived'].includes(key)) row[column] = bool(value);
    else if (key === 'sizes') {
      if (!Array.isArray(value) || value.length > 30) invalid('Provide at most 30 sizes.');
      row[column] = [...new Set(value.map((size) => text(size, 'size', 50)))];
    } else if (key === 'images') row[column] = imageList(value);
    else if (key === 'defaultSize' && value === null) row[column] = null;
    else row[column] = text(value, key, key === 'details' ? 10000 : key === 'shortDescription' ? 500 : 150, key === 'details');
  }
  if (row.type && !TYPES.includes(row.type)) invalid('Unsupported jewelry type.');
  if (row.material && !MATERIALS.includes(row.material)) invalid('Unsupported material.');
  if (row.stone && !/^[a-z]{1,30}$/.test(row.stone)) invalid('Invalid stone.');
  if (Object.hasOwn(body, 'customizable')) {
    only(body.customizable, ['size', 'color']);
    if (Object.keys(body.customizable).length !== 2) invalid('Provide both customization flags.');
    row.customizable_size = bool(body.customizable.size); row.customizable_color = bool(body.customizable.color);
  }
  // Keep size/flag/default changes together so concurrent edits cannot create an invalid combination.
  if (['sizes', 'defaultSize', 'customizable'].some((key) => Object.hasOwn(body, key))) {
    if (!['sizes', 'defaultSize', 'customizable'].every((key) => Object.hasOwn(body, key))) invalid('Update sizes, defaultSize and customizable together.');
    if ((row.default_size !== null && !row.sizes.includes(row.default_size)) || (row.customizable_size && !row.sizes.includes(row.default_size))) invalid('Default size must be one of the supported sizes.');
  }
  if (!creating && Object.hasOwn(body, 'stock')) {
    if (!Object.hasOwn(body, 'expectedStock')) invalid('Inventory changes require expectedStock.');
    stock(body.expectedStock);
  } else if (Object.hasOwn(body, 'expectedStock')) invalid('expectedStock requires a stock change.');
  // Like expectedStock: image edits name the list they were based on, so a stale
  // form cannot silently overwrite (or delete files from) another admin's changes.
  if (!creating && Object.hasOwn(body, 'images')) {
    if (!Object.hasOwn(body, 'expectedImages')) invalid('Image changes require expectedImages.');
    imageList(body.expectedImages, 10);
  } else if (Object.hasOwn(body, 'expectedImages')) invalid('expectedImages requires an image change.');
  if (!Object.keys(row).length) invalid('Provide product fields.');
  return row;
}
export function reports({ orders, products, profiles, collections }, months = 6, now = new Date()) {
  const amount = (value) => cents(value);
  const sum = (values) => {
    const total = values.reduce((a, b) => a + b, 0);
    if (!Number.isSafeInteger(total)) throw new ApiError(503, 'REPORT_UNAVAILABLE', 'Report amount exceeds supported precision.');
    return total;
  };
  const active = orders.filter((order) => order.status !== 'Cancelled' && (!order.payment_state || order.payment_state === 'paid'));
  const sales = Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1 + index, 1));
    const matching = active.filter((order) => String(order.created_at).slice(0, 7) === date.toISOString().slice(0, 7));
    return { month: date.toLocaleDateString('en-PH', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      sales: sum(matching.map((order) => amount(order.total))) / 100, orders: matching.length };
  });
  const entries = new Map();
  for (const order of active) for (const item of order.items ?? []) {
    const id = JSON.stringify([item.product_id, item.stone, item.type]);
    const entry = entries.get(id) ?? { productId: item.product_id, name: item.product_name, type: item.type, stone: item.stone, units: 0, revenue: 0 };
    entry.units += item.quantity;
    entry.revenue = sum([entry.revenue, amount(item.unit_price) * item.quantity]); entries.set(id, entry);
  }
  const values = [...entries.values()];
  const top = new Map();
  for (const entry of values) {
    const previous = top.get(entry.productId) ?? { ...entry, units: 0, revenue: 0 };
    previous.units += entry.units; previous.revenue = sum([previous.revenue, entry.revenue]); top.set(entry.productId, previous);
  }
  const best = [...top.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.productId.localeCompare(b.productId))
    .map((entry) => ({ ...entry, revenue: entry.revenue / 100 }));
  const sorted = [...orders].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || a.id.localeCompare(b.id));
  return { stats: { totalSales: sum(active.map((order) => amount(order.total))) / 100, totalOrders: orders.length,
    totalProducts: products.filter((product) => !product.archived).length, totalCustomers: profiles.filter((profile) => profile.role === 'customer').length },
    sales, status: STATUSES.map((status) => ({ status, count: orders.filter((order) => order.status === status).length })),
    recent: sorted.slice(0, 6).map(toOrder), best: best.slice(0, 5),
    analytics: { byStone: collections.map((collection) => ({ stone: collection.stone, color: collection.color,
      units: sum(values.filter((entry) => entry.stone === collection.stone).map((entry) => entry.units)),
      revenue: sum(values.filter((entry) => entry.stone === collection.stone).map((entry) => entry.revenue)) / 100 })),
    byType: TYPES.map((type) => ({ type, units: sum(values.filter((entry) => entry.type === type).map((entry) => entry.units)),
      revenue: sum(values.filter((entry) => entry.type === type).map((entry) => entry.revenue)) / 100 })), topProducts: best.slice(0, 8) } };
}
