# Frontend authentication: backend cookie sessions

Current behavior includes the [20-minute server-enforced inactivity policy](authentication-idle-policy.md).
Only genuine input renews idle time; reload, polling, refresh and focus do not.

The login form and all four logout controls now use the real Express Auth API.
The existing UI, remember preference, return-to-page navigation and server-role
admin/customer destinations are retained. Demo credentials have been removed from
the login screen. Registration, products, backend endpoints, database and Supabase
settings are unchanged by this phase.

## Session contract

`sessionService` uses relative `/api` URLs, `credentials: 'include'`, and no-store
requests. Auth POSTs first bootstrap `/api/auth/csrf`, then send its in-memory
anti-CSRF value in `X-CSRF-Token`. Browser Origin is supplied automatically. An
explicit CSRF rejection can retry once; credentials and refresh operations are
never blindly retried after a network/provider failure. No Auth access/refresh
tokens are read, stored or returned to the context.

- Login calls `POST /api/auth/login` with `{ email, password, remember }`. Only the
  sanitized, confirmed user returned by the backend is accepted. Unknown roles or
  malformed user objects are rejected. Unconfirmed responses are denied and a
  backend logout is attempted to clean up the cookie session.
- On application startup, `/api/me` determines identity. A 401 triggers one shared
  CSRF-protected `POST /api/auth/refresh`, followed by another `/api/me`. An expired
  refresh/session returning 401 means anonymous. Profile/service/network failures
  fail closed with a retryable session error, not protected content.
- Restore requests are deduplicated across concurrent callers/StrictMode. Visible
  authenticated tabs revalidate every minute and on focus, visibility changes and
  reconnection. Other tabs observe cookie login/logout changes on their next check.
- `AuthContext` starts with no user and an initialization flag. Both route guards
  and the login page wait before redirecting. Customer routes accept confirmed
  server identities; admin routes additionally require the server profile's admin
  role. Browser storage and Auth metadata roles are never authorization sources.
- Identity is held only in memory. Old localStorage/sessionStorage prototype user
  and session entries are ignored. The compatibility `setUser` callback used by the
  old profile form can only request `/api/me` revalidation; it cannot set identity
  or roles from a supplied object.
- Logout immediately hides private content, waits for earlier login/restoration
  responses, then calls the CSRF-protected logout endpoint. This prevents stale
  responses from restoring the UI or setting cookies after logout is sent. A 401
  from the logout operation is already signed out. Other failures are reported,
  with no false success toast or authenticated UI. Automatic restoration is blocked
  after a failed logout until explicit login, successful retry, or a page reload.

If a network failure prevented logout from reaching Express, its cookies may still
be valid; reloading can restore that server session. Reconnect and use Retry sign
out rather than treating a failed request as server revocation. Provider-revocation
failures can likewise return 503 after Express has already closed its local session.

Route guards remain UI controls, not security boundaries. All real private APIs
must verify server-side identity and ownership; future admin APIs must additionally
check the current database role. No `/api/admin` endpoints currently exist; the
admin data/write services remain their existing mocks. No new privileged API is
introduced here. Token/cookie/session storage and single-process limitations from
`auth-phase-2.md` still apply, including signout after a server restart.

## Modules still outside scope

[Password recovery](password-recovery.md) now uses Supabase email OTPs. Google OAuth,
profile/address editing and order persistence have not been integrated.
Real Supabase UUIDs have no corresponding prototype user rows;
prototype account editing can show Account not found and demo order history can be
empty. These behaviors do not change or bypass authenticated identity. Cart and
wishlist remain browser-based. Registration retains its existing provider flow.

## Test with the existing confirmed customer account

No test below needs the account email or password in source files, this chat, shell
history, logs or screenshots. Automated tests use fabricated responses.

1. Verify server environment names `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, and `APP_ORIGIN`. Development defaults to origin
   `http://localhost:5173`. Production requires `NODE_ENV=production`, HTTPS and the
   exact frontend `APP_ORIGIN`. No frontend Supabase key or new dependency is needed.
2. From `server`, run `npm start`. In another terminal at the repository root run
   `npm run dev`. Open `http://localhost:5173/login`, matching the configured hostname
   and port exactly. The Vite proxy forwards `/api` to backend port 3001. If 5173 is
   occupied, stop the conflicting local server or deliberately align APP_ORIGIN
   with the actual port; don't silently use a mismatched Vite port.
3. Enter the existing, email-confirmed Supabase customer's credentials in the form.
   Leave Remember me selected to test persistent cookies. Expect `/account`, or the
   originally requested protected page. Confirm the account name/email are correct.
4. Reload `/account`, then open `/account/orders` directly. The session check should
   complete without a premature login redirect or protected-content flash.
5. Open `/admin` as the customer. Expect access denied and return home; do not change
   roles to test this. Stored prototype admin users must have no effect.
6. To test refresh without waiting for JWT expiry, delete **only the access cookie
   by name** in DevTools Application/Cookies (`avg_access`, or production
   `__Secure-avg_access`). Keep refresh/session/CSRF cookies. Don't copy or expose
   their values. Reload `/account`: the frontend should refresh once and restore.
7. Log out through desktop, mobile, account or admin controls as applicable. Expect
   a success notice only after backend confirmation. Open `/account` directly again;
   expect login. An incorrect password should show a safe error and grant no access.
   Avoid repeated attempts beyond the backend's ten-per-IP/15-minute login limit.
8. For failure handling, go offline using DevTools and attempt logout. Private content
   should disappear and the request should report failure, not success. Reconnect
   and retry sign out using the session-error screen or login-page control. Network
   errors during startup should show a retry option instead of granting access.

Production assumes the frontend and `/api` share an origin (or an equivalent proxy).
No new credentialed CORS policy was added. The implementation does not create/delete
accounts, change project settings or migrate data. Real-account browser testing is
left to the developer; no account credentials were requested or used by automation.

## Automated checks

Run from the repository root. The React guard tests render the actual components
server-side with injected session state; the service tests mock only HTTP responses
and exercise initialization, login, refresh, logout, races and forged-storage denial.

```powershell
node --test --experimental-test-isolation=none server/test/me.test.js server/test/products.test.js server/test/sessions.test.js server/test/registration.test.js
node --test --experimental-test-isolation=none src/services/authSession.test.js src/services/productService.test.js src/services/registrationService.test.js
npm run lint
npm run build
```

On restricted Windows sandboxes, Vite's React dependency resolver and build helper
may require the tool's normal process-execution approval. These tests need no live
Supabase credentials, browser session, packages, users or database changes.
