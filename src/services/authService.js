// MOCK SERVICE — replace the body of these functions with real API calls when the backend is ready.
//
// Suggested endpoints:
//   POST  /api/auth/login              { email, password }       -> { user, token }
//   POST  /api/auth/logout
//   POST  /api/auth/register           { name, email, password }  (sends verification email)
//   POST  /api/auth/verify-email       { email, code }
//   POST  /api/auth/forgot-password    { email }                  (sends reset code)
//   POST  /api/auth/reset-password     { email, token, password }
//   GET   /api/me                      PATCH /api/me              POST /api/me/password
//   GET/POST/PATCH/DELETE /api/me/addresses
//
// Mock notes:
//   - Registered users live in localStorage with a MOCK hash instead of the real password.
//   - The session (id, name, email, role) is kept in localStorage when "Remember me" is
//     checked, otherwise in sessionStorage.

import { demoUsers } from '../data/demoUsers';
import { readStorage, writeStorage, removeStorage } from '../utils/storage';
import { delay, clone, ServiceError, hashPassword, usersTable } from './mockDb';
import * as otpService from './otpService';

const SESSION_KEY = 'session';

/** DEMO ONLY: credentials shown on the Login page for presenters. Remove with the mock. */
export function getDemoAccounts() {
  return demoUsers.map((u) => ({ role: u.role, email: u.email, password: u.password }));
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash: _omit, ...rest } = user;
  return clone(rest);
}

function writeSession(user, remember) {
  const session = { id: user.id, name: user.name, email: user.email, role: user.role };
  removeStorage(SESSION_KEY, 'local');
  removeStorage(SESSION_KEY, 'session');
  writeStorage(SESSION_KEY, session, remember ? 'local' : 'session');
  return session;
}

/** Synchronous: the stored session, or null. */
export function getSession() {
  return readStorage(SESSION_KEY, null, 'local') ?? readStorage(SESSION_KEY, null, 'session');
}

export async function getCurrentUser() {
  await delay(150, 300);
  const session = getSession();
  if (!session) return null;
  const user = usersTable.findById(session.id);
  if (!user) {
    logoutSync();
    return null;
  }
  return publicUser(user);
}

export async function login(email, password, remember = false) {
  await delay();
  const user = usersTable.findByEmail(email);
  if (!user || user.passwordHash !== hashPassword(password)) {
    throw new ServiceError('INVALID_CREDENTIALS', 'Incorrect email or password. Please try again.');
  }
  if (!user.verified) {
    throw new ServiceError('UNVERIFIED', 'Please verify your email before logging in.', { email: user.email });
  }
  writeSession(user, remember);
  return publicUser(user);
}

function logoutSync() {
  removeStorage(SESSION_KEY, 'local');
  removeStorage(SESSION_KEY, 'session');
}

export async function logout() {
  await delay(150, 300);
  logoutSync();
}

export async function register({ name, email, password }) {
  await delay();
  if (usersTable.findByEmail(email)) {
    throw new ServiceError('EMAIL_EXISTS', 'An account with this email already exists. Try logging in instead.');
  }
  const user = {
    id: `u-${Date.now().toString(36)}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    role: 'customer',
    phone: '',
    verified: false,
    createdAt: new Date().toISOString(),
    addresses: [],
  };
  usersTable.insert(user);
  const otp = await otpService.sendOtp(user.email, 'verify');
  return { email: user.email, otp };
}

export async function verifyEmail(email, code) {
  await otpService.verifyOtp(email, 'verify', code);
  const user = usersTable.findByEmail(email);
  if (!user) throw new ServiceError('NOT_FOUND', "We couldn't find an account for this email.");
  usersTable.update(user.id, { verified: true });
  return { verified: true };
}

export async function requestPasswordReset(email) {
  await delay(200, 400);
  const user = usersTable.findByEmail(email);
  if (!user) throw new ServiceError('NOT_FOUND', "We couldn't find an account with that email.");
  return otpService.sendOtp(user.email, 'reset');
}

export async function resetPassword(email, token, newPassword) {
  await delay();
  if (!otpService.consumeToken(email, 'reset', token)) {
    throw new ServiceError('INVALID_TOKEN', 'Your reset session has expired. Please start again.');
  }
  const user = usersTable.findByEmail(email);
  if (!user) throw new ServiceError('NOT_FOUND', 'Account not found.');
  usersTable.update(user.id, { passwordHash: hashPassword(newPassword), verified: true });
  return { ok: true };
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
  const session = getSession();
  if (session?.id === userId) {
    const remember = Boolean(readStorage(SESSION_KEY, null, 'local'));
    writeSession(updated, remember);
  }
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
