import { commerce } from './commerceService';
import { ServiceError } from './serviceError';

export const paymentMethods = () => commerce.request('/api/me/payments/methods');
export const getPayment = (id, ownerId) => commerce.request(`/api/me/payments/${encodeURIComponent(id)}`, { ownerId });
export const checkPayment = (id, ownerId) => commerce.request(`/api/me/payments/${encodeURIComponent(id)}/reconcile`, { method: 'POST', body: {}, ownerId });
export const cancelPayment = (id, ownerId) => commerce.request(`/api/me/payments/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {}, ownerId });
export async function startPayment(id, ownerId) {
  const result = await commerce.request(`/api/me/payments/${encodeURIComponent(id)}/start`, { method: 'POST', body: {}, ownerId });
  if (result.checkoutUrl) {
    let url;
    try { url = new URL(result.checkoutUrl); } catch { /* Fail closed below. */ }
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.port) throw new ServiceError('INVALID_PAYMENT_LINK', 'Checkout could not be opened. Check the saved order.');
  }
  return result;
}
export const PAYMENT_STATES = {
  created: 'Awaiting payment', creating: 'Verifying payment setup', unknown: 'Payment setup needs reconciliation',
  pending: 'Pending payment', paid: 'Paid', failed: 'Payment failed', expired: 'Payment expired', cancelled: 'Payment cancelled',
  refunded: 'Refunded', review: 'Payment requires review',
};
export const paymentLabel = (order) => PAYMENT_STATES[order.payment?.status]
  ?? (order.paymentMethod === 'cod' ? 'Due on delivery' : 'Unverified legacy payment');
