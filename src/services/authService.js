// Login/session, registration and recovery use the API. Account editing remains
// a separate prototype service and cannot replace authenticated context identity.
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
import { delay, clone, ServiceError, hashPassword, usersTable } from './mockDb';
import { registerCustomer, verifyRegistration } from './registrationService';
export { resendVerification, verifyRegistration as verifyEmailCallback } from './registrationService';
export { loginWithCookies as login, logoutWithCookies as logout, restoreCookieSession as getCurrentUser } from './sessionService';
export { requestRecoveryCode as requestPasswordReset, submitNewPassword as resetPassword } from './recoveryService';

function publicUser(user) {
  if (!user) return null;
  const { passwordHash: _omit, ...rest } = user;
  return clone(rest);
}

export async function register({ name, email, password }) {
  return registerCustomer({ name, email, password });
}

export async function verifyEmail(email, code) {
  return verifyRegistration({ email, code });
}

/* ---------------- Account ---------------- */

function requireUser(userId) {
  const user = usersTable.findById(userId);
  if (!user) throw new ServiceError('NOT_FOUND', 'Account not found.');
  return user;
}

export async function updateProfile(userId, { name, phone }) {
  await delay();
  requireUser(userId);
  const updated = usersTable.update(userId, { name: name.trim(), phone: phone.trim() });
  return publicUser(updated);
}

export async function changePassword(userId, currentPassword, newPassword) {
  await delay();
  const user = requireUser(userId);
  if (user.passwordHash !== hashPassword(currentPassword)) {
    throw new ServiceError('INVALID_PASSWORD', 'Your current password is incorrect.');
  }
  usersTable.update(userId, { passwordHash: hashPassword(newPassword) });
  return { ok: true };
}

export async function getAddresses(userId) {
  await delay(250, 500);
  return clone(requireUser(userId).addresses ?? []);
}

export async function saveAddress(userId, address) {
  await delay();
  const user = requireUser(userId);
  let addresses = user.addresses ?? [];
  const isNew = !address.id;
  const record = { ...address, id: address.id ?? `addr-${Date.now().toString(36)}` };
  if (!addresses.length) record.isDefault = true;
  if (record.isDefault) addresses = addresses.map((a) => ({ ...a, isDefault: false }));
  addresses = isNew ? [...addresses, record] : addresses.map((a) => (a.id === record.id ? record : a));
  usersTable.update(userId, { addresses });
  return clone(addresses);
}

export async function deleteAddress(userId, addressId) {
  await delay();
  const user = requireUser(userId);
  let addresses = (user.addresses ?? []).filter((a) => a.id !== addressId);
  if (addresses.length && !addresses.some((a) => a.isDefault)) {
    addresses = addresses.map((a, i) => ({ ...a, isDefault: i === 0 }));
  }
  usersTable.update(userId, { addresses });
  return clone(addresses);
}

export async function setDefaultAddress(userId, addressId) {
  await delay();
  const user = requireUser(userId);
  const addresses = (user.addresses ?? []).map((a) => ({ ...a, isDefault: a.id === addressId }));
  usersTable.update(userId, { addresses });
  return clone(addresses);
}
