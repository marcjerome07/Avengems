// MOCK SERVICE — replace the body of these functions with real API calls when the backend is ready.
//
// A frontend-only app cannot send email, so this mock generates the code locally and
// exposes it as a clearly labeled "Demo mode" notice (and in the console).
// Verification still checks the code AND the expiry for real. Nothing is auto-verified.
//
// Suggested endpoints:
//   POST /api/otp/send    { email, purpose: 'verify' | 'reset' }
//   POST /api/otp/verify  { email, purpose, code }  -> { token }

import { config } from '../data/config';
import { readStorage, writeStorage } from '../utils/storage';
import { delay, ServiceError } from './mockDb';

// OTP records live in sessionStorage so a page refresh doesn't lose the active code.
export const OTP_LENGTH = config.otp.length;

const OTP_KEY = 'otp';
const TOKEN_KEY = 'otp_tokens';

const keyFor = (email, purpose) => `${purpose}:${String(email).trim().toLowerCase()}`;

function readRecords() {
  return readStorage(OTP_KEY, {}, 'session') ?? {};
}

function writeRecords(records) {
  writeStorage(OTP_KEY, records, 'session');
}

function generateCode(length) {
  let code = '';
  const random = new Uint32Array(length);
  try {
    window.crypto.getRandomValues(random);
  } catch {
    for (let i = 0; i < length; i += 1) random[i] = Math.floor(Math.random() * 10);
  }
  for (let i = 0; i < length; i += 1) code += String(random[i] % 10);
  return code;
}

/** Synchronous lookup of the active code (used to show the demo notice). */
export function getActiveOtp(email, purpose) {
  const record = readRecords()[keyFor(email, purpose)];
  if (!record) return null;
  return { demoCode: record.code, expiresAt: record.expiresAt, resendAt: record.resendAt };
}

export async function sendOtp(email, purpose = 'verify') {
  await delay();
  const key = keyFor(email, purpose);
  const records = readRecords();
  const now = Date.now();
  const existing = records[key];
  if (existing && now < existing.resendAt) {
    const seconds = Math.ceil((existing.resendAt - now) / 1000);
    throw new ServiceError('COOLDOWN', `Please wait ${seconds}s before requesting a new code.`, { seconds });
  }
  const record = {
    code: generateCode(config.otp.length),
    expiresAt: now + config.otp.expiryMs,
    resendAt: now + config.otp.resendCooldownMs,
  };
  records[key] = record;
  writeRecords(records);
  // Demo mode: in production this code would only arrive by email.
  console.info(`[Avengems demo] ${purpose} code for ${email}: ${record.code}`);
  return { demoCode: record.code, expiresAt: record.expiresAt, resendAt: record.resendAt };
}

export async function verifyOtp(email, purpose, code) {
  await delay();
  const key = keyFor(email, purpose);
  const records = readRecords();
  const record = records[key];
  if (!record) throw new ServiceError('NOT_FOUND', 'No active code. Please request a new one.');
  if (Date.now() > record.expiresAt) throw new ServiceError('EXPIRED', 'This code has expired. Please request a new one.');
  if (String(code) !== record.code) throw new ServiceError('INVALID', 'Incorrect code. Please try again.');

  delete records[key];
  writeRecords(records);

  const token = `tok_${generateCode(12)}`;
  const tokens = readStorage(TOKEN_KEY, {}, 'session') ?? {};
  tokens[key] = { token, expiresAt: Date.now() + 10 * 60 * 1000 };
  writeStorage(TOKEN_KEY, tokens, 'session');
  return { verified: true, token };
}

/** Used by authService to confirm a reset/verify token is genuine and unexpired. */
export function consumeToken(email, purpose, token) {
  const key = keyFor(email, purpose);
  const tokens = readStorage(TOKEN_KEY, {}, 'session') ?? {};
  const entry = tokens[key];
  const valid = Boolean(entry && entry.token === token && Date.now() < entry.expiresAt);
  if (entry) {
    delete tokens[key];
    writeStorage(TOKEN_KEY, tokens, 'session');
  }
  return valid;
}

/** DEMO ONLY: force the current code to expire so presenters can show the expired state. */
export function expireOtpForDemo(email, purpose) {
  const key = keyFor(email, purpose);
  const records = readRecords();
  if (records[key]) {
    records[key].expiresAt = Date.now() - 1;
    records[key].resendAt = Math.min(records[key].resendAt, Date.now());
    writeRecords(records);
  }
}
