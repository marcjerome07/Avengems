import { commerce } from './commerceService';
import { cartSelections } from './cartService';
import { ServiceError } from './serviceError';

export function orderRequest({ items, customer, shipping, paymentMethod }) {
  return { items: cartSelections(items), customer: { name: customer?.name, email: customer?.email, phone: customer?.phone },
    shipping: shipping?.addressId ? { addressId: shipping.addressId } : { address: shipping?.address, city: shipping?.city, province: shipping?.province, postalCode: shipping?.postalCode }, paymentMethod };
}
export async function placeOrder(payload, { idempotencyKey, ownerId } = {}) {
  const request = orderRequest(payload);
  const order = await commerce.request('/api/me/orders', { method: 'POST', body: request, key: idempotencyKey, ownerId });
  if (!order?.id || !Array.isArray(order.items)) throw new ServiceError('SERVER_ERROR', 'Order creation could not be confirmed. Retry the same checkout.');
  return order;
}
export const getOrdersByUser = async (userId) => (await commerce.request('/api/me/orders', { ownerId: userId })).items;
export const getOrderById = (orderId, identity) => commerce.request(`/api/me/orders/${encodeURIComponent(orderId)}`, { ownerId: identity?.userId });
export async function cancelCustomerOrder(orderId, ownerId) {
  const order = await commerce.request(`/api/me/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST', body: {}, ownerId });
  if (order?.id !== orderId || order.status !== 'Cancelled' || !Array.isArray(order.items)) throw new ServiceError('SERVER_ERROR', 'Cancellation could not be confirmed. Reload the order.');
  return order;
}

export const PAYMENT_LABELS = {
  gcash: 'GCash',
  maya: 'Maya',
  cod: 'Cash on Delivery',
  card: 'Credit/Debit Card',
};

export const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
