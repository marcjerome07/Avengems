# Password recovery using Supabase email OTPs

Forgot Password and Reset Password now use real backend recovery endpoints. The
existing Supabase Reset password template uses `{{ .Token }}`; this flow accepts
the provider's emailed numeric code, not a browser-generated OTP or recovery link.
No project settings, users, schema, seed data or dependencies were changed.

## SDK compatibility

The installed `@supabase/supabase-js` and `@supabase/auth-js` are **2.118.0**.
Installed source and an automated test with the real SDK/fake transport verify:

- `resetPasswordForEmail(email)` calls the provider recovery endpoint.
- `verifyOtp({ email, token, type: 'recovery' })` creates a provider recovery session.
- `updateUser({ password })` uses that user's session/JWT, without accepting a user ID.
- Global logout can be sent to `/auth/v1/logout?scope=global` with the verified
  recovery user's JWT and the publishable client. The SDK transport helper is
  named `auth.admin.signOut`; it is not a privileged password update and uses no
  secret key. This preserves HTTP revocation errors that high-level `auth.signOut`
  can suppress. No `auth.admin.updateUserById` or privileged database client is used.

No SDK upgrade is needed. Reference: [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail),
[verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp),
[updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser).

## API contracts

All three endpoints are JSON POSTs protected by the existing exact Origin check,
signed CSRF cookie and `X-CSRF-Token`. All responses are no-store. Frontend requests
use `credentials: 'include'`. No provider tokens or recovery authorization are
returned in response JSON, exposed to JavaScript, logged or placed in browser storage.
Passwords and entered OTPs are sent only in the HTTPS request body when deployed.

| Endpoint | Request body | Success response |
|---|---|---|
| `/api/auth/forgot-password` | `{ "email": "..." }` | HTTP 202 `{ "message": "If an account exists…", "retryAfter": 60 }`. |
| `/api/auth/verify-recovery` | `{ "email": "...", "code": "..." }` | HTTP 200 `{ "verified": true, "expiresIn": 300 }` (possibly shorter if provider JWT expires sooner). Sets only an opaque recovery cookie. |
| `/api/auth/reset-password` | `{ "password": "..." }` | HTTP 200 `{ "ok": true, "signInRequired": true, "sessionRevocationConfirmed": true }`. The last field is false if provider global signout could not be confirmed. |

Extra fields, including userId, role, email on reset, provider tokens, or a
client-selected OTP type, are rejected. Password validation matches registration:
8–128 characters with uppercase, lowercase, number and special character; provider
policy can be stricter. Codes are strings containing 6–10 digits.

Account absence, account-specific recipient restrictions and provider email-limit
responses have identical accepted responses. HTTP 202 does not guarantee delivery.
App limits apply uniformly, before provider account lookup: five sends per IP per
15 minutes, a 60-second per-IP/email cooldown, and twenty combined verify/reset
attempts per IP per 15 minutes. Limiter maps have 10,000-entry caps. They use direct
Express IPs, retaining the existing untrusted-proxy policy. No existence-dependent
user lookup or local password comparison occurs.

Invalid codes return 400 `INVALID_CODE`; missing, expired or replayed authorization
returns 401 `INVALID_RECOVERY`; weak passwords return 400 `WEAK_PASSWORD`; rate
limits return 429 with Retry-After; network/provider failures use safe 503 errors.
CSRF/Origin errors retain 403, and malformed input uses 400. Raw provider details
are never returned. Failed/uncertain provider password updates are never retried
automatically: request a fresh OTP if the existing authorization was consumed.

## Authorization separation and replay protection

The provider's real recovery JWT and refresh token stay in a bounded server-only
map. After verified OTP and online `getUser` checks, the browser receives an
unguessable 256-bit opaque cookie; the map stores only its hash as the lookup key.
It is HttpOnly, host-only, SameSite=Strict, scoped to
`/api/auth/reset-password`, and Secure in production. Cookie names are
`avg_recovery` in development and `__Secure-avg_recovery` in production.

The authorization lasts at most five minutes and never outlives the provider JWT.
It cannot be renewed into a normal app session, cannot refresh via the app refresh
endpoint, and is never interpreted by `/api/me`. As defense in depth, known JWTs
issued through this backend recovery flow are denied by `/api/me`'s Bearer verifier
until their expiry. Future private endpoints must reuse that guarded verifier.
An existing, separate normal login session is not a recovery authorization.

Only the latest verified flow per user remains usable. Reset consumes the grant
synchronously before any provider await, so simultaneous replay requests lose.
Local malformed/weak password input is rejected before consumption, allowing a
correction. Once a provider attempt begins, even a provider weak-password error or
ambiguous network outcome requires a new verified flow. CSRF rejection happens
before the grant is consumed. Cookies are cleared on consumption or expiry.

