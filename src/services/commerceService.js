import { ServiceError } from './serviceError';
import { authSession } from './authSession';
import { refreshCookieSession } from './sessionService';

export function createCommerceClient({ fetcher = (...args) => fetch(...args), refresh = refreshCookieSession,
  getOwner = () => { const state = authSession.getSnapshot(); return state.status === 'authenticated' ? state.user?.id : null; } } = {}) {
  async function request(path, options = {}) {
    const privateRequest = path.startsWith('/api/me/') || path.startsWith('/api/admin/');
    const owner = privateRequest ? (options.ownerId ?? getOwner()) : null;
    if (privateRequest && !owner) throw new ServiceError('UNAUTHORIZED', 'Please sign in to continue.');
    const check = () => {
      if (options.signal?.aborted || (owner && getOwner() !== owner)) throw new ServiceError('SESSION_CHANGED', 'Your session changed. Sign in to the original account before retrying.');
    };
    async function send(url, init = {}) {
      check();
      let response;
      try { response = await fetcher(url, { ...init, credentials: 'include', cache: 'no-store', signal: options.signal }); }
      catch { check(); throw new ServiceError('NETWORK_ERROR', 'Unable to confirm the request. Check your connection and retry.'); }
      check();
      let data;
      try { data = await response.json(); }
      catch { throw new ServiceError('SERVER_ERROR', 'Unable to confirm the server response. Please retry.'); }
      check();
      if (!response.ok) throw new ServiceError(data?.code || 'SERVER_ERROR', data?.message || 'The request could not be completed.', { status: response.status });
      return data;
    }
    async function perform(authRetry = true, csrfRetry = true) {
      const method = options.method ?? 'GET';
      const init = { method };
      if (method !== 'GET') {
        const { csrfToken } = await send('/api/auth/csrf');
        if (typeof csrfToken !== 'string' || !csrfToken) throw new ServiceError('SERVER_ERROR', 'Unable to secure the request.');
        init.headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };
        if (options.key) init.headers['Idempotency-Key'] = options.key;
        init.body = JSON.stringify(options.body ?? {});
      }
      try { return await send(path, init); }
      catch (error) {
        check();
        if (error.status === 401 && owner && authRetry) { await refresh(); check(); return perform(false, csrfRetry); }
        if (error.code === 'CSRF_REJECTED' && csrfRetry) return perform(authRetry, false);
        throw error;
      }
    }
    return perform();
  }
  return { request };
}
export const commerce = createCommerceClient();
