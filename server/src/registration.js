import { ApiError } from './errors.js';
import { authUnavailable } from './auth.js';

const acceptedMessage = 'If registration can be completed, check your email for confirmation instructions. If your account is already confirmed, you can sign in.';
const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
const boundedString = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

export function createRegistration({ createAuthClient, loadUser, origin, now = Date.now, limit = 20 }) {
  const attempts = new Map();
  function rateLimit(req, res, next) {
    for (const [key, value] of attempts) if (value.until <= now()) attempts.delete(key);
    let entry = attempts.get(req.ip);
    if (!entry) {
      if (attempts.size >= 10000) throw authUnavailable();
      entry = { count: 0, until: now() + 15 * 60 * 1000 };
      attempts.set(req.ip, entry);
    }
    if (++entry.count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - now()) / 1000))));
      throw new ApiError(429, 'RATE_LIMITED', 'Too many confirmation requests. Please try again later.');
    }
    next();
  }
  function redirectTo() {
    try {
      if (new URL(origin).origin !== origin) throw new Error();
      return `${origin}/verify-email`;
    } catch { throw authUnavailable(); }
  }
  function body(req, allowed) {
    const value = req.body;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid registration request.');
    }
    return value;
  }
  function providerError(error, res, verification = false) {
    if (error.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error.code)) {
      res.set('Retry-After', '60');
      throw new ApiError(429, 'EMAIL_RATE_LIMITED', 'Please wait before requesting another confirmation email or code.');
    }
    if (verification && [400, 401, 403, 422].includes(error.status)) {
      throw new ApiError(400, 'INVALID_VERIFICATION', 'This confirmation is invalid or expired. Request a new email and try again.');
    }
    if (['weak_password', 'email_address_invalid', 'validation_failed'].includes(error.code)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Check your email and password requirements and try again.');
    }
    throw new ApiError(503, 'REGISTRATION_UNAVAILABLE', 'Registration or confirmation email delivery is temporarily unavailable. Please try again later.');
  }
  async function call(operation) {
    try { return await operation(); } catch { throw authUnavailable(); }
  }
  // Confirmation can create a provider session. Validate its identity/profile,
  // then dispose of it; registration never establishes an AVENGEMS login session.
  async function finish(client, session, res) {
    if (!session?.access_token) throw authUnavailable();
    let primary;
    try {
      const result = await call(() => client.auth.getUser(session.access_token));
      if (result.error) providerError(result.error, res, true);
      if (!result.data?.user?.id || !result.data.user.email_confirmed_at) {
        throw new ApiError(400, 'INVALID_VERIFICATION', 'Email confirmation is required before continuing.');
      }
      const profile = await loadUser(result.data.user);
      if (profile.role !== 'customer' || typeof profile.name !== 'string' || !profile.name.trim()) {
        throw new ApiError(403, 'PROFILE_UNAVAILABLE', 'Your customer profile is unavailable.');
      }
    } catch (error) { primary = error; }
    try {
      const result = await call(() => client.auth.signOut({ scope: 'local' }));
      if (result.error && ![401, 403, 404].includes(result.error.status)) throw authUnavailable();
    } catch (error) { if (!primary) primary = error; }
    if (primary) throw primary;
    return { verified: true };
  }
  async function register(req, res) {
    const value = body(req, ['name', 'email', 'password']);
    if (!boundedString(value.name, 100) || value.name.trim().length < 2 || !/^[\p{L}\s.,'-]+$/u.test(value.name)
      || !validEmail(value.email) || !boundedString(value.password, 128) || value.password.length < 8
      || !/[A-Z]/.test(value.password) || !/[a-z]/.test(value.password) || !/\d/.test(value.password) || !/[^A-Za-z0-9]/.test(value.password)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Use a valid full name, email, and an 8–128 character password with uppercase, lowercase, a number, and a special character.');
    }
    const email = value.email.trim().toLowerCase();
    const client = createAuthClient();
    const result = await call(() => client.auth.signUp({ email, password: value.password,
      options: { data: { name: value.name.trim() }, emailRedirectTo: redirectTo() } }));
    if (result.error && !['user_already_exists', 'email_exists', 'identity_already_exists'].includes(result.error.code)) {
      providerError(result.error, res);
    }
    // Some projects disable email confirmation and return a session immediately.
    // Verify the profile and revoke that session without setting login cookies.
    if (!result.error && result.data?.session) await finish(client, result.data.session, res);
    return { email, message: acceptedMessage };
  }
  async function resend(req, res) {
    const value = body(req, ['email']);
    if (!validEmail(value.email)) throw new ApiError(400, 'VALIDATION_ERROR', 'Use a valid email address.');
    const email = value.email.trim().toLowerCase();
    const result = await call(() => createAuthClient().auth.resend({ type: 'signup', email,
      options: { emailRedirectTo: redirectTo() } }));
    // Do not reveal whether an address is absent or already confirmed.
    if (result.error && !['user_not_found', 'email_not_found', 'email_exists', 'user_already_exists'].includes(result.error.code)) {
      providerError(result.error, res);
    }
    return { email, message: acceptedMessage };
  }
  async function verify(req, res) {
    const value = body(req, ['email', 'code', 'tokenHash', 'accessToken', 'refreshToken']);
    const keys = Object.keys(value).sort().join(',');
    const client = createAuthClient();
    let result;
    if (keys === 'code,email' && validEmail(value.email) && typeof value.code === 'string' && /^\d{6,10}$/.test(value.code)) {
      result = await call(() => client.auth.verifyOtp({ email: value.email.trim().toLowerCase(), token: value.code, type: 'email' }));
    } else if (keys === 'tokenHash' && boundedString(value.tokenHash, 2048)) {
      result = await call(() => client.auth.verifyOtp({ token_hash: value.tokenHash, type: 'email' }));
    } else if (keys === 'accessToken,refreshToken' && boundedString(value.accessToken, 3500) && boundedString(value.refreshToken, 3500)) {
      // Supabase's default confirmation link redirects with an implicit-flow
      // fragment. The browser removes it immediately and posts it once via CSRF.
      result = await call(() => client.auth.setSession({ access_token: value.accessToken, refresh_token: value.refreshToken }));
    } else {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Provide an emailed confirmation code or a valid confirmation link.');
    }
    if (result.error) providerError(result.error, res, true);
    return finish(client, result.data?.session, res);
  }
  return { rateLimit, register, resend, verify };
}
