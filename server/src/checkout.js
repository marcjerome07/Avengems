import { ApiError } from './errors.js';
import { addressId, addressPatch, database } from './customer.js';
import { PRODUCT_SELECT } from './routes/products.js';

export function invalid(message, code = 'VALIDATION_ERROR', status = 400) { throw new ApiError(status, code, message); }
export function only(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) invalid('Provide only supported fields.');
}
export function cartItems(value) {
  if (!Array.isArray(value) || !value.length || value.length > 50) invalid('Provide 1–50 cart lines.');
  return value.map((line) => {
    only(line, ['productId', 'quantity', 'color', 'size']);
    if (typeof line.productId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(line.productId)
      || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10) invalid('Use valid product IDs and quantities from 1 to 10.');
    for (const key of ['color', 'size']) if (line[key] != null && (typeof line[key] !== 'string' || !line[key].length || line[key].length > 100)) invalid(`Invalid ${key}.`);
    return { productId: line.productId, quantity: line.quantity, color: line.color ?? null, size: line.size ?? null };
  });
}
export function checkoutBody(body) {
  only(body, ['items', 'customer', 'shipping', 'paymentMethod']);
  const items = cartItems(body.items);
  only(body.customer, ['name', 'email', 'phone']);
  const validated = addressPatch({ fullName: body.customer.name, phone: body.customer.phone });
  if (typeof body.customer.email !== 'string' || body.customer.email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.customer.email.trim())) invalid('Use a valid contact email.');
  const customer = { name: validated.full_name, phone: validated.phone, email: body.customer.email.trim().toLowerCase() };
  only(body.shipping, ['addressId', 'address', 'city', 'province', 'postalCode']);
  let shipping;
  if (Object.hasOwn(body.shipping, 'addressId')) {
    if (typeof body.shipping.addressId !== 'string') invalid('Invalid saved address identifier.');
    if (Object.keys(body.shipping).length !== 1) invalid('Choose a saved address or provide a manual address.');
    shipping = { addressId: addressId(body.shipping.addressId) };
  } else {
    const row = addressPatch({ ...body.shipping, fullName: customer.name, phone: customer.phone }, true);
    shipping = { address: row.address, city: row.city, province: row.province, postalCode: row.postal_code };
  }
  if (!['gcash', 'maya', 'cod', 'card'].includes(body.paymentMethod)) invalid('Choose a supported demo payment method.');
  return { items, customer, shipping, paymentMethod: body.paymentMethod };
}
export function cents(value) {
  const match = typeof value === 'string' || typeof value === 'number'
    ? /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(String(value)) : null;
  if (!match) throw new ApiError(503, 'CATALOG_UNAVAILABLE', 'Pricing is temporarily unavailable.');
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
export async function quoteCart(client, requested) {
  const [products, settings, collections] = await Promise.all([
    database(() => client.from('products').select(PRODUCT_SELECT).in('id', [...new Set(requested.map((item) => item.productId))]).eq('archived', false)),
    database(() => client.from('store_settings').select('shipping_fee, free_shipping_threshold').eq('id', 1).maybeSingle()),
    database(() => client.from('collections').select('stone, color')),
  ]);
  if (!settings) throw new ApiError(503, 'CATALOG_UNAVAILABLE', 'Shipping settings are temporarily unavailable.');
  const quantities = new Map();
  const variants = new Set();
  let subtotal = 0, customization = 0, itemCount = 0;
  const items = requested.map((line) => {
    const product = products.find((row) => row.id === line.productId);
    if (!product) invalid('A cart product is no longer available.', 'PRODUCT_UNAVAILABLE', 409);
    const color = line.color ?? product.collection.color;
    const size = line.size ?? product.default_size;
    const matches = collections.filter((row) => row.color === color);
    if (matches.length > 1) throw new ApiError(503, 'CATALOG_UNAVAILABLE', 'Product options are temporarily unavailable.');
    const collection = matches[0];
    if (!collection || (!product.customizable_color && color !== product.collection.color)
      || (product.customizable_size ? !(product.sizes ?? []).includes(size) : size !== product.default_size)) invalid('A selected customization is not supported.', 'INVALID_CUSTOMIZATION');
    const key = JSON.stringify([line.productId, color, size]);
    if (variants.has(key)) invalid('Combine identical cart lines.');
    variants.add(key);
    const count = (quantities.get(product.id) ?? 0) + line.quantity;
    quantities.set(product.id, count);
    if (count > product.stock) invalid('A cart product has insufficient stock. Update your cart.', 'INSUFFICIENT_STOCK', 409);
    const customized = color !== product.collection.color || size !== product.default_size;
    const base = cents(product.price), configuredFee = cents(product.customization_fee);
    const fee = customized ? configuredFee : 0;
    subtotal += base * line.quantity;
    customization += fee * line.quantity;
    itemCount += line.quantity;
    return { lineId: `${product.id}|${color}|${size ?? ''}`, productId: product.id, name: product.name, slug: product.slug,
      type: product.type, material: product.material, stone: collection.stone, color, size,
      basePrice: base / 100, customizationFee: fee / 100, unitPrice: (base + fee) / 100,
      customized, quantity: line.quantity, maxQuantity: Math.min(10, product.stock), images: color === product.collection.color ? product.images : [] };
  });
  const threshold = cents(settings.free_shipping_threshold);
  const flatFee = cents(settings.shipping_fee);
  const shipping = subtotal + customization >= threshold ? 0 : flatFee;
  const total = subtotal + customization + shipping;
  if (!Number.isSafeInteger(total) || total > 9999999999) invalid('The cart exceeds the supported order amount.');
  return { items, totals: { itemCount, subtotal: subtotal / 100, customizationTotal: customization / 100,
    shippingFee: shipping / 100, total: total / 100, freeThreshold: threshold / 100,
    freeShippingRemaining: Math.max(0, threshold - subtotal - customization) / 100 } };
}
export function toOrder(row) {
  return { id: row.id, reference: typeof row.order_reference === 'string' && /^AVG-\d{4}-\d{4,19}$/.test(row.order_reference) ? row.order_reference : null,
    createdAt: row.created_at, status: row.status, paymentMethod: row.payment_method,
    customer: { name: row.customer_name, email: row.customer_email, phone: row.customer_phone },
    shipping: { address: row.ship_address, city: row.ship_city, province: row.ship_province, postalCode: row.ship_postal_code },
    subtotal: Number(row.subtotal), customizationTotal: Number(row.customization_total), shippingFee: Number(row.shipping_fee), total: Number(row.total),
    items: (row.items ?? []).map((item) => ({ lineId: String(item.id), productId: item.product_id, name: item.product_name,
      slug: item.product_slug, type: item.type, material: item.material, stone: item.stone, color: item.color, size: item.size,
      basePrice: Number(item.base_price), customizationFee: Number(item.customization_fee), unitPrice: Number(item.unit_price), customized: item.customized, quantity: item.quantity })) };
}
