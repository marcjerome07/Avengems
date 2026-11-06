import { ServiceError } from './serviceError';

async function jsonRequest(url, options) {
  let response;
  try { response = await fetch(url, { credentials: 'same-origin', ...options }); }
  catch { throw new ServiceError('NETWORK_ERROR', 'Unable to reach the store. Please try again.'); }
  let data;
  try { data = await response.json(); }
  catch { throw new ServiceError('SERVER_ERROR', 'Unable to complete registration. Please try again.'); }
  if (!response.ok) {
    throw new ServiceError(data?.code || 'SERVER_ERROR', data?.message || 'Unable to complete registration.', {
      retryAfter: Number(response.headers.get('Retry-After')) || 0,
    });
  }
  return data;
}

async function post(path, body, retry = true) {
  const { csrfToken } = await jsonRequest('/api/auth/csrf');
  try {
    return await jsonRequest(`/api/auth/${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) });
  } catch (error) {
    // CSRF rejection happens before any provider operation; one retry is safe if
    // another tab/bootstrap changed the cookie. Never retry consumed OTPs/network failures.
    if (retry && error.code === 'CSRF_REJECTED') return post(path, body, false);
    throw error;
  }
}

export const registerCustomer = ({ name, email, password }) => post('register', { name, email, password });
export const verifyRegistration = (proof) => post('verify-email', proof);
export const resendVerification = (email) => post('resend-verification', { email });
