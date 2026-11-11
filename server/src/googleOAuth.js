import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';
import { authUnavailable } from './auth.js';

const random = () => randomBytes(32).toString('base64url');
const same = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const OAUTH_LIFETIME_MS = 10 * 60 * 1000;

/** Process-local, bounded, browser-bound OAuth transactions. Supabase handles
 * Google's OAuth state; our independent state + cookie binds the app callback. */
export function createGoogleOAuth({ createOAuthClient, cookieSessions, origin, supabaseUrl,
  production = false, now = Date.now, maxAttempts = 1000 }) {
  const attempts = new Map();
  const cookieName = production ? '__Host-avg_google' : 'avg_google';
  // A top-level cross-site GET must carry this cookie. Auth cookies stay Strict.
  const options = { httpOnly: true, secure: production, sameSite: 'lax', path: '/' };
  function appOrigin() {
    try {
      const url = new URL(origin);
      if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)
        || (production && url.protocol !== 'https:')) throw new Error();
      return url.origin;
    } catch { throw authUnavailable(); }
  }
  function binding(req) {
    const parts = (req.headers.cookie ?? '').split(';').map((part) => part.trim())
      .filter((part) => part.startsWith(`${cookieName}=`));
    if (parts.length !== 1) return null;
    const value = parts[0].slice(cookieName.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }
  function remove(state, entry) {
    entry.cancelled = true;
    entry.login.cancel();
    entry.client = null;
    attempts.delete(state);
  }
  function prune() {
    for (const [state, entry] of attempts) if (entry.expires <= now()) remove(state, entry);
  }
  const timer = setInterval(prune, 60000);
  timer.unref?.();
  function cancel(req, res) {
    const value = binding(req);
    if (value) for (const [state, entry] of attempts) if (same(entry.binding, value)) remove(state, entry);
    res.clearCookie(cookieName, options);
    return { ok: true };
  }
  async function start(req, res) {
    const body = req.body;
    if (!body || Array.isArray(body) || typeof body !== 'object'
      || Object.keys(body).some((key) => key !== 'remember') || typeof body.remember !== 'boolean') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a boolean Remember Me preference.');
    }
    const base = appOrigin();
    prune();
    cancel(req, res); // One current attempt per browser; a new attempt cancels the old one.
    if (attempts.size >= maxAttempts) throw authUnavailable();
    const state = random();
    const entry = { binding: random(), remember: body.remember, expires: now() + OAUTH_LIFETIME_MS,
      used: false, cancelled: false, login: cookieSessions.beginProviderLogin(req), client: null };
    attempts.set(state, entry);
    try {
      const client = createOAuthClient();
      entry.client = client;
      const result = await client.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: `${base}/api/auth/google/callback/${state}`, skipBrowserRedirect: true,
        scopes: 'openid email profile',
      } });
      if (result.error || entry.cancelled || entry.expires <= now()) throw authUnavailable();
      const target = new URL(result.data?.url);
      const provider = new URL(supabaseUrl);
      const localHttp = !production && provider.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(provider.hostname);
      if ((provider.protocol !== 'https:' && !localHttp) || provider.username || provider.password
        || target.origin !== provider.origin || target.pathname !== `${provider.pathname.replace(/\/$/, '')}/auth/v1/authorize`
        || target.searchParams.get('provider') !== 'google'
        || target.searchParams.get('redirect_to') !== `${base}/api/auth/google/callback/${state}`
        || target.searchParams.get('code_challenge_method') !== 's256'
        || !target.searchParams.get('code_challenge')) throw authUnavailable();
      entry.flowId = result.data?.flowId;
      res.cookie(cookieName, entry.binding, { ...options, maxAge: OAUTH_LIFETIME_MS });
      return { url: target.href };
    } catch {
      remove(state, entry);
      throw new ApiError(503, 'GOOGLE_UNAVAILABLE', 'Google sign-in is unavailable. Please try again or use email and password.');
    }
  }
  async function callback(req, res) {
    res.set('Referrer-Policy', 'no-referrer');
    const base = appOrigin();
    // An explicit empty fragment prevents browsers inheriting a provider error
    // fragment when following this redirect. Never forward provider descriptions.
    const fail = (code) => res.redirect(303, `${base}/login?oauth=${code}#`);
    const state = req.params.state;
    const entry = typeof state === 'string' && /^[A-Za-z0-9_-]{43}$/.test(state) ? attempts.get(state) : null;
    if (!entry || entry.used || entry.cancelled || !same(entry.binding, binding(req))) return fail('invalid');
    if (entry.expires <= now()) { remove(state, entry); return fail('expired'); }
    entry.used = true; // Consume before any provider I/O; concurrent replay cannot exchange.
    const client = entry.client;
    let issued = false, installed = false;
    try {
      if (req.query.error) return fail(req.query.error === 'access_denied' ? 'denied' : 'failed');
      // Fragments are not sent to servers. A cancellation delivered as a fragment
      // arrives here without a code and must still return a usable login page.
      if (!Object.keys(req.query).length) return fail('denied');
      if (typeof req.query.code !== 'string' || !req.query.code.length || req.query.code.length > 2048
        || Object.keys(req.query).some((key) => key !== 'code')) return fail('invalid');
      const result = await client.auth.exchangeCodeForSession(req.query.code,
        entry.flowId ? { flowId: entry.flowId } : undefined);
      if (result.error || !result.data?.session) return fail('failed');
      issued = true;
      entry.login.identify(result.data.user);
      const verified = await client.auth.getUser(result.data.session.access_token);
      const user = verified.data?.user;
      if (verified.error || !user?.id || user.id !== result.data.user?.id || !user.email_confirmed_at
        || !user.identities?.some((identity) => identity.provider === 'google')) return fail('failed');
      const logged = await entry.login.complete(res, { session: result.data.session, user }, entry.remember,
        () => !entry.cancelled && entry.expires > now());
      installed = true;
      // Fixed server-selected destinations; no client return URL or metadata role.
      return res.redirect(303, `${base}${logged.user.role === 'admin' ? '/admin' : '/account'}#`);
    } catch {
      return fail('failed');
    } finally {
      remove(state, entry);
      // The binding cookie is harmless after consumption and expires in 10 minutes.
      // Do not clear it from delayed callbacks: they could erase a newer attempt.
      if (issued && !installed) {
        try { await client.auth.signOut({ scope: 'local' }); } catch { /* Fail closed locally regardless of provider availability. */ }
      }
    }
  }
  return { start, callback, cancel, dispose: () => {
    clearInterval(timer);
    for (const [state, entry] of attempts) remove(state, entry);
  } };
}
