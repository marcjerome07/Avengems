import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';
import { unauthorized, authUnavailable } from './auth.js';

const random = () => randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b)
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const rejected = (error) => [400, 401, 403, 422].includes(error?.status);
export const SESSION_IDLE_MS = 20 * 60 * 1000;

/** Single-process, bounded session coordination. A restart deliberately signs sessions out. */
export function createCookieSessions({ createAuthClient, loadUser, origin, production = false,
  now = Date.now, maxSessions = 10000, maxRateKeys = 10000, loginLimit = 10 } = {}) {
  const sessions = new Map();
  const pendingLogins = new Set();
  const attempts = new Map();
  const csrfSecret = randomBytes(32);
  const graceMs = 10000;
  const csrfLifetime = 24 * 60 * 60 * 1000;
  const names = production
    ? { access: '__Secure-avg_access', refresh: '__Secure-avg_refresh', sid: '__Host-avg_session', csrf: '__Host-avg_csrf' }
    : { access: 'avg_access', refresh: 'avg_refresh', sid: 'avg_session', csrf: 'avg_csrf' };
  const paths = { access: '/api', refresh: '/api/auth', sid: '/', csrf: '/' };

  function cookieOptions(kind) {
    return { httpOnly: true, secure: production, sameSite: 'strict', path: paths[kind] };
  }
  function readCookie(req, kind) {
    const matches = (req.headers.cookie ?? '').split(';').map((part) => part.trim())
      .filter((part) => part.startsWith(`${names[kind]}=`));
    if (matches.length > 1) throw unauthorized();
    if (!matches.length) return undefined;
    try { return decodeURIComponent(matches[0].slice(names[kind].length + 1)); }
    catch { throw unauthorized(); }
  }
  function clear(res) {
    for (const kind of Object.keys(names)) res.clearCookie(names[kind], cookieOptions(kind));
  }
  function clearAccess(res, req) {
    // A delayed 401 for the previous token must not erase a freshly rotated cookie.
    if (req) {
      const record = sessions.get(readCookie(req, 'sid'));
      if (!record || !equal(readCookie(req, 'access'), record.session.access_token)) return;
    }
    res.clearCookie(names.access, cookieOptions('access'));
  }
  function prune() {
    const time = now();
    for (const [id, record] of sessions) {
      if (Math.min(record.deadline, record.idleDeadline) <= time && !record.pending) { record.closed = true; sessions.delete(id); }
    }
    for (const [key, entry] of attempts) if (entry.until <= time) attempts.delete(key);
  }
  function getRecord(req, res) {
    const id = readCookie(req, 'sid');
    const record = sessions.get(id);
    if (!record || record.closed || record.deadline <= now()) {
      if (record) { record.closed = true; sessions.delete(id); }
      clear(res);
      throw unauthorized();
    }
    if (record.idleDeadline <= now()) {
      record.closed = true; sessions.delete(id); clear(res);
      throw new ApiError(401, 'SESSION_IDLE_EXPIRED', 'Your session expired after 20 minutes of inactivity. Please log in again.');
    }
    return record;
  }
  function timing(record) {
    return { key: record.publicId, idleExpiresAt: record.idleDeadline, absoluteExpiresAt: record.deadline, serverNow: now() };
  }
  function metadata(req, res) { return timing(getRecord(req, res)); }
  function requireSession(req, res, next) {
    // All private production routes, including Bearer requests, require an app session.
    req.appSession = getRecord(req, res); next();
  }
  function csrfMac(value) { return createHmac('sha256', csrfSecret).update(value).digest('base64url'); }
  function newCsrf() {
    const value = `${random()}.${now()}`;
    return `${value}.${csrfMac(value)}`;
  }
  function validCsrf(token) {
    if (typeof token !== 'string' || token.length > 200) return false;
    const parts = token.split('.');
    if (parts.length !== 3 || !/^\d+$/.test(parts[1])) return false;
    const age = now() - Number(parts[1]);
    return age >= 0 && age < csrfLifetime && equal(parts[2], csrfMac(`${parts[0]}.${parts[1]}`));
  }
  function writeCsrf(res, token, record) {
    const options = cookieOptions('csrf');
    if (record?.remember) options.maxAge = record.deadline - now();
    res.cookie(names.csrf, token, options);
  }
  function checkOrigin(req, required = true) {
    let expected;
    try {
      expected = new URL(origin);
      if (expected.origin !== origin || (production && expected.protocol !== 'https:')) throw new Error();
    } catch { throw authUnavailable(); }
    if (req.get('Sec-Fetch-Site') === 'cross-site' || (required && !req.get('Origin'))
      || (req.get('Origin') && req.get('Origin') !== expected.origin)) {
      throw new ApiError(403, 'CSRF_REJECTED', 'This request could not be verified.');
    }
  }
  function protect(req, res, next) {
    checkOrigin(req);
    let cookie;
    try { cookie = readCookie(req, 'csrf'); }
    catch { throw new ApiError(403, 'CSRF_REJECTED', 'This request could not be verified.'); }
    if (!validCsrf(cookie) || !equal(cookie, req.get('X-CSRF-Token'))) {
      throw new ApiError(403, 'CSRF_REJECTED', 'This request could not be verified.');
    }
    const record = sessions.get(readCookie(req, 'sid'));
    if (record && !equal(record.csrf, cookie)) {
      throw new ApiError(403, 'CSRF_REJECTED', 'This request could not be verified.');
    }
    next();
  }
  function csrf(req, res) {
    checkOrigin(req, false);
    const record = sessions.get(readCookie(req, 'sid'));
    let token = readCookie(req, 'csrf');
    if (!validCsrf(token) || (record && !equal(record.csrf, token))) token = newCsrf();
    if (record && !record.closed) record.csrf = token;
    writeCsrf(res, token, record);
    return { csrfToken: token };
  }
  function rateLimit(req, res, next) {
    prune();
    // Express does not trust forwarded IPs by default. Do not enable blanket trust proxy.
    const key = req.ip;
    let entry = attempts.get(key);
    if (!entry) {
      if (attempts.size >= maxRateKeys) throw authUnavailable();
      entry = { count: 0, until: now() + 15 * 60 * 1000 };
      attempts.set(key, entry);
    }
    if (++entry.count > loginLimit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - now()) / 1000))));
      throw new ApiError(429, 'RATE_LIMITED', 'Too many login attempts. Please try again later.');
    }
    next();
  }
  async function call(operation) {
    try { return await operation(); }
    catch { throw authUnavailable(); }
  }
  function checkedSession(data) {
    const session = data?.session;
    if (!data?.user?.id || !session || !session.access_token || !session.refresh_token
      || session.access_token.length > 3500 || session.refresh_token.length > 3500
      || !Number.isFinite(session.expires_at) || session.expires_at * 1000 <= now()) throw authUnavailable();
    return session;
  }
  function writeSession(res, record) {
    if (record.closed || Math.min(record.deadline, record.idleDeadline) <= now()) { clear(res); throw unauthorized(); }
    for (const [kind, value] of [['access', record.session.access_token], ['refresh', record.session.refresh_token], ['sid', record.id]]) {
      const options = cookieOptions(kind);
      if (record.remember) options.maxAge = Math.max(0, Math.min(record.deadline - now(),
        kind === 'access' ? record.session.expires_at * 1000 - now() : Infinity));
      res.cookie(names[kind], value, options);
    }
    writeCsrf(res, record.csrf, record);
  }
  async function revoke(session) {
    const client = createAuthClient();
    const established = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (established.error) {
      if (rejected(established.error)) return;
      throw authUnavailable();
    }
    const result = await client.auth.signOut({ scope: 'local' });
    if (result.error && !rejected(result.error)) throw authUnavailable();
  }
  async function performLogin(req, res, attempt) {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !['email', 'password', 'remember'].includes(key))
      || typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
      || typeof body.password !== 'string' || !body.password.length || body.password.length > 1024
      || (body.remember !== undefined && typeof body.remember !== 'boolean')) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid email, password, and optional boolean remember value.');
    }
    prune();
    if (sessions.size >= maxSessions) throw authUnavailable();
    const result = await call(() => createAuthClient().auth.signInWithPassword({ email: body.email.trim().toLowerCase(), password: body.password }));
    if (result.error) {
      if (rejected(result.error)) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
      throw authUnavailable();
    }
    const session = checkedSession(result.data);
    attempt.userId = result.data.user.id;
    let user;
    try { user = await loadUser(result.data.user); }
    catch (error) {
      // Do not retain a newly created provider session if its profile is unusable.
      await call(() => revoke(session));
      throw error;
    }
    if (attempt.invalidated) { await call(() => revoke(session)); throw unauthorized(); }
    const old = sessions.get(readCookie(req, 'sid'));
    if (old) { old.closed = true; sessions.delete(old.id); }
    if (sessions.size >= maxSessions) { await call(() => revoke(session)); throw authUnavailable(); }
    const record = { id: random(), publicId: random(), idleDeadline: now() + SESSION_IDLE_MS, session, userId: user.id, csrf: newCsrf(),
      remember: body.remember === true, closed: false, pending: null, lastRefresh: -Infinity,
      deadline: now() + (body.remember ? 30 * 24 : 12) * 60 * 60 * 1000 };
    sessions.set(record.id, record);
    writeSession(res, record);
    return { user, csrfToken: record.csrf, session: timing(record) };
  }
  async function login(req, res) {
    if (pendingLogins.size >= maxSessions) throw authUnavailable();
    const attempt = { email: typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '', invalidated: false };
    pendingLogins.add(attempt);
    try { return await performLogin(req, res, attempt); }
    finally { pendingLogins.delete(attempt); }
  }
  function invalidateUser(userId, email) {
    const pending = [];
    for (const attempt of pendingLogins) {
      if (attempt.userId === userId || (email && attempt.email === email)) attempt.invalidated = true;
    }
    for (const [id, record] of sessions) {
      if (record.userId !== userId) continue;
      record.closed = true;
      sessions.delete(id);
      if (record.pending) pending.push(record.pending);
    }
    return Promise.allSettled(pending);
  }
  function accessToken(req, res, explicitToken) {
    const record = getRecord(req, res);
    const token = explicitToken ?? readCookie(req, 'access');
    if (!equal(token, record.session.access_token)
      && !(now() - record.lastRefresh < graceMs && equal(token, record.previousAccess))) throw unauthorized();
    // Expiry is verified by getUser; don't discard refresh credentials on an expired access token.
    return token;
  }
  async function refresh(req, res) {
    const record = getRecord(req, res);
    const token = readCookie(req, 'refresh');
    if (!equal(token, record.session.refresh_token)
      && !(now() - record.lastRefresh < graceMs && equal(token, record.previousRefresh))) {
      clear(res); throw unauthorized();
    }
    if (!record.pending && now() - record.lastRefresh >= graceMs) {
      record.pending = (async () => {
        const result = await call(() => createAuthClient().auth.refreshSession({ refresh_token: record.session.refresh_token }));
        if (result.error) {
          if (rejected(result.error)) { record.closed = true; throw unauthorized(); }
          throw authUnavailable();
        }
        const session = checkedSession(result.data);
        if (result.data.user.id !== record.userId) { record.closed = true; throw unauthorized(); }
        record.previousAccess = record.session.access_token;
        record.previousRefresh = record.session.refresh_token;
        record.session = session;
        record.lastRefresh = now();
      })().finally(() => { record.pending = null; });
    }
    try {
      if (record.pending) await record.pending;
      getRecord(req, res); // A pending refresh cannot cross idle/absolute expiration.
      const verified = await call(() => createAuthClient().auth.getUser(record.session.access_token));
      if (verified.error || verified.data?.user?.id !== record.userId) {
        if (!verified.error || rejected(verified.error)) { record.closed = true; throw unauthorized(); }
        throw authUnavailable();
      }
      const user = await loadUser(verified.data.user);
      writeSession(res, record);
      return { user, csrfToken: record.csrf, session: timing(record) };
    } catch (error) {
      if (record.closed || error.status === 401 || error.status === 403) {
        record.closed = true;
        sessions.delete(record.id);
        clear(res);
      } else if (!record.closed) {
        // A provider rotation may have succeeded before a transient profile error.
        // Synchronize cookies to the new tokens so a retry does not reuse old credentials.
        writeSession(res, record);
      }
      throw error;
    }
  }
  async function activity(req, res) {
    if (!req.is('application/json') || !req.body || Array.isArray(req.body)
      || Object.keys(req.body).some((key) => key !== 'elapsedMs')
      || (req.body.elapsedMs !== undefined && (!Number.isInteger(req.body.elapsedMs) || req.body.elapsedMs < 0 || req.body.elapsedMs > 30000))) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Provide only an optional recent activity age.');
    }
    const record = getRecord(req, res);
    const token = accessToken(req, res);
    const activityTime = now();
    const verified = await call(() => createAuthClient().auth.getUser(token));
    if (verified.error || verified.data?.user?.id !== record.userId) {
      if (verified.error && !rejected(verified.error)) throw authUnavailable();
      clearAccess(res, req); throw unauthorized();
    }
    const user = await loadUser(verified.data.user);
    if (!user.verified || !['customer', 'admin'].includes(user.role)) throw new ApiError(403, 'PROFILE_UNAVAILABLE', 'A verified account is required.');
    getRecord(req, res); // Recheck after I/O, then update synchronously in this process.
    // A bounded past age accounts for coalesced real input. It can only REDUCE
    // the candidate deadline; client timestamps/future deadlines are never accepted.
    record.idleDeadline = Math.min(record.deadline, Math.max(record.idleDeadline, activityTime - (req.body.elapsedMs ?? 0) + SESSION_IDLE_MS));
    return { session: timing(record) };
  }
  function checkIdle(req, res) { return { session: metadata(req, res) }; }
  async function logout(req, res) {
    let record;
    try { record = getRecord(req, res); } catch (error) { clear(res); throw error; }
    // Close locally BEFORE awaiting rotation/revocation, preventing resurrection races.
    record.closed = true;
    sessions.delete(record.id);
    clear(res);
    await call(async () => {
      try { if (record.pending) await record.pending; } catch { /* Still revoke the last known session. */ }
      await revoke(record.session);
    });
    return { ok: true };
  }
  return { csrf, protect, rateLimit, login, refresh, logout, activity, checkIdle, metadata, requireSession, accessToken, clearAccess,
    invalidateUser, clearSessionCookies: clear };
}
