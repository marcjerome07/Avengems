import { ServiceError } from './serviceError';

async function request(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, credentials: 'include', cache: 'no-store' }); }
  catch { throw new ServiceError('NETWORK_ERROR', 'Unable to reach the store. Please try again when connected.'); }
  let data;
  try { data = await response.json(); }
  catch { throw new ServiceError('SERVER_ERROR', 'The recovery result could not be confirmed. Please try signing in or request a new code.'); }
  if (!response.ok) throw new ServiceError(data?.code || 'SERVER_ERROR', data?.message || 'Unable to complete password recovery.', {
    status: response.status, retryAfter: Number(response.headers.get('Retry-After')) || 0,
  });
  return data;
}

async function post(path, body, retry = true) {
  const { csrfToken } = await request('/api/auth/csrf');
  if (typeof csrfToken !== 'string' || !csrfToken) throw new ServiceError('SERVER_ERROR', 'Unable to secure your recovery request.');
  try {
    return await request(`/api/auth/${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) });
  } catch (error) {
    // Only CSRF rejection is known to precede provider operations. Never retry an
    // uncertain OTP consumption/password update after a network/provider failure.
    if (retry && error.code === 'CSRF_REJECTED') return post(path, body, false);
    throw error;
  }
}

export const requestRecoveryCode = (email) => post('forgot-password', { email });
export const verifyRecoveryCode = (email, code) => post('verify-recovery', { email, code });
export const submitNewPassword = (password) => post('reset-password', { password });
