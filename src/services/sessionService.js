import { ServiceError } from './serviceError';

let restoring;
let refreshing;
let reportingActivity;

export function sessionTiming(value) {
  if (!value || typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.key)
    || !['idleExpiresAt', 'absoluteExpiresAt', 'serverNow'].every((key) => Number.isSafeInteger(value[key]))
    || value.idleExpiresAt <= value.serverNow || value.idleExpiresAt > value.absoluteExpiresAt
    || value.idleExpiresAt - value.serverNow > 20 * 60 * 1000) {
    throw new ServiceError('INVALID_SESSION', 'Session timing could not be verified. Please retry.');
  }
  return Object.freeze({ key: value.key, idleExpiresAt: value.idleExpiresAt, absoluteExpiresAt: value.absoluteExpiresAt, serverNow: value.serverNow });
}

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
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(typeof body === 'function' ? body() : body ?? {}) });
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
    phone: user.phone ?? '', verified: true, createdAt: user.createdAt,
    ...(user.session ? { session: sessionTiming(user.session) } : {}) });
}

export async function loginWithCookies(email, password, remember = false) {
  const result = await post('login', { email: email.trim(), password, remember });
  try { return verifiedUser({ ...result.user, ...(result.session ? { session: result.session } : {}) }); }
  catch (error) {
    try { await logoutWithCookies(); } catch { /* Never grant access when cleanup cannot be confirmed. */ }
    throw error;
  }
}

export async function logoutWithCookies() {
  await Promise.allSettled([refreshing, reportingActivity].filter(Boolean));
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
    catch (error) { if (error.code === 'SESSION_IDLE_EXPIRED' || error.status !== 401) throw error; }
    try {
      await refreshCookieSession();
      return verifiedUser(await request('/api/me'));
    } catch (error) {
      if (error.code === 'SESSION_IDLE_EXPIRED') throw error;
      if (error.status === 401 && ['/api/auth/refresh', '/api/me'].includes(error.endpoint)) return null;
      if (error.status === 401 && error.endpoint === '/api/auth/csrf') {
        throw new ServiceError('AUTH_UNAVAILABLE', 'Unable to secure the session check. Please retry.', { status: 503 });
      }
      throw error;
    }
  })().finally(() => { restoring = undefined; });
  return restoring;
}

export function recordSessionActivity(elapsedMs = 0) {
  const started = Date.now();
  const body = () => {
    const age = Math.max(0, Math.floor(elapsedMs + Date.now() - started));
    if (age > 30000) throw new ServiceError('ACTIVITY_STALE', 'This activity report is no longer current.');
    return age ? { elapsedMs: age } : {};
  };
  if (!reportingActivity) reportingActivity = (async () => {
    try { return sessionTiming((await post('activity', body)).session); }
    catch (error) {
      if (error.code === 'SESSION_IDLE_EXPIRED' || error.status !== 401 || error.endpoint !== '/api/auth/activity') throw error;
      await refreshCookieSession();
      return sessionTiming((await post('activity', body)).session);
    }
  })().finally(() => { reportingActivity = undefined; });
  return reportingActivity;
}
export async function checkIdleSession() { return sessionTiming((await post('idle')).session); }