Reset uses a new request-scoped public Auth client, establishes only the stored
recovery session, rechecks its identity/expiry, and invokes `updateUser`. It never
accepts arbitrary IDs or performs a privileged admin password update.

## Session invalidation and limitations

The target user's app sessions are closed before the provider password update and
again afterward, including on uncertain failures. In-flight refreshes settle without
reopening the closed records; in-flight logins for the same verified subject/email
are fenced off. Other users' sessions remain intact. Other recovery grants and
pending verifications for that email are invalidated as well. The current browser's
normal cookies are cleared and frontend state is explicitly logged out, preventing
stale restoration responses from showing private content after success.

After a successful password change, provider global signout is attempted with the
recovery user's JWT. If it fails, the password change still succeeded and local app
sessions remain closed. The response reports `sessionRevocationConfirmed: false`
and the UI displays a warning rather than claiming all devices were signed out.

Supabase access JWTs may remain valid until expiry despite refresh-session
revocation. The independent Phase 1 Bearer transport retains that limitation for
ordinary tokens; this implementation does not claim immediate revocation of every
JWT on every external Supabase consumer. Recovery JWTs from this flow are kept off
the browser and locally denied. [Supabase signout guidance](https://supabase.com/docs/reference/javascript/auth-signout)

All grants, fences, deny entries and session records are **single-process and
in-memory**, matching the existing app session design. A restart invalidates the
opaque grants and cookie sessions, and loses local deny entries. Production with
multiple workers requires shared storage and distributed coordination first.
Expired/abandoned grants lose their server credentials; no browser can recover
them. Provider sessions may persist until provider expiry if cleanup is unavailable.

## Frontend behavior

The original AuthShell, forms, password checklist and navigation are retained.
`otpService` now delegates to recovery APIs only; local code generation, console
notices, sessionStorage records, demo expiry and custom reset tokens are removed.
The resend timer reflects server cooldown hints; it does not decide OTP validity.
Reset holds no credential in React state—only the ordinary password input.
Successful reset prompts sign-in and reports any signout warning. There is no auto
login. Registration and its separate confirmation components remain unchanged.

## Safe manual testing with an existing developer account

1. Keep the existing environment configuration (`SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_ORIGIN`, production
   `NODE_ENV`). No new keys or settings are required. Do not change the already
   configured Reset password template using `{{ .Token }}`. Confirm existing mail
   delivery permits your developer-controlled recipient; do not loosen settings.
2. Run `npm start` from `server`, and `npm run dev` from the repository root. Open
   `http://localhost:5173/forgot-password`, matching APP_ORIGIN exactly.
3. Deliberately enter the existing developer account email and click Send OTP once.
   Expect a generic response whether the address exists. Observe server cooldowns;
   do not repeatedly send mail or share credentials, OTPs, cookies or headers.
4. Read the real recovery OTP from the mailbox and enter it. A deliberately wrong
   code must fail. A valid code should show the new-password form, not log you in.
   In a logged-out/private browser context, `/account` and `/admin` must remain
   inaccessible while only recovery authorization exists.
5. Set a new test password meeting the checklist. Expect success and a sign-in
   prompt; any revocation warning must remain visible. Verify the new password
   through the existing login form. An old-password attempt should fail. Avoid
   exceeding login's ten-attempt/15-minute limit.
6. To check expiry, verify a fresh code and wait over five minutes before submitting
   a new password. Expect an expired-authorization response and restart the flow.
   Refreshing the page also loses the form step; request a new code when needed.
7. Leave an existing login in a second tab/device before reset. After reset, focus
   or reload that tab: server revalidation must require sign-in. Never change roles
   or inspect/copy cookie values to test this. Replay/concurrency tests below avoid
   risking a real account.
8. For a network interruption during reset, do not repeatedly submit the same grant.
   The password may have changed even if the response was lost. Try signing in
   with the intended new password, or deliberately start another recovery flow.

Automation creates no real users, sends no real mail and changes no passwords.
Real-account testing above is a deliberate developer action, not executed by the agent.

## Automated checks

From the repository root, using fabricated provider responses and mock transports:

```powershell
node --test --experimental-test-isolation=none server/test/me.test.js server/test/products.test.js server/test/sessions.test.js server/test/registration.test.js server/test/recovery.test.js
node --test --experimental-test-isolation=none src/services/authSession.test.js src/services/productService.test.js src/services/registrationService.test.js src/services/recoveryService.test.js
npm run lint
npm run build
```

React tests and Vite builds may require normal helper-process approval in a restricted
Windows sandbox. No dependencies were installed or upgraded.
