import { ServiceError } from './mockDb';

let restoring;
let refreshing;

async function request(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, credentials: 'include', cache: 'no-store' }); }
  catch { throw new ServiceError('NETWORK_ERROR', 'Unable to reach the store. Please check your connection and try again.'); }
  let data;
  try { data = await response.json(); }
  catch { throw new ServiceError('SERVER_ERROR', 'Unable to verify your session. Please try again.'); }
  if (!response.ok) {
    throw new ServiceError(data?.code || 'SERVER_ERROR', data?.message || 'Unable to verify your session.', {
      status: response.status, endpoint: url, retryAfter: Number(response.headers.get('Retry-After')) || 0,
    });
  }
  return data;
}

async function post(path, body, retry = true) {
  const { csrfToken } = await request('/api/auth/csrf');
  if (typeof csrfToken !== 'string' || !csrfToken) throw new ServiceError('SERVER_ERROR', 'Unable to secure your request. Please try again.');
  try {
    return await request(`/api/auth/${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body ?? {}) });
  } catch (error) {
    // CSRF is rejected before provider operations. Never retry network/provider failures.
    if (retry && error.code === 'CSRF_REJECTED') return post(path, body, false);
    throw error;
  }
}

function verifiedUser(user) {
  if (!user || typeof user.id !== 'string' || !user.id || typeof user.name !== 'string'
    || !['customer', 'admin'].includes(user.role)) {
    throw new ServiceError('INVALID_SESSION', 'Your account could not be verified. Please sign in again.');
  }
  if (user.verified !== true) {
    throw new ServiceError('UNVERIFIED', 'Please confirm your email before signing in.', { email: user.email });
  }
  return Object.freeze({ id: user.id, name: user.name, email: user.email, role: user.role,
    phone: user.phone ?? '', verified: true, createdAt: user.createdAt });
}

export async function loginWithCookies(email, password, remember = false) {
  const result = await post('login', { email: email.trim(), password, remember });
  try { return verifiedUser(result.user); }
  catch (error) {
    try { await logoutWithCookies(); } catch { /* Never grant access when cleanup cannot be confirmed. */ }
    throw error;
  }
}

export async function logoutWithCookies() {
  try { await post('logout'); }
  catch (error) {
    // A protected 401 clears cookies server-side: the session is already gone.
    if (error.status !== 401 || error.endpoint !== '/api/auth/logout') {
      throw new ServiceError(error.code, 'Sign out could not be confirmed. Please retry when connected.', { status: error.status });
    }
  }
}

export function refreshCookieSession() {
  if (!refreshing) refreshing = post('refresh').finally(() => { refreshing = undefined; });
  return refreshing;
}

export function restoreCookieSession() {
  if (!restoring) restoring = (async () => {
    try { return verifiedUser(await request('/api/me')); }
    catch (error) { if (error.status !== 401) throw error; }
    try {
      await refreshCookieSession();
      return verifiedUser(await request('/api/me'));
    } catch (error) {
      if (error.status === 401) return null;
      throw error;
    }
  })().finally(() => { restoring = undefined; });
  return restoring;
}
