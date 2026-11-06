import { readStorage, writeStorage, removeStorage } from '../utils/storage';
import { ServiceError } from './serviceError';

const storageKey = (owner) => `checkout_pending_${owner}`;
export function pendingCheckout(owner) {
  const value = readStorage(storageKey(owner), null, 'session');
  if (!value) return null;
  if (value.completed || value.owner !== owner || typeof value.key !== 'string' || !value.request?.items?.length) {
    throw new ServiceError('CHECKOUT_STORAGE_ERROR', 'Pending checkout data is invalid. Check My Orders before starting another order.');
  }
  return value;
}
export function beginCheckout(owner, request) {
  const previous = pendingCheckout(owner);
  if (previous) return previous;
  const value = { owner, key: crypto.randomUUID(), request };
  if (!writeStorage(storageKey(owner), value, 'session')) throw new ServiceError('CHECKOUT_STORAGE_ERROR', 'Enable session storage to safely retry checkout. No order was submitted.');
  return value;
}
export function finishCheckout(owner, orderId) {
  removeStorage(storageKey(owner), 'session');
  if (readStorage(storageKey(owner), null, 'session')) writeStorage(storageKey(owner), { completed: true, orderId }, 'session');
}
export function definitiveCheckoutFailure(error) {
  return [400, 403, 404, 415].includes(error.status) || error.code === 'CHECKOUT_MIGRATION_REQUIRED'
    || ['INSUFFICIENT_STOCK', 'PRODUCT_UNAVAILABLE', 'INVALID_CUSTOMIZATION'].includes(error.code);
}
export async function confirmCheckoutAttempt(attempt, { placeOrder, completeCart, isCurrent = () => true }) {
  if (!isCurrent()) throw new ServiceError('SESSION_CHANGED', 'Sign in to the original account to confirm this checkout.');
  const order = await placeOrder(attempt.request, { idempotencyKey: attempt.key, ownerId: attempt.owner });
  if (!isCurrent()) throw new ServiceError('SESSION_CHANGED', 'Sign in to the original account to confirm this checkout.');
  if (!order?.id || !Array.isArray(order.items)) throw new ServiceError('SERVER_ERROR', 'Order creation could not be confirmed. Retry the same checkout.');
  finishCheckout(attempt.owner, order.id);
  completeCart(attempt.request.items);
  return order;
}
