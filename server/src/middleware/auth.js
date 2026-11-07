import { ApiError } from '../errors.js';
import { unauthorized, authUnavailable } from '../auth.js';

/** An explicit Authorization header takes precedence; never fall back from a bad header. */
export function createRequireAuth(verifyAccessToken, { cookieSessions } = {}) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.vary('Authorization');
    res.vary('Cookie');
    let auth;
    let usingCookies = false;
    try {
      // Reject ambiguous duplicate headers as well as malformed schemes/tokens.
      const headerCount = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'authorization').length;
      const match = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i.exec(req.get('Authorization') ?? '');
      let token;
      if (headerCount) {
        if (headerCount !== 1 || !match) throw unauthorized();
        token = match[1];
        if (req.appSession) token = cookieSessions.accessToken(req, res, token);
      } else {
        usingCookies = true;
        token = cookieSessions?.accessToken(req, res);
        if (!token) throw unauthorized();
      }
      const user = await verifyAccessToken(token);
      if (!user || typeof user.id !== 'string' || !user.id) throw unauthorized();
      // Only carry verified identity fields; never retain the token or metadata roles.
      auth = Object.freeze({
        userId: user.id,
        email: user.email ?? null,
        emailConfirmedAt: user.email_confirmed_at ?? null,
      });
    } catch (error) {
      const safeError = error instanceof ApiError && ['UNAUTHORIZED', 'AUTH_UNAVAILABLE', 'SESSION_IDLE_EXPIRED'].includes(error.code)
        ? error : authUnavailable();
      if (usingCookies && safeError.status === 401) cookieSessions?.clearAccess(res, req);
      if (safeError.status === 401) res.set('WWW-Authenticate', 'Bearer realm="avengems"');
      return next(safeError);
    }
    req.auth = auth;
    next();
  };
}
