# Customer registration and email confirmation

The signup and verification screens now use real Supabase Auth through Express.
Login and AuthContext now use [backend cookie sessions](frontend-authentication.md);
[password recovery](password-recovery.md) now uses Supabase recovery OTPs. A new
account is not added to browser storage, and registration never signs the frontend
in automatically. No database schema, seed, settings or credentials were changed.

## Endpoints

These routes share the existing signed-CSRF/Origin protection and no-store response
headers. Obtain CSRF protection from `GET /api/auth/csrf`, then use same-origin
credentials and `X-CSRF-Token`. Browser POST requests supply Origin automatically.
They have an independent shared limit of 20 CSRF-valid requests per source IP per
15 minutes, separate from login's existing limiter. All request bodies are JSON.

| Endpoint | Body | Success |
|---|---|---|
| `POST /api/auth/register` | `{ name, email, password }` | HTTP 202 `{ email, message }`. |
| `POST /api/auth/resend-verification` | `{ email }` | Same generic HTTP 202 shape. |
| `POST /api/auth/verify-email` | `{ email, code }`, `{ tokenHash }`, or `{ accessToken, refreshToken }` | HTTP 200 `{ verified: true }`. |

Name: 2–100 characters after trimming, using letters and existing supported name
punctuation. Email is trimmed/lowercased and limited to 254 characters. Password:
8–128 characters with uppercase, lowercase, number and special character, matching
the existing checklist. Supabase may enforce additional configured requirements.
Extra keys, including role, userId, provider type, redirect URL or SDK options, are
rejected. Only `name` is sent in signup metadata. The database supplies customer role.

New, existing and obfuscated signup responses use the same accepted message; the
API does not return signup IDs, raw identities, passwords, codes or Auth tokens.
HTTP 202 means the request was handled, not proof that a new account was created or
email delivered. Provider email throttling becomes 429 `EMAIL_RATE_LIMITED` with
Retry-After; delivery/SMTP, disabled signup, trigger and provider failures become
safe 503 errors. Retry-After is a minimum retry hint, not a guarantee the provider's
email quota has reset. Bad fields use 400, bad CSRF/Origin use 403.

## Provider confirmation flows

- Numeric codes are checked with Supabase `verifyOtp` using the email confirmation
  type. The UI accepts 6–10 digits; no locally generated code, browser OTP record,
  invented expiry, console disclosure or automatic resend is involved.
- Default Supabase confirmation links first verify at Supabase, then redirect to
  the configured frontend `/verify-email` with an implicit-flow token fragment.
  The frontend reads it once, immediately strips it from the address bar, and posts
  the proof in the body over the existing CSRF-protected API. Credentials stay in
  memory only; the backend uses a request-scoped `setSession` and `getUser`.
- Existing custom templates that send `token_hash` to `/verify-email` are supported
  through Supabase `verifyOtp`, always using the email type. This implementation
  does not install/change a template. Recovery links and unsupported PKCE `code`
  callbacks are rejected by the frontend; no recovery flow is implemented here.

Every successful confirmation requires a provider-verified, email-confirmed Auth
identity and an existing matching, named customer profile. The temporary provider
session is signed out locally and no AVENGEMS login cookies are set. This also
applies if the project's existing settings cause signup to return an immediate
confirmed session. Existing login/session endpoints remain unchanged.

`otpService` and `OtpVerifier` now use the separate backend recovery path.
Registration uses `registrationService` and `RegistrationVerifier`.

## Profile trigger verification

The inspected `server/db/schema.sql` defines an `auth.users` AFTER INSERT trigger
that inserts `profiles(id, name)` from the Auth UUID and `raw_user_meta_data.name`.
`profiles.role` defaults to `customer`. The application never inserts a replacement
profile or sets a signup role.

The deployed trigger has not been exercised by creating a user automatically.
Pending signup responses cannot safely prove profile ownership because Supabase
can return obfuscated users for existing addresses. Profile checks therefore occur
after verified confirmation (or an immediately confirmed signup session), using
the real verified subject. Missing profiles, missing names or non-customer roles
return 403 `PROFILE_UNAVAILABLE`; database errors return safe 503. A trigger failure
during signup is reported as a generic registration-service error. No self-repair,
migration or privilege escalation is attempted.

## Safe developer browser test

These steps are for a developer to perform deliberately; automation uses mocks and
does not create users or sign into real accounts.

1. Confirm the existing server configuration names are present:
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `APP_ORIGIN`.
   Use `NODE_ENV=production` plus an HTTPS origin when deployed. No frontend Supabase
   key or SDK is needed. Development defaults to `http://localhost:5173`.
2. In the Supabase dashboard, inspect the existing email provider, confirmation
   setting, SMTP/sender restrictions, email template and redirect allowlist. Do not
   change settings without approval. The expected redirect is the exact
   `APP_ORIGIN` followed by `/verify-email`. If not allowed, Supabase may fall back
   to the configured Site URL and the link will not reach this screen.
3. Start Express from `server` with `npm start`. In a second terminal at the repo
   root run `npm run dev`. Open `http://localhost:5173/signup` (use the same hostname
   as APP_ORIGIN, not 127.0.0.1 if localhost is configured).
4. Enter a developer-controlled email authorized by the project's existing mail
   setup, a non-sensitive display name, and a new test password. Click Create
   Account once. This deliberate action creates a real Auth user when permitted.
5. Check the inbox/spam folder. Follow the actual confirmation link or enter the
   actual emailed code. Never paste it, the password, a callback URL, cookies or
   full request/response headers into logs, screenshots or this chat. If delivery
   is blocked or throttled, stop repeated signup attempts; inspect the existing mail
   restrictions and request approval for any required configuration change.
6. After confirmation succeeds, inspect the new user in Supabase Auth and its row
   in the profiles table using the dashboard. Confirm matching UUID, submitted
   name, `customer` role, and confirmed email. This is the real deployed-trigger
   verification. Do not manually elevate the test account or create a substitute
   profile to hide a trigger problem.
7. Registration does not log in automatically. Use `/login` with the confirmed
   customer account, following `frontend-authentication.md`. Never put credentials
   in shell history or print cookie headers.

The existing Supabase mail service may restrict recipients to authorized developer
addresses and impose low delivery quotas. Those project settings were neither
queried nor changed by this implementation. Provider email templates determine
whether recipients see links or numeric codes.

## Automated verification

Run from the repository root; all Supabase responses, credentials and tokens in the
tests are fabricated:

```powershell
node --test --experimental-test-isolation=none server/test/me.test.js server/test/products.test.js server/test/sessions.test.js server/test/registration.test.js
node --test --experimental-test-isolation=none src/services/productService.test.js src/services/registrationService.test.js
npm run lint
npm run build
```

References: [Supabase signUp](https://supabase.com/docs/reference/javascript/auth-signup),
[email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).
