# Remember Me investigation and browser verification

## Findings on backend-mariel

The inspected implementation already carries the boolean from Login.jsx through
AuthContext/authSession/authService/sessionService to POST /api/auth/login as
`remember`. The backend validates its type and stores it on the process-local
session record. No missing preference, persistence downgrade, or browser-restore
failure was reproduced. The new lifecycle tests pass against the existing runtime
implementation; this change adds regression coverage, not a claimed runtime fix.
The cause of the reported live failure remains unconfirmed without its browser
request/cookie attributes and backend process history.

Checked sessions use persistent access, refresh, session-ID and CSRF cookies.
Refresh, session-ID and CSRF persistence is bounded by the original absolute
deadline; access persistence is additionally bounded by provider access expiry.
Unchecked sessions use cookies without Max-Age or Expires. CSRF bootstrap and
rotation preserve this distinction, including after a previous remembered login.
Cookies remain HttpOnly, SameSite=Strict and host-only, with scoped paths. Production
uses Secure and the existing __Secure-/__Host- prefixes; local HTTP development
uses unprefixed cookies without Secure. No credentials are stored in localStorage.

Both modes expire after 20 minutes without accepted genuine input. Remember Me
permits restoration within that interval; it does not permit returning the next
day after inactivity. Genuine input renews idle time, bounded by the unchanged
absolute limit: 12 hours unchecked, 30 days checked. Focus, visibility, polling,
page reload, CSRF bootstrap and token refresh never renew server idle time.
Provider revocation/expiry can end access earlier. Explicit logout closes the app
record before provider revocation and prevents replay/restoration.

## Limits that remain visible

Session records, refresh coordination and CSRF signing state are in memory in one
Express process. Restarting that process (including source-watch reloads), routing
to another independent worker or deploying a replacement loses the session even
when cookies survive. Remember Me cannot overcome a missing server record. Durable
multi-instance support requires a separate shared-store/signing/coordination design;
this investigation does not put tokens into files or relax authorization checks.

Browsers may restore session cookies with their session/tab restoration feature.
Unchecked means browser-session cookies, not a guarantee that every browser deletes
them on every application exit. There is no reliable browser-close signal that
also distinguishes refresh/crash and preserves the requested behavior. Test with
session restoration disabled. Private browsing, clear-on-exit settings and cookie
policies may also discard persistent cookies earlier.

Automated browser restart is a cookie-jar simulation, not an actual browser or
Supabase integration run. It models Max-Age expiry and removal of session cookies;
existing HTTP tests separately inspect cookie security attributes. No live accounts,
Supabase production records, credentials or provider settings were changed.

## Regression coverage

- server/test/sessions.test.js now models cookie expiry and browser restart. New
  cases cover ON/OFF for both roles, reload before restart, expired access renewal,
  CSRF persistence, unchanged idle/absolute deadlines, remembered-to-unchecked
  replacement, activity renewal and logout/replay after browser restart.
- src/services/authSession.test.js now checks both booleans through the real
  frontend service and a new memory-only state store restoring server identity.
- Existing regressions cover trusted input versus focus/timers, 20-minute expiry,
  temporary transport/provider/profile failures, revocation, concurrent refresh,
  stale-cookie races, role/verification checks and CSRF/Origin rejection.

Commands: `node --test server/test/*.test.js src/services/*.test.js` (251 passed:
146 backend, 105 frontend), `npm run lint`, `npm run build`, and `git diff --check`
all passed. Tests use fabricated provider responses and controlled clocks.

## Exact manual browser checks

Use existing authorized test accounts, one verified customer and one administrator.
Do not edit production accounts or provider/token settings. Repeat steps 2–8 for
each role and Remember Me setting. Keep a single stable backend process running.

1. Locally, run `npm --prefix server start` and `npm run dev` in separate terminals
   with the existing authorized configuration. Open http://localhost:5173. For an
   existing HTTPS test deployment, use its configured exact APP_ORIGIN instead.
   Disable browser "continue where you left off"/session restoration, clear-on-exit
   and extensions that alter cookies. Use a regular browser profile. Clear only
   this test site's cookies before each independent case.
2. Log in with the chosen checkbox value. In DevTools Network, confirm the login
   request contains the matching boolean `remember`. Inspect cookie ATTRIBUTES
   only: checked cookies have expiry/Max-Age; unchecked cookies show Session and
   no Max-Age/Expires. Check HttpOnly, SameSite=Strict, paths and production Secure
   prefixes. Never copy passwords, CSRF tokens or cookie/token values into reports.
3. Record only `idleExpiresAt` and `absoluteExpiresAt` from the login response.
   Reload immediately: the account should restore for both settings. /api/me may
   return 401 for expired access, followed by CSRF, refresh and a successful /api/me.
   With no genuine input, neither recorded deadline should increase. Browser input
   directed at the app is real activity, so perform observation in DevTools.
4. Fully quit the browser, including background processes, then reopen the same
   profile/site within two minutes. Checked should restore; unchecked should ask
   for login. Keep Express running. Merely closing a tab is not this test. If
   unchecked restores, first confirm the browser did not restore session cookies.
5. Start a new login and leave all app tabs without mouse/keyboard/touch input for
   at least 20 minutes. Refreshes/focus/background checks must not extend the
   server deadline. Both settings must deny private access at expiry. A suspended
   tab updates its UI when execution resumes; the server denies access independently.
   Closing and reopening after 20 minutes must also require login when checked.
6. Log in again; at minute 19, type/click inside the app. Allow up to 15 seconds for
   activity batching. Confirm a protected /api/auth/activity request advances
   idleExpiresAt while absoluteExpiresAt stays fixed. The session should work after
   the original minute-20 deadline, then expire 20 minutes after the last accepted
   genuine input if no further input occurs. Refresh/focus alone must not do this.
7. Before idle expiry, select DevTools Offline, trigger a session check, then go
   Online. Verification errors should withhold private content; a successful retry
   restores the still-valid session. At expiry while offline, expect a local lock
   with expiration-unconfirmed messaging. Reconnect after expiry: access is denied.
   To exercise concurrent refresh without changing TTL, remove ONLY the access
   cookie using DevTools on a test account and reload two tabs together. Both should
   recover through protected refresh and fresh /api/me; server rotation is shared.
8. Log out explicitly, then reload and fully quit/reopen. Both settings must remain
   anonymous. Confirm all four auth cookies are cleared. Revocation/replay is covered
   with fabricated tokens in automated tests; do not revoke production accounts
   merely to exercise this test.
9. As a separate local limitation check, log in checked and restart Express before
   20 minutes. Reopening must require login despite persistent cookies. This is
   expected with the documented process-local store, not evidence of checkbox loss.

If checked fails in step 4, record endpoint/status order, cookie attributes before
and after restart, elapsed time, browser restore/clear-on-exit settings, and whether
Express restarted or multiple workers handled requests. These observations identify
the failure layer without disclosing authentication secrets.
