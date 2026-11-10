import { createClient } from '@supabase/supabase-js';
import { ApiError } from './errors.js';

export function unauthorized() {
  return new ApiError(401, 'UNAUTHORIZED', 'A valid access token is required.');
}

export function authUnavailable() {
  return new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable. Please try again.');
}

export function createAuthClientFactory({ url, publishableKey, clientFactory = createClient }) {
  return () => {
    if (!url || !publishableKey) throw authUnavailable();
    return clientFactory(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  };
}

/** One isolated server-memory PKCE store per OAuth attempt; never browser storage. */
export function createOAuthClientFactory({ url, publishableKey, clientFactory = createClient }) {
  return () => {
    if (!url || !publishableKey) throw authUnavailable();
    const values = new Map();
    return clientFactory(url, publishableKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
        storage: { getItem: (key) => values.get(key) ?? null,
          setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } } },
    });
  };
}

/** A fresh, unprivileged client per verification; never sign users into the DB singleton. */
export function createAccessTokenVerifier({ url, publishableKey, clientFactory = createClient }) {
  const createAuthClient = createAuthClientFactory({ url, publishableKey, clientFactory });
  return async (accessToken) => {
    // Missing Auth configuration must not interrupt the existing public product API.
    if (!url || !publishableKey) throw authUnavailable();
    let result;
    try {
      const client = createAuthClient();
      // getUser(token) validates with this project's Auth server, not local JWT decoding.
      result = await client.auth.getUser(accessToken);
    } catch {
      // SDK/network errors may contain request details. Do not log or forward them.
      throw authUnavailable();
    }
    if (result.error) {
      if ([400, 401, 403, 422].includes(result.error.status)) throw unauthorized();
      throw authUnavailable();
    }
    if (!result.data?.user?.id) throw unauthorized();
    return result.data.user;
  };
}
