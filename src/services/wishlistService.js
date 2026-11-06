import { ServiceError } from './serviceError';
import { refreshCookieSession } from './sessionService';

// Recheck ownership after bootstrap/refresh, before using current browser cookies.
function check({ isCurrent = () => true, signal } = {}) {
  if (signal?.aborted || !isCurrent()) throw new ServiceError('STALE_WISHLIST', 'This wishlist request is no longer active.');
}
async function request(url, options, scope) {
  check(scope);
  let response;
  try { response = await fetch(url, { ...options, credentials: 'include', cache: 'no-store', signal: scope?.signal }); }
  catch {
    check(scope);
    throw new ServiceError('NETWORK_ERROR', 'Unable to reach the store. Please retry your wishlist.');
  }
  check(scope);
  let data;
  try { data = await response.json(); }
  catch { throw new ServiceError('SERVER_ERROR', 'Unable to load your wishlist. Please try again.'); }
  check(scope);
  if (!response.ok) throw new ServiceError(data?.code || 'SERVER_ERROR', data?.message || 'Unable to update your wishlist.', { status: response.status });
  return data;
}
async function wishlist(path = '', method = 'GET', body, scope, retryAuth = true, retryCsrf = true) {
  check(scope);
  const options = { method };
  if (method !== 'GET') {
    const { csrfToken } = await request('/api/auth/csrf', {}, scope);
    if (typeof csrfToken !== 'string' || !csrfToken) throw new ServiceError('SERVER_ERROR', 'Unable to secure your wishlist request. Please retry.');
    options.headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };
    options.body = JSON.stringify(body ?? {});
  }
  try { return await request(`/api/me/wishlist${path}`, options, scope); }
  catch (error) {
    check(scope);
    if (error.status === 401 && retryAuth) {
      await refreshCookieSession();
      check(scope);
      return wishlist(path, method, body, scope, false, retryCsrf);
    }
    if (error.code === 'CSRF_REJECTED' && retryCsrf) return wishlist(path, method, body, scope, retryAuth, false);
    throw error;
  }
}
export const loadWishlist = async (scope) => {
  const result = await wishlist('', 'GET', undefined, scope);
  if (!Array.isArray(result?.items) || result.items.some((item) => !item || typeof item.id !== 'string')) {
    throw new ServiceError('SERVER_ERROR', 'Unable to load your wishlist. Please retry.');
  }
  return result.items;
};
export const addWishlistItem = async (productId, scope) => {
  const result = await wishlist('', 'POST', { productId }, scope);
  if (!result?.item || result.item.id !== productId) throw new ServiceError('SERVER_ERROR', 'Unable to confirm your wishlist change. Please reload it.');
  return result.item;
};
export const removeWishlistItem = async (productId, scope) => {
  const result = await wishlist(`/${encodeURIComponent(productId)}`, 'DELETE', {}, scope);
  if (result?.ok !== true || result.productId !== productId) throw new ServiceError('SERVER_ERROR', 'Unable to confirm your wishlist change. Please reload it.');
};
