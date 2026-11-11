# Google account login

## Implemented flow

Login and Signup use the same Continue with Google component. Login passes its
existing Remember Me checkbox; Signup has a separate checkbox for Google sessions.
Email/password signup, OTP confirmation and password recovery remain available.

1. The browser bootstraps signed CSRF, then POSTs `{remember: boolean}` to
   `/api/auth/google`. Exact Origin, CSRF, Fetch-Site and existing login rate limits
   apply. Client IDs, roles, verified flags and return URLs are rejected as input.
2. Express creates an independent Supabase SDK client with `flowType: 'pkce'` and
   an isolated server-memory storage adapter. The SDK generates the verifier and
   S256 challenge. A random application state and a different random HttpOnly
   browser-binding cookie identify one current attempt. Attempts expire in ten
   minutes, are capped at 1,000, and expired entries are pruned every minute.
3. The browser navigates to the SDK's Google authorization URL on the configured
   Supabase origin. Supabase manages Google OAuth state and Google's callback.
   The verifier never leaves Express except for its server-to-server code exchange.
4. Supabase redirects to `${APP_ORIGIN}/api/auth/google/callback/<state>?code=...`.
   Express validates state and browser binding, consumes the attempt before any
   exchange and calls `exchangeCodeForSession`. The optional flowId returned by
   the installed SDK is retained and supplied to the exchange on the server.
5. Express calls `getUser(access_token)` and requires a confirmed Supabase email,
   matching subject and a Google identity. It reads the profile by that subject,
   then uses the same session establishment function as password login. Success
   creates fresh session/CSRF cookies and redirects to `/account` or `/admin` using
   only the database role. The SPA restores identity with the existing `/api/me`.

Only an authorization code, public PKCE challenge, and opaque state are in OAuth
URLs. Access, refresh and Google provider tokens never reach frontend JavaScript,
JSON responses, localStorage or redirect URLs. The temporary SDK store and the
backend session record hold credentials in process memory. OAuth clients are
discarded when the attempt finishes, expires or is cancelled. No Google API tokens
are retained separately for API access.

Auth cookies remain host-only, HttpOnly, SameSite=Strict with existing paths and
production Secure prefixes. Only `avg_google` (production `__Host-avg_google`) is
SameSite=Lax so the top-level cross-site callback can bind to its initiating
browser. It has a ten-minute Max-Age. Its value has no authority after the record
is consumed. Delayed callbacks do not clear that cookie, which could erase a newer
attempt. New initiation, password login and logout cancel the current attempt;
explicit `/api/auth/google/cancel` is also CSRF/Origin protected. Browser Back from
a cached consent page resets the loading state and requests cancellation; a fresh
document permits retry, and a new attempt replaces any abandoned old attempt.

The initiating app session ID is captured on the server because its Strict cookie
is absent on a cross-site callback. Successful login replaces that record with a
fresh ID, preventing fixation. Logout/cancellation, transaction expiry and account
revocation cannot be undone by an in-flight callback. Account revocation also
conservatively invalidates unresolved provider attempts whose subject is not yet
known. Failed post-exchange verification attempts best-effort local provider
sign-out; no app session is granted when cleanup/provider service is unavailable.

Denial, no-code cancellation, malformed/expired/repeated callbacks and provider
failures return fixed error codes to `/login`. The UI renders accessible messages,
does not render provider descriptions, and permits retry. Callback redirects have
an explicit empty fragment, no-store and Referrer-Policy=no-referrer so a provider
error fragment is not inherited by the login/account page. Configure external
proxy/access logs to redact callback query strings; they contain one-time codes.

Remember Me and idle policy are unchanged: browser-session cookies unchecked;
persistent cookies checked; idle expiry after 20 minutes without accepted genuine
input for both. Only real input reports renew idle time. Existing absolute limits
remain 12 hours unchecked / 30 days checked. Provider expiry, refresh rotation,
revocation, CSRF/Origin checks and logout rules still apply.

## Profiles and existing accounts

`server/db/schema.sql` already defines `on_auth_user_created` on `auth.users` and
`public.handle_new_user()`, inserting a profile with only `id` and display `name`.
The role column defaults to `customer`. Google signup uses this existing trigger;
there is no app-side profile upsert, email search, account merge, or role assignment
from provider/browser metadata. A missing/unusable profile fails closed. No new
migration is required if the existing schema/trigger is deployed. Do not rerun the
whole schema against an existing database just to enable Google login.

