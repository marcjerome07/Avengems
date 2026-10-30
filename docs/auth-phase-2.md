# Authentication Phase 2: backend cookie sessions

This phase adds backend login, logout and explicit refresh. Frontend authentication
is still mocked. Registration, OTP, OAuth, password recovery and migrations are
outside scope. No Supabase project settings are changed and no users are created.

## Configuration

| Variable | Requirement |
|---|---|
| `SUPABASE_URL` | Existing project URL. |
| `SUPABASE_PUBLISHABLE_KEY` | Required for request-scoped Auth clients. |
| `SUPABASE_SECRET_KEY` | Existing privileged database client; used only after identity verification for the matching profile. |
| `APP_ORIGIN` | Exact frontend origin, with no trailing slash or path. Defaults to `http://localhost:5173` in development. Explicit HTTPS origin required in production. Match the actual hostname, including localhost versus 127.0.0.1. |
| `NODE_ENV` | Set to `production` when deployed: enables Secure cookies and production cookie prefixes. |
| `PORT` | Existing optional backend port, default 3001. |

No dependency was added. Cookies use Express's existing serializer, cryptographic
operations use Node crypto, and Auth uses the existing Supabase SDK. Cookie/CSRF
signing material is randomly generated in memory on startup, never persisted.

## Endpoints

All responses, including errors, use `Cache-Control: no-store`. Auth responses vary
on Cookie and Origin; `/api/me` varies on Authorization and Cookie.

| Endpoint | Input / behavior | Success response |
|---|---|---|
| `GET /api/auth/csrf` | Bootstrap/renew CSRF protection; establishes an HttpOnly CSRF cookie. Rejects an explicitly foreign Origin or cross-site fetch. | `{ "csrfToken": "..." }` |
| `POST /api/auth/login` | JSON `{ email, password, remember? }`; remember is boolean, defaults false. Extra fields, including role/userId, are rejected. Uses `signInWithPassword`. | `{ "user": { ... }, "csrfToken": "..." }` plus session cookies. |
| `POST /api/auth/refresh` | No body needed. Requires the session ID, refresh cookie and CSRF protection. Uses `refreshSession`, then verifies Auth identity and reloads the profile. | `{ "user": { ... }, "csrfToken": "..." }` plus rotated/synchronized cookies. |
| `POST /api/auth/logout` | No body needed. Requires session and CSRF protection. Closes the app session before awaiting provider revocation; signs out this provider session only. | `{ "ok": true }` plus cookie deletion. |
| `GET /api/me` | Verified access cookie and app session ID, or existing Bearer authentication. Does not rotate tokens. | Same Phase 1 sanitized user object, without an envelope. |

`user` contains only `id`, `name`, `email`, `role`, `phone`, `verified`, and
`createdAt`. Role is always read from `profiles`. Email is from Auth; profile fields
are selected by the verified Auth subject. Addresses and raw metadata are omitted.
Access and refresh tokens never appear in JSON. `csrfToken` is an anti-CSRF value,
not an authentication token; keep it in client memory and send it in a header.

Invalid login credentials produce a generic 401 `INVALID_CREDENTIALS`. Missing,
expired or rejected sessions produce 401 `UNAUTHORIZED`. Profile failures retain
Phase 1's 403 `PROFILE_UNAVAILABLE` or 503 `DATABASE_UNAVAILABLE` behavior. Provider
outages and missing configuration use 503 `AUTH_UNAVAILABLE`. Invalid login bodies
use 400 `VALIDATION_ERROR`; non-JSON login uses 415. Errors keep `{ code, message }`.

## Cookie and CSRF rules

- Every cookie is host-only, HttpOnly and `SameSite=Strict`; Secure is enabled in
  production. No Domain attribute is used.
- Production names: `__Secure-avg_access` (Path `/api`),
  `__Secure-avg_refresh` (Path `/api/auth`), `__Host-avg_session` (Path `/`),
  and `__Host-avg_csrf` (Path `/`). Development names omit the security prefixes.
- Without remember, cookies are browser-session cookies and the server imposes an
  absolute 12-hour deadline. Browser session restoration may retain browser-session
  cookies; it is not a guaranteed browser-close logout.
- With remember, the absolute server deadline and persistent cookies last at most
  30 days. Access-cookie persistence is additionally capped at access-token expiry.
  Refresh does not extend the absolute deadline. Supabase can expire/revoke sooner.
- Every auth POST, including login, requires an exact configured Origin plus
  `X-CSRF-Token` matching the signed HttpOnly CSRF cookie. An authenticated session
  also binds the value to its server record. Missing Origin, invalid signatures,
  missing/mismatched headers or a cross-site fetch return 403 `CSRF_REJECTED`.
- CSRF protection expires after 24 hours. Bootstrap it again when needed. Login
  rotates it; refresh preserves it so parallel requests remain compatible.
- Same-origin `/api` hosting/proxying is assumed. There is no credentialed CORS
  policy. Host/forwarded-origin headers are not used to decide the trusted Origin.
