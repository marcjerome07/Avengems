// Authentication, profiles and addresses use the API; password changes use the verified recovery flow.
//
// Suggested endpoints:
//   POST  /api/auth/login              { email, password }       (backend uses HttpOnly cookies)
//   POST  /api/auth/logout
//   POST  /api/auth/register           { name, email, password }  (sends verification email)
//   POST  /api/auth/verify-email       { email, code }
//   POST  /api/auth/forgot-password    { email }                  (sends reset code)
//   POST  /api/auth/reset-password     { password } (HttpOnly recovery authorization)
//   GET   /api/me                      PATCH /api/me              POST /api/me/password
//   GET/POST/PATCH/DELETE /api/me/addresses
//
import { ServiceError } from './serviceError';
import { registerCustomer, verifyRegistration } from './registrationService';
export { resendVerification, verifyRegistration as verifyEmailCallback } from './registrationService';
export { loginWithCookies as login, logoutWithCookies as logout, restoreCookieSession as getCurrentUser } from './sessionService';
export { requestRecoveryCode as requestPasswordReset, submitNewPassword as resetPassword } from './recoveryService';

export async function register({ name, email, password }) {
  return registerCustomer({ name, email, password });
}

export async function verifyEmail(email, code) {
  return verifyRegistration({ email, code });
}

/* ---------------- Account ---------------- */

export { updateProfile, getAddresses, saveAddress, deleteAddress, setDefaultAddress } from './customerService';

export async function changePassword() {
  throw new ServiceError('PASSWORD_CHANGE_UNAVAILABLE', 'Use the email-verified password recovery flow to change your password.');
}