Supabase alone decides whether a Google identity can automatically link to an
existing account under its verified-email identity-linking rules. AVENGEMS uses
only the subject returned and independently verified by Supabase. Unverified email
metadata cannot select another profile. Existing trusted database admins may sign
in with their eligible Google identity; Google never creates/promotes an admin.
Automatic linking is not a manual AVENGEMS "link accounts" feature.

See the official [Google provider guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow), and
[identity linking rules](https://supabase.com/docs/guides/auth/auth-identity-linking).

## Manual configuration required

No dashboard configuration, project credentials or live records were inspected or
changed. The real project reference and production domain have not been supplied.
Values containing `<...>` below are templates, not existing deployment URLs.

1. In Google Cloud, configure the OAuth consent screen/audience and test users
   when the app is in Testing. Create a **Web application** OAuth Client ID.
   Request only the identity scopes used here: openid, email, profile.
2. Copy the **exact callback URI shown by Supabase's Google provider settings** to
   Google's Authorized redirect URIs. For a standard hosted Supabase project it
   is `https://<actual-project-ref>.supabase.co/auth/v1/callback`, derived from the
   real server `SUPABASE_URL`. A custom Auth domain uses its displayed callback.
   This is Google's redirect destination even when AVENGEMS runs locally. Do not
   put localhost:5173, localhost:3001 or the AVENGEMS callback in this Google field.
   A Google Authorized JavaScript Origin is not used by this server redirect flow;
   if configuring other Google browser integrations separately, use their own
   required origins. No Google SDK/client ID is embedded in the AVENGEMS frontend.
3. In Supabase Auth > Providers > Google, enable Google and enter that Client ID
   and Client Secret. Keep provider verification/security defaults enabled. The
   Google client secret belongs in this dashboard, never `VITE_*`, source control
   or browser JavaScript. Express uses its existing publishable Auth key, not a
   service-role/secret client for user authentication.
4. In Supabase Auth > URL Configuration, retain existing email confirmation and
   recovery URLs. For local development set the appropriate test project's Site
   URL to `http://localhost:5173` and add the scoped Redirect URL allowlist entry:

   `http://localhost:5173/api/auth/google/callback/*`

   The callback's exact route is
   `http://localhost:5173/api/auth/google/callback/<43-character-random-state>`.
   Only the last single path segment varies. The `*` allowlist pattern is required
   for this per-attempt state, not a blanket `/**` app allowlist. The SDK adds the
   one-time `code` query after provider authentication; do not hand-build a code.
5. Locally use server `APP_ORIGIN=http://localhost:5173` with no trailing slash,
   the existing `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`, and port 3001. Vite's
   existing `/api` proxy sends initiation and callback to Express. Open the app at
   localhost:5173, not 127.0.0.1 or the Express port. If Vite falls back to another
   port, stop it and free 5173 or deliberately update APP_ORIGIN and the allowlist
   together; mixing origins is rejected.
6. For future deployment, supply the actual HTTPS origin as APP_ORIGIN, set
   NODE_ENV=production, and add only
   `https://<actual-app-host>/api/auth/google/callback/*` to the Supabase allowlist.
   Configure hosting to proxy **all `/api` routes, including GET callback paths,
   to the same stable Express process** before SPA fallback. Keep callbacks and
   frontend on the same public origin. Do not derive return URLs from Host or
   X-Forwarded-Host. The production domain is a remaining configuration input.

## Local browser checks after authorized test-project setup

These steps perform real account signup/login. Use only a designated test project
and authorized test accounts; automated tests below use fabricated provider data.

1. Run `npm --prefix server start` and `npm run dev` in separate terminals. Visit
   `http://localhost:5173/login` in a regular browser profile. Keep Express running;
   avoid source-watch restarts. Open DevTools with Preserve log **off**. Inspect
   statuses, routes, cookie attributes and timing only; do not copy token values.
2. On `/signup`, click Continue with Google using a test Google identity not yet
   registered in this test project. Complete consent. Expect `/account`, a verified
   customer identity from `/api/me`, and one profile created by the existing trigger.
   The name is display data, not authorization. No frontend password is required.
3. Log out, then use Continue with Google on `/login` with the same identity. Expect
   the same user/profile ID. For an existing **verified** email/password test
   account eligible under Supabase's linking rules, repeat Google login and verify
   Supabase returns that account's identity/profile without duplicate app-side
   creation. Test unverified-email scenarios only on designated test accounts;
   follow Supabase's resulting verification rules, never merge/promote records by
   hand. Live automatic-linking behavior remains a dashboard/provider integration
   check, not something the mocked tests can certify.
4. As a customer, visit `/admin` and request an admin API: access must be denied.
   If an existing authorized database admin has an eligible Google identity, its
   role remains database-derived. Do not create or promote an admin for this test.
5. Repeat Google login with Remember Me checked/unchecked. Inspect all four auth
   cookies: checked has Max-Age/Expires; unchecked shows Session. Both refresh on
   page reload. Fully quit/reopen the same browser within two minutes while Express
   stays up: checked may restore; unchecked should lose session cookies when the
   browser's session-restoration feature is disabled. Browser restore/clear-on-exit
   policies can respectively retain session cookies or discard persistent ones.
6. Leave **every app tab** without mouse/keyboard/touch input for 20 minutes; both
   modes must deny access. Reload/focus/polling must not move idleExpiresAt. In a
   new session interact at minute 19, allow up to 15 seconds for batching and
   confirm only idleExpiresAt advances, with absoluteExpiresAt unchanged. The
   original minute-20 deadline should no longer end that active session.
7. Deny consent and separately use browser Back from the Google page. Expect a
   usable login/signup page and retry. Start another attempt and wait more than
   ten minutes before completing it; expect an expired/invalid callback and no
   session. An authorization code may expire sooner under Supabase's own rules.
   In DevTools, opening the same callback again must fail without a new exchange;
   use only your own test callback and never share its URL. Unknown state and a
   callback in another profile with no binding cookie must also fail closed.
8. Before idle expiry, delete only the test site's **access** cookie and reload:
   protected refresh should recover using the existing refresh/session cookies.
   Repeat in two tabs together: refresh coordination should converge. Brief Offline
   mode should show a verification error, then recover after reconnect if still
   valid. Offline at expiry locks locally; reconnecting after expiry remains denied.
9. Log out, then reload and reopen: neither mode restores authentication. Start a
   Google attempt and cancel/log out in another tab while callback work is pending:
   it must not grant a new session after cancellation. No production revocation is
   needed; automated cases cover revoked refresh tokens and callback races.
10. As a separate local limitation check, restart Express during consent, then
    complete Google login: it must fail and require a new attempt. Restart after
    successful login also loses app sessions. All transactions/session records and
    CSRF signing state are process-local. Multiple independent workers/serverless
    deployments require a separate shared secure store/coordination design.

## Automated validation and limits

`server/test/googleOAuth.test.js` uses real Express HTTP and the installed Supabase
SDK with a mocked provider fetch. It checks the actual S256 verifier/challenge,
new/existing/linked subject handling, role trust, both Remember Me settings, Secure
cookies, idle/absolute timing, refresh/logout/revocation, browser-cookie restart
simulation, server restart, expiry, state/binding/substitution/replay rejection,
CSRF/Origin, input/open-redirect protections, missing configuration, fixation and
in-flight cancellation/revocation. A schema assertion checks the existing customer
default/profile trigger. It does not claim to execute Google's consent screen,
Supabase's account-linking algorithm or a real database trigger.

Frontend tests cover CSRF transport, preference forwarding, no browser credential
storage, unsafe-navigation rejection, non-replayed network failures, shared button
presence and sanitized accessible callback errors. Existing auth/session/OTP/
recovery tests cover unchanged behavior. Full regression commands:

```
node --test server/test/*.test.js src/services/*.test.js
npm run lint
npm run build
git diff --check
```

Final local results: **157 backend tests passed, 108 frontend tests passed**;
lint, production build and `git diff --check` passed. Test requests never contact
live Google/Supabase services.

OAuth implementation files: `server/src/googleOAuth.js`, `server/src/auth.js`,
`server/src/sessions.js`, `server/src/routes/auth.js`, `server/src/index.js`,
`src/components/auth/GoogleLoginButton.jsx`, `src/pages/auth/Login.jsx`,
`src/pages/auth/SignUp.jsx`, `src/services/sessionService.js`,
`server/test/googleOAuth.test.js`, `src/services/authSession.test.js`,
`server/.env.example`, `README.md`, and this guide. Earlier Remember Me changes in
`server/test/sessions.test.js` and `docs/remember-me.md` were preserved.

Remaining external prerequisites are Google consent/client setup, Supabase provider
credentials/redirect allowlist, deployed existing profile trigger, and actual HTTPS
hosting/origin values for deployment. No live integration was run and no external
settings or production records were changed by this implementation.
