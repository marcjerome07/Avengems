import { ServiceError } from './serviceError';
import { refreshCookieSession } from './sessionService';

async function request(path, options = {}) {
  let response;
  try { response = await fetch(path, { ...options, credentials: 'include', cache: 'no-store' }); }
  catch { throw new ServiceError('NETWORK_ERROR', 'Unable to reach the store. Please check your connection and retry.'); }
  let data;
  try { data = await response.json(); }
  catch { throw new ServiceError('SERVER_ERROR', 'Unable to load account data. Please try again.'); }
  if (!response.ok) throw new ServiceError(data?.code || 'SERVER_ERROR', data?.message || 'Unable to update account data.', { status: response.status });
  return data;
}
async function account(path, method = 'GET', body, retryAuth = true, retryCsrf = true) {
  const options = { method };
  if (method !== 'GET') {
    const { csrfToken } = await request('/api/auth/csrf');
    if (typeof csrfToken !== 'string' || !csrfToken) throw new ServiceError('SERVER_ERROR', 'Unable to secure your request. Please retry.');
    options.headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };
    options.body = JSON.stringify(body ?? {});
  }
  try { return await request(`/api/me${path}`, options); }
  catch (error) {
    // Both rejections happen before writes. Network/provider failures are never replayed.
    if (error.status === 401 && retryAuth) {
      await refreshCookieSession();
      return account(path, method, body, false, retryCsrf);
    }
    if (error.code === 'CSRF_REJECTED' && retryCsrf) return account(path, method, body, retryAuth, false);
    throw error;
  }
}

// Legacy userId arguments preserve callers such as Checkout; they never enter requests.
export const updateProfile = (_userId, values) => account('', 'PATCH', values);
export const getAddresses = async (_userId) => (await account('/addresses')).items;
export async function saveAddress(_userId, address) {
  const { id, ...values } = address;
  return (await account(id ? `/addresses/${encodeURIComponent(id)}` : '/addresses', id ? 'PATCH' : 'POST', values)).items;
}
export const deleteAddress = async (_userId, id) => (await account(`/addresses/${encodeURIComponent(id)}`, 'DELETE', {})).items;
export const setDefaultAddress = async (_userId, id) => (await account(`/addresses/${encodeURIComponent(id)}/default`, 'PATCH', {})).items;