- A supplied Authorization header always takes precedence for `/api/me`. Invalid
  Bearer headers never fall back to cookies or clear an otherwise valid cookie
  session. Cookie reads still verify the token with Supabase on every request.

## Refresh, logout and operational limits

Session records bind the cookies to an unguessable server-issued session ID.
There is one in-flight rotation per session. Concurrent requests share its result;
for ten seconds, stale parallel refresh cookies can retrieve the current result
instead of attempting to reuse the old provider token. New rotations are also
coalesced for that interval. This application grace window does not depend on
changing Supabase's refresh-token settings.

Expired access credentials clear only the access cookie, allowing explicit refresh.
Invalid refresh/session credentials clear cookies; a rejected stale refresh does
not invalidate an otherwise current server session. A transient failure after a
successful rotation synchronizes new cookies before returning the safe error.
After a network interruption with an unknown provider outcome, reauthentication
may still be necessary if Supabase rejects the old refresh token.

Logout closes the app record before waiting for in-flight rotation and then revokes
the latest provider session using a fresh request-scoped client (`setSession`,
then `signOut` with local scope). Delayed refreshes cannot reopen a closed record.
Cookies are cleared even if provider revocation fails; such a failure returns 503
instead of claiming provider logout succeeded. Missing sessions return 401 after
valid CSRF protection, also clearing cookies.

Supabase access JWTs can remain valid until expiry after provider signout. The app
session ID prevents cookie replay here, but Phase 1's independent Bearer transport
still has the provider's JWT lifetime semantics. HttpOnly does not remove the need
for XSS prevention.

The session store, refresh lock, and rate limiter are **single-process, in-memory**.
A restart signs cookie sessions out. Run one Express process: multiple workers or
instances require a shared session store and distributed refresh coordination
before deployment. Sticky routing alone does not provide durable sessions. Tokens
are retained in process memory for rotation/revocation as well as HttpOnly cookies.

Login is limited to ten CSRF-valid attempts per source IP per 15 minutes, including
successful attempts; blocked requests return 429 `RATE_LIMITED` and Retry-After.
The maps are capped at 10,000 session records and 10,000 rate-limit keys, failing
closed when full; expired entries are pruned on login. Express retains its default
untrusted-proxy behavior, so spoofed X-Forwarded-For cannot bypass the limiter.
Behind a proxy, configure only explicitly trusted proxy hops before relying on
per-user IP limits; otherwise users share the proxy's limit. No blanket trust-proxy
setting is enabled by this phase.

## Automated tests

From the repository root; all credentials/tokens are fabricated and transports
injected. No real users, settings or credentials are needed:

```powershell
node --test --experimental-test-isolation=none server/test/me.test.js server/test/products.test.js server/test/sessions.test.js
node --test --experimental-test-isolation=none src/services/productService.test.js
npm run lint
npm run build
```

## Manual checks without creating users

Start the backend with `npm start` from `server`. A missing-session read is safe:

```powershell
curl.exe "http://localhost:3001/api/me"
```

For an existing account you are authorized to use, PowerShell can keep cookies and
credentials in memory. Do not print headers or serialize the WebRequestSession,
and do not use curl verbose/header output for authenticated calls:

```powershell
$authBase = 'http://localhost:3001'
$authOrigin = 'http://localhost:5173' # Must match APP_ORIGIN
$authBrowser = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$authChallenge = Invoke-RestMethod "$authBase/api/auth/csrf" -WebSession $authBrowser -Headers @{ Origin = $authOrigin }
$authEmail = Read-Host 'Existing account email'
$authPassword = Read-Host 'Password' -AsSecureString
try {
  $authBody = @{ email = $authEmail; password = [Net.NetworkCredential]::new('', $authPassword).Password; remember = $false } | ConvertTo-Json -Compress
  $authLogin = Invoke-RestMethod "$authBase/api/auth/login" -Method Post -WebSession $authBrowser -ContentType 'application/json' -Headers @{ Origin = $authOrigin; 'X-CSRF-Token' = $authChallenge.csrfToken } -Body $authBody
  $authHeaders = @{ Origin = $authOrigin; 'X-CSRF-Token' = $authLogin.csrfToken }
  Invoke-RestMethod "$authBase/api/me" -WebSession $authBrowser
  $authRenewed = Invoke-RestMethod "$authBase/api/auth/refresh" -Method Post -WebSession $authBrowser -Headers $authHeaders
  $authHeaders['X-CSRF-Token'] = $authRenewed.csrfToken
  Invoke-RestMethod "$authBase/api/auth/logout" -Method Post -WebSession $authBrowser -Headers $authHeaders
} finally {
  Remove-Variable authBody, authPassword, authLogin, authRenewed, authHeaders, authChallenge, authBrowser -ErrorAction SilentlyContinue
}
```

This manual flow is provided for the user; development verification uses mocks and
does not sign in to a real Supabase account. It does not register or create users.
