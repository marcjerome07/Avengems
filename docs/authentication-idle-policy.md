# Session recovery and 20-minute inactivity policy

## Confirmed bugs and diagnosis boundary

Two new regressions failed BEFORE runtime changes:

1. `/api/me` 401 followed by `/api/auth/csrf` 401 was treated as anonymous, although
   refresh had never run. CSRF bootstrap failure is now temporary Auth unavailability;
   actual refresh/me rejection is required to establish anonymous state.
2. A delayed expired-access `/api/me` response cleared a NEW cookie written by a
   concurrent successful refresh. Access clearing now checks the request's cookie
   against the CURRENT server token and cannot delete its replacement.

The previous temporary-error recovery fix is retained: network/provider/profile
errors and HTTP 503 preserve the last verified identity and retry eligibility,
while guards hide private content pending fresh verification. Login also no longer
bounces that retained error state straight back into a blocked private guard.

These are reproduced application bugs, not a diagnosis of an unseen live request.
No real tokens, shared Supabase logs or provider settings were accessed. An additional
known immediate-signout cause remains: records and CSRF signing state are process-
local. A restart/watch reload or independent workers lose the relevant record.
Increasing JWT duration cannot repair that architecture. Use one stable Express
process; persistence/multi-instance support needs separate shared-store work.

## Authoritative server behavior

Both customer/admin app sessions expire after **20 minutes without accepted user
activity**, or the existing absolute deadline, whichever comes first: 12 hours
without Remember me, at most 30 days with it. Provider revocation can deny access
earlier. Refresh does not slide either deadline or change Supabase token lifetimes.

The bounded in-memory record holds idleDeadline and a non-secret public timing key,
distinct from its HttpOnly session ID. Login starts the clock. Every production
`/api/me` and `/api/admin` request requires a live app record before normal provider,
verified-email, role and ownership checks. Explicit Bearer tokens must also match
the active app record; stripping cookies cannot bypass expiry with an otherwise
valid provider JWT. Direct clients must use app login/cookies/CSRF. Public catalog
and guest quotes remain available.

Activity captures server receipt time, verifies token/current profile, checks the
deadline AGAIN after I/O, and synchronously updates the maximum valid candidate,
capped by the absolute deadline. Older concurrent reports cannot shorten newer
ones. An expired session cannot be revived by pending refresh/activity. Session
metadata exposes only public key, server time and idle/absolute deadlines, never
tokens/passwords/cookie IDs. HttpOnly/Secure/SameSite, CSRF/Origin, recovery-token
rejection and server-side role validation remain enforced.

## Activity, synchronization and failure handling

- `POST /api/auth/activity`: signed CSRF/exact Origin, live session, verified token
  and confirmed customer/admin role. Body `{}` or `{elapsedMs: integer 0..30000}`.
  A bounded past age accounts for coalesced input and can only REDUCE the candidate;
  future timestamps/deadlines are rejected. It is the ONLY idle renewal operation.
- `POST /api/auth/idle`: protected status-only check. It does not renew activity or
  invoke general logout. Expiry closes/rejects the record with SESSION_IDLE_EXPIRED.
- Polling, `/api/me`, refresh, network responses, focus and visibility do not renew.

The browser listens only to trusted pointer down/move, keyboard, wheel and touch
start/move events on visible pages. Rapid input is coalesced to one report per 15
seconds plus a trailing report for real pending input. Age is recomputed after
CSRF/refresh delay; reports older than 30 seconds are discarded. A response/timer
cannot invent newer activity. Expired access is securely refreshed once when an
actual activity operation needs it.

Tabs share one server record/deadline. Optional `avg_session_idle_v1` storage holds
timing only, no identity or credentials. Reloads preserve a matching confirmed
deadline; identical polling metadata never rebases it. A longer storage hint is
checked with the server before adoption; a different key triggers fresh identity
verification. Cache forgery cannot authenticate or extend server access. Storage
failure falls back to server checks.

At a local deadline, status is checked with the server so another tab's genuine
activity can correct stale timing. Actual expiry clears frontend identity and
redirects to `/login`, including public pages. A suspended tab redirects when its
execution resumes; the server already rejects expired requests independently.
An old tab's timer never calls general logout and therefore cannot revoke another
active tab just because its cached deadline was stale.

If unreachable at the known deadline, the UI locks/redirects with an explicit
expiration-unconfirmed notice. It does NOT claim a logout reached the server or
that Supabase sessions were revoked. Backend expiry independently prevents later
access. Brief failures before expiry preserve recovery. A device offline for the
whole interval cannot securely renew from cached activity. Explicit logout keeps
its existing failure/retry semantics and waits for in-flight activity/rotation;
uncertain requests never produce a false revocation claim.

## Validation and deployment

Backend tests use real Express requests with fake provider/profile responses and
an injected clock. Frontend tests use deterministic fake timers/events/shared
storage. Coverage includes 19/20 minutes, input, reload/tabs, polling/refresh,
temporary failures, forged cache, both roles, Origin/CSRF, concurrent activity,
pending-refresh expiry, stale-cookie races, ages and absolute limits. No shared
Supabase records/settings or SQL were changed.

Executed for this change: `node --test server/test/*.test.js` (143 passed),
`node --test src/services/*.test.js` (104 passed), `npm run lint`,
`npm run build`, and `git diff --check` (all successful). These are local mocked
provider/browser tests, not a live Supabase or browser integration certification.

No migration is needed. Deploy frontend/backend together with existing HTTPS/origin
and secrets, using one stable Express process. Its restart signs current sessions
out once. For a local demonstration, `npm --prefix server start` avoids the source-
edit restarts intentionally caused by `npm --prefix server run dev`. Independent
workers/serverless need a separately reviewed durable/shared store and shared
coordination/signing design. Refresh tokens were not moved into browser storage
or a plaintext file.

Manual checks: with authorized disposable accounts, verify 19 minutes remains
authenticated and 20 redirects; interact at minute 19 and inspect the extended
deadline; reload/open/switch tabs without activity and ensure no reset; interact
in one tab and verify both; test brief Offline/503 recovery and offline-at-expiry's
honest notice. Record endpoint/status/cookie ATTRIBUTES only, never token values.
Actual Supabase/browser execution was not performed by the automated tests.

Modified files in this task: `server/src/{sessions,index}.js`,
`server/src/middleware/auth.js`, `server/src/routes/{auth,me}.js`,
`src/services/{authSession,sessionService,sessionIdle}.js`,
`src/context/AuthContext.jsx`, `src/App.jsx`,
`src/components/routing/IdleSessionRedirect.jsx`, `src/pages/auth/Login.jsx`,
`server/test/sessions.test.js`, `src/services/{authSession,sessionIdle}.test.js`,
and related authentication docs/README. Existing unrelated work remains preserved.
