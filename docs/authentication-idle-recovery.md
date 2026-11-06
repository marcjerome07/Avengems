# Idle authentication investigation and recovery fix

This records the earlier recovery fix. The subsequent
[20-minute server-enforced policy](authentication-idle-policy.md) adds actual idle
expiration and fixes the remaining CSRF-bootstrap/cookie races. The older statement
that there is no short inactivity policy is historical.

## Confirmed application bug

Two new frontend regressions failed before the fix: a temporary `/api/me` 503
discarded an already verified admin identity, and an expired-access-token refresh
interrupted by a network error changed a valid customer/admin session to `error`.
Both failures were reproduced through the actual frontend session service and store
using fabricated HTTP responses; no live credentials or Supabase data were used.

The causal chain was:

1. AuthProvider revalidates visible authenticated tabs every 60 seconds and on
   focus, visibility change and network reconnection. Hidden tabs skip periodic
   checks and revalidate when visible again. Mouse/keyboard inactivity is not used.
2. authSession.restore called getCurrentUser. Its catch block unconditionally set
   `{user:null,status:'error',error}`, including temporary network/provider/profile
   failures during background revalidation or token renewal.
3. This discarded frontend login state even though Express could still have a
   renewable cookie session. Both guards hid private content behind the retry/login
   screen. Navbar/context consumers observed isAuthenticated=false.
4. The minute callback checks status==='authenticated', so status='error' also
   stopped periodic recovery. Focus/online/manual retry could still recover, but
   a quiet foreground tab remained in the error state.

This is unintended error recovery, not an application 1–5 minute inactivity policy.
The exact network/provider failure triggering the reported live incident has not
been observed: no browser network trace or server-restart history was supplied.
A genuine expired/revoked session or restarted backend remains a separate sign-out
case. Do not infer the live project's access-token TTL or idle policy from a mocked
test. The reproducible code-level failure above was established before production
code changed.

## Complete flow reviewed

- `src/context/AuthContext.jsx`: initial restore, deduplicated state subscription,
  minute/focus/online/visibility checks; no inactivity logout timer.
- `src/components/routing/{AdminRoute,ProtectedRoute}.jsx`: errors/loading/signout
  take precedence over content or navigation. Admin additionally requires a
  confirmed server-derived admin role. These guards are unchanged.
- `src/services/{authSession,sessionService,authService}.js`: cookie login/logout,
  sanitized verified identity, one shared restore/refresh, bounded CSRF retry,
  and `/api/me` → 401 → CSRF-protected `/api/auth/refresh` → fresh `/api/me`.
  Non-401 errors are not mistaken for successful authentication. Uncertain network
  writes are not immediately replayed.
- `server/src/routes/{auth,me}.js`, `server/src/{sessions,auth,profile}.js` and
  `server/src/middleware/{auth,admin}.js`: HttpOnly/SameSite cookies, Secure production
  cookies, trusted Origin/signed CSRF checks, provider getUser verification and
  current database role/ownership checks. Expired access clears only access cookies;
  refresh/session credentials survive for secure renewal. Refresh validates subject
  and profile after token rotation, with bounded parallel-request coordination.
- `server/src/index.js`: both me/admin verification reject recovery-only tokens;
  privileged database client is not used as the user's Auth session client.
- Private commerce/customer/wishlist clients already refresh after an explicit 401
  and retain bounded retries. They do not implement idle logout.

Without Remember me, cookie sessions have an absolute 12-hour server deadline and
browser-session cookies. Remember me has at most 30 days, with access-cookie
Max-Age additionally capped by provider access-token expiry. Rotation never extends
the absolute deadline. Supabase revocation/expiry can end a session sooner. Backend
session coordination is process-local; restarting Express signs sessions out.

## Small fix and security boundary

Only `src/services/authSession.js` changes runtime behavior. On a recognized
temporary network/service/server error, rate limit or HTTP 5xx, an already
authenticated session retains its last verified identity/status **and records the
error**. The existing minute/focus/online retry remains eligible. Private content
continues to be withheld by the unchanged error-first guards until successful fresh
verification; a cached identity is never returned as a successful restore result.

Initial authentication failures cannot install a cached identity. Definitive
401/403, invalid-role and unconfirmed responses do not retain identity. A 401 after
failed refresh returns anonymous; successful revalidation replaces roles with the
fresh server result. Explicit logout and its generation/race safeguards remain
unchanged. No extra keepalive, token/session duration, cookie, refresh privilege,
CSRF, RLS or backend authorization change was introduced.

## Regression evidence and manual verification

Frontend cases verify temporary background failures retain identity while hiding
protected content, interrupted idle refresh recovers for both roles, revoked
sessions clear identity, and demotion/unconfirmed/invalid role responses fail closed.
Backend tests use real Express requests with fabricated provider responses and a
controlled clock: after five idle minutes and a 60-second access TTL, both roles
renew with/without Remember me, including a missing expired access cookie. Refresh
still rejects missing Origin, retains HttpOnly/SameSite, does not extend persistent
cookie deadlines, preserves credentials through a temporary provider failure, and
rejects the session at its original absolute deadline.

No live Supabase test or account modification was performed. To verify manually
with an already authorized session, leave the page hidden for five minutes, return
and inspect endpoint/status/timing only (never copy tokens/cookies). A genuinely
expired access token should produce at most one shared refresh and a successful
fresh `/api/me`. To test transport failure, use browser Offline mode: the session
error should hide private content without discarding the known identity; reconnect
and expect recovery on online/focus, minute check or Try again. Genuine logout,
revocation, changed role and absolute expiry must continue to deny access. Do not
change Supabase token settings or create/promote accounts for this check.

Final regression execution: **129 backend tests and 90 frontend tests passed**;
`npm run lint`, `npm run build` and `git diff --check` passed. The two new frontend
reproductions failed before the runtime fix and passed afterward. No SQL or live
authentication/provider configuration was changed.
