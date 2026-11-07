import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from './errors.js';
import { authUnavailable, unauthorized } from './auth.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
const invalidGrant = () => new ApiError(401, 'INVALID_RECOVERY', 'Your recovery authorization is invalid or expired. Request a new code.');

export function createRecovery({ createAuthClient, cookieSessions, production = false, now = Date.now,
  maxGrants = 10000, sendLimit = 5, verifyLimit = 20, ttlMs = 5 * 60 * 1000 } = {}) {
  const grants = new Map();
  const recoveryTokens = new Map();
  const attempts = new Map();
  const cooldowns = new Map();
  const pendingVerifications = new Set();
  const cookieName = production ? '__Secure-avg_recovery' : 'avg_recovery';
  const options = { httpOnly: true, secure: production, sameSite: 'strict', path: '/api/auth/reset-password' };
  const accepted = { message: 'If an account exists for that email, a recovery code will be sent. Please wait before requesting another.', retryAfter: 60 };

  function prune() {
    for (const [key, record] of grants) if (record.deadline <= now()) grants.delete(key);
    for (const [key, deadline] of recoveryTokens) if (deadline <= now()) recoveryTokens.delete(key);
    for (const [key, record] of attempts) if (record.until <= now()) attempts.delete(key);
    for (const [key, until] of cooldowns) if (until <= now()) cooldowns.delete(key);
  }
  function rateLimit(req, res, next) {
    prune();
    const kind = req.path === '/forgot-password' ? 'send' : 'verify';
    const key = `${kind}:${req.ip}`;
    let record = attempts.get(key);
    if (!record) {
      if (attempts.size >= 10000) throw authUnavailable();
      record = { count: 0, until: now() + 15 * 60 * 1000 };
      attempts.set(key, record);
    }
    if (++record.count > (kind === 'send' ? sendLimit : verifyLimit)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((record.until - now()) / 1000))));
      throw new ApiError(429, 'RATE_LIMITED', 'Too many recovery attempts. Please try again later.');
    }
    next();
  }
  function body(req, allowed) {
    const value = req.body;
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid recovery request.');
    }
    return value;
  }
  async function call(operation) {
    try { return await operation(); } catch { throw authUnavailable(); }
  }
  function clear(res) { res.clearCookie(cookieName, options); }
  function readGrant(req) {
    const values = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${cookieName}=`));
    if (values.length !== 1) return null;
    const value = values[0].slice(cookieName.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? digest(value) : null;
  }
  async function signOut(client, scope = 'local', accessToken) {
    try {
      // The SDK's high-level signOut suppresses some HTTP errors. This logout
      // transport preserves global-revocation errors; it uses the user's JWT and
      // publishable client, not a privileged key or any admin password operation.
      const result = scope === 'global'
        ? await client.auth.admin.signOut(accessToken, 'global')
        : await client.auth.signOut({ scope });
      return !result.error || (scope === 'local' && [401, 403, 404].includes(result.error.status));
    } catch { return false; }
  }
  function invalidateGrants(userId, email) {
    for (const [key, record] of grants) if (record.userId === userId) grants.delete(key);
    for (const attempt of pendingVerifications) if (attempt.email === email) attempt.invalidated = true;
  }
  async function forgot(req, res) {
    const value = body(req, ['email']);
    if (!validEmail(value.email)) throw new ApiError(400, 'VALIDATION_ERROR', 'Use a valid email address.');
    const email = value.email.trim().toLowerCase();
    const key = digest(`${req.ip}:${email}`);
    if ((cooldowns.get(key) ?? 0) > now()) {
      res.set('Retry-After', String(Math.ceil((cooldowns.get(key) - now()) / 1000)));
      throw new ApiError(429, 'RATE_LIMITED', 'Please wait before requesting another recovery code.');
    }
    if (cooldowns.size >= 10000) throw authUnavailable();
    cooldowns.set(key, now() + 60000);
    const result = await call(() => createAuthClient().auth.resetPasswordForEmail(email));
    // Account-specific absence, authorization and delivery-limit errors all have
    // the same response. The app's own uniform limit is independent of existence.
    if (result.error && ![400, 401, 403, 404, 422, 429].includes(result.error.status)) throw authUnavailable();
    return accepted;
  }
  async function verify(req, res) {
    const value = body(req, ['email', 'code']);
    if (!validEmail(value.email) || typeof value.code !== 'string' || !/^\d{6,10}$/.test(value.code)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Use a valid email and the recovery code from your email.');
    }
    prune();
    if (grants.size + pendingVerifications.size >= maxGrants || recoveryTokens.size + pendingVerifications.size >= maxGrants) throw authUnavailable();
    const attempt = { email: value.email.trim().toLowerCase(), invalidated: false };
    const client = createAuthClient();
    pendingVerifications.add(attempt);
    let retained = false;
    try {
      const result = await call(() => client.auth.verifyOtp({ email: attempt.email, token: value.code, type: 'recovery' }));
      if (result.error) {
        if ([400, 401, 403, 422].includes(result.error.status)) {
          throw new ApiError(400, 'INVALID_CODE', 'This code is incorrect or expired. Request a new code and try again.');
        }
        if (result.error.status === 429) {
          res.set('Retry-After', '60');
          throw new ApiError(429, 'RATE_LIMITED', 'Please wait before trying another recovery code.');
        }
        throw authUnavailable();
      }
      const session = result.data?.session;
      if (typeof session?.access_token !== 'string' || !session.access_token || typeof session.refresh_token !== 'string'
        || !session.refresh_token || !Number.isFinite(session.expires_at)) throw authUnavailable();
      // Defense in depth: a JWT issued by this recovery flow must not be adopted
      // via the independent Phase 1 Bearer transport, even if copied out of band.
      recoveryTokens.set(digest(session.access_token), session.expires_at * 1000);
      const verified = await call(() => client.auth.getUser(session.access_token));
      const user = verified.data?.user;
      if (verified.error) {
        if ([400, 401, 403, 422].includes(verified.error.status)) throw invalidGrant();
        throw authUnavailable();
      }
      if (!user?.id || user.id !== result.data?.user?.id || user.email?.toLowerCase() !== attempt.email) throw invalidGrant();
      if (attempt.invalidated) throw invalidGrant();
      const deadline = Math.min(now() + ttlMs, session.expires_at * 1000);
      if (deadline <= now()) throw invalidGrant();
      const id = randomBytes(32).toString('base64url');
      // Only the newest independently verified flow for a user remains usable.
      for (const [key, record] of grants) if (record.userId === user.id) grants.delete(key);
      grants.set(digest(id), { userId: user.id, email: attempt.email, session, deadline });
      res.cookie(cookieName, id, { ...options, maxAge: deadline - now() });
      retained = true;
      return { verified: true, expiresIn: Math.floor((deadline - now()) / 1000) };
    } finally {
      pendingVerifications.delete(attempt);
      if (!retained) await signOut(client);
    }
  }
  async function reset(req, res) {
    const value = body(req, ['password']);
    if (typeof value.password !== 'string' || value.password.length < 8 || value.password.length > 128
      || !/[A-Z]/.test(value.password) || !/[a-z]/.test(value.password) || !/\d/.test(value.password) || !/[^A-Za-z0-9]/.test(value.password)) {
      throw new ApiError(400, 'WEAK_PASSWORD', 'Use 8–128 characters with uppercase, lowercase, a number, and a special character.');
    }
    const key = readGrant(req);
    const record = grants.get(key);
    // Consume synchronously before ANY provider await; concurrent replays lose.
    if (key) grants.delete(key);
    clear(res);
    if (!record || record.deadline <= now()) throw invalidGrant();
    const client = createAuthClient();
    let changed = false;
    try {
      const established = await call(() => client.auth.setSession({ access_token: record.session.access_token, refresh_token: record.session.refresh_token }));
      if (established.error) {
        if ([400, 401, 403, 422].includes(established.error.status)) throw invalidGrant();
        throw authUnavailable();
      }
      const verified = await call(() => client.auth.getUser(record.session.access_token));
      if (verified.error) {
        if ([400, 401, 403, 422].includes(verified.error.status)) throw invalidGrant();
        throw authUnavailable();
      }
      if (verified.data?.user?.id !== record.userId || record.deadline <= now()) throw invalidGrant();
      invalidateGrants(record.userId, record.email);
      await cookieSessions.invalidateUser(record.userId, record.email);
      cookieSessions.clearSessionCookies(res);
      const result = await call(() => client.auth.updateUser({ password: value.password }));
      if (result.error) {
        if (['weak_password', 'same_password'].includes(result.error.code)) {
          throw new ApiError(400, 'WEAK_PASSWORD', 'Choose a different password that meets all requirements. Verify a new code before trying again.');
        }
        if ([400, 401, 403, 422].includes(result.error.status)) throw invalidGrant();
        throw authUnavailable();
      }
      if (result.data?.user?.id !== record.userId) throw authUnavailable();
      changed = true;
    } finally {
      invalidateGrants(record.userId, record.email);
      await cookieSessions.invalidateUser(record.userId, record.email);
      cookieSessions.clearSessionCookies(res);
      // Even an ambiguous network result consumes the authorization. Never retry
      // updateUser automatically or turn this recovery session into an app login.
      if (!changed) await signOut(client);
    }
    const sessionRevocationConfirmed = await signOut(client, 'global', record.session.access_token);
    return { ok: true, signInRequired: true, sessionRevocationConfirmed };
  }
  function assertNormalAccessToken(token) {
    const deadline = recoveryTokens.get(digest(token));
    if (deadline && deadline > now()) throw unauthorized();
  }
  return { rateLimit, forgot, verify, reset, assertNormalAccessToken };
}
