# Authentication Phase 1: identity and GET /api/me

Historical Phase 1 contract. Cookie transport and session endpoints are now
documented in [auth-phase-2.md](auth-phase-2.md); Bearer compatibility remains.

Only server-side access-token verification and the current-user read endpoint are
implemented. Login, registration, OTP, recovery, refresh, cookies, frontend auth
integration, profile writes and migrations are outside this phase.

## Transport and verification

Send a Supabase Auth **user access token** in `Authorization: Bearer <access_token>`.
API keys are not user access tokens. Query parameters, cookies, submitted user IDs,
emails, roles and metadata roles are never used as proof of identity.
Duplicate/malformed Authorization headers are rejected.

Each verification creates a fresh Supabase Auth client using `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY`, with persistence, refresh and URL-session detection
disabled. `auth.getUser(accessToken)` checks the token with the project's Auth
server. No locally decoded JWT payload is trusted. The shared secret-key database
client never receives a signed-in user session.

After verification, middleware attaches a small `req.auth` identity containing
`userId`, `email`, and `emailConfirmedAt`; it does not retain the token or metadata.
The route queries only the profile whose ID matches that verified user ID. The
role comes exclusively from the database and must be `customer` or `admin`.
This middleware establishes identity; future admin routes must additionally
enforce authorization from the current database role.

The publishable key is required for this endpoint. Missing Auth configuration
returns a safe 503 without breaking the existing public product endpoints. No
environment file or credential is changed by this implementation.

## Response

HTTP 200 returns a single sanitized object compatible with the frontend's core
user fields:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Customer",
  "email": "customer@example.test",
  "role": "customer",
  "phone": "",
  "verified": true,
  "createdAt": "2026-01-02T00:00:00Z"
}
```

The example is fabricated. `name`, `phone`, `role` and `createdAt` come from
`profiles`. Email and email-confirmation status come from verified Supabase Auth
data. A null phone maps to an empty string. An Auth identity without an email
returns `email: null`. Unconfirmed email maps to `verified: false`; verification
of email is not an additional access restriction in this phase.

Addresses are omitted because this phase does not query them; an empty list would
incorrectly imply the user has no saved addresses. No passwords, raw Auth metadata,
access tokens or refresh tokens are returned. Responses, including errors, use
`Cache-Control: no-store` and vary on `Authorization`.

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing, malformed, rejected, invalid or expired authentication. Includes a Bearer challenge. |
| 403 | `PROFILE_UNAVAILABLE` | Verified identity has no corresponding usable profile. No profile is automatically created. |
| 503 | `AUTH_UNAVAILABLE` | Missing Auth configuration, network/provider failure or Auth service rate limiting. |
| 503 | `DATABASE_UNAVAILABLE` | Profile lookup failed. |

Errors retain the existing `{ "code": "...", "message": "..." }` envelope.
Provider and database exception details are not returned or logged by this module.

## Future HttpOnly cookies

The verifier is separate from Bearer-header parsing. A future server-owned session
layer can retrieve the access token from HttpOnly cookies and call the same
verifier, keeping profile mapping unchanged. That phase must define transport
precedence, refresh rotation/concurrency, CSRF protection, cookie security, logout
and persistence. No cookie is accepted as authentication yet.

## Safe checks

Run from the repository root. All automated tests use fabricated tokens and
injected/mock transports; they need no real credentials and create no users:

```powershell
node --test --experimental-test-isolation=none server/test/me.test.js server/test/products.test.js
node --test --experimental-test-isolation=none src/services/productService.test.js
npm run lint
npm run build
```

To check the real server's unauthenticated behavior after starting it with
`npm start` from `server`:

```powershell
curl.exe -i "http://localhost:3001/api/me"
```

Expected: HTTP 401, `UNAUTHORIZED`. Use the configured port if different. Do not
paste real tokens into shell commands, logs, screenshots or committed files.
Real authenticated success requires a separately obtained, unexpired Auth user
access token and an existing matching profile; Phase 1 does not obtain tokens.
