# Xendit Test Mode payments: implementation and deployment runbook

Next stage: [isolated Supabase staging handoff](xendit-supabase-staging.md) provides
the exact flags-OFF setup, read-only execution instructions, compatibility review,
hosted-integration gaps and approval-gated browser/webhook checklist. Preparing that
handoff does not authorize installation, dashboard changes or payment enablement.

## Status and scope

Implementation is prepared locally on backend-mariel. **Not deployed or enabled.**
No Xendit payment API was contacted, no shared Supabase connection was used, no
shared migration/data/grant/Auth settings were changed, and no live payment is
supported. Existing Google/login/Remember Me work was retained. The new migration
was executed only in a new disposable loopback PostgreSQL 16 cluster with fictional
fixtures. Dashboard configuration, real PostgREST integration and hosted sandbox
checkout still require separately approved manual testing.

Online payment options are disabled unless BOTH environment approval flags, a
complete test-key configuration, an HTTPS APP_ORIGIN, enabled channels and the
database readiness gate agree. COD works without the new migration/provider setup.
Old demo online checkout cannot bypass these gates. No API call is made at startup.

## Official contracts verified on 2026-11-08

Use the current **Payment Sessions** API, not legacy invoices:

- [Create](https://docs.xendit.co/apidocs/create-session): Basic Auth with the secret
  key as username and an empty password; `POST https://api.xendit.co/sessions`.
  The implementation chooses PAY, PAYMENT_LINK, AUTOMATIC capture, PHP and PH.
  It sends trusted reference/amount/customer data, one allowed channel, a 30-minute
  expires_at and server-selected HTTPS return URLs. The response's payment_link_url
  is validated; no hosted URL is constructed.
- [Get session](https://docs.xendit.co/apidocs/get-session): GET `/sessions/{id}`.
  [Cancel](https://docs.xendit.co/apidocs/cancel-session): POST `/sessions/{id}/cancel`.
  Sessions have ACTIVE, COMPLETED, EXPIRED and CANCELED states. A failed attempt can
  retry within an ACTIVE session; there is no invented `payment_session.failed`.
- [Payment request](https://docs.xendit.co/apidocs/get-payment-request): GET
  `/v3/payment_requests/{id}`, `api-version: 2024-11-11`. A session's completion alone
  is insufficient: verify its linked automatic payment request is SUCCEEDED, with
  matching business/customer/channel/amount/country/currency before marking paid.
- [Session webhooks](https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session):
  subscribe to payment_session.completed and payment_session.expired. Validate the
  environment-specific x-callback-token using the documented
  [webhook handling](https://docs.xendit.co/docs/handling-webhooks) guidance. The
  webhook JSON is a notification: authenticated provider GETs verify current state.
  No browser CSRF is required on this provider-authenticated route.
- [Channels](https://docs.xendit.co/docs/available-payment-methods): GCASH, PAYMAYA
  and CARDS map to the existing app methods. Actual account/country/amount limits
  and Test Mode activation must be confirmed in the dashboard before enabling each.
- [Refund list](https://docs.xendit.co/apidocs/list-refunds-for-a-payment): GET
  `/v3/refunds?payment_id=...`, `api-version: 2024-11-11`. Only verified v3 refund
  objects are reconciled; legacy refund IDs are outside this implementation.

The consulted Sessions create reference documents **no idempotency header** or
reference-based lookup endpoint. None is invented. This is not an assertion that
Xendit never offers another contract: obtain a written product-specific guarantee
before changing retry policy. Sessions requests send no guessed api-version header;
the documented v3 read APIs use 2024-11-11. Test/live credentials share the API host;
this code rejects live mode and keys without the development prefix. Prefix checks
are an additional local guard, not a substitute for dashboard Test Mode verification.

## Architecture, inventory and state machine

The existing checkout RPC still calculates current product/customization/shipping
prices, locks products, creates the order/items and decrements inventory atomically.
New AFTER INSERT logic creates one separate order_payments row for each new online
order in that SAME transaction. Its amount, owner and method come from the inserted
order; a disabled DB gate rolls the entire checkout back. COD creates no payment row.
No historical online/demo order is backfilled, charged, marked paid or renamed.

Order fulfillment remains Pending/Processing/Shipped/Delivered/Cancelled. Payment
has independent states:

| Payment state | Meaning / inventory policy |
| --- | --- |
| created | Order reserved; no provider creation was claimed. May cancel locally; release after 30 minutes if never claimed. |
| creating | Durable claim committed BEFORE provider POST. Concurrent initiation cannot claim again. |
| unknown | Timeout, API error or uncertain persistence. Never resend create; retain reservation and locate the original session. |
| pending | Verified ACTIVE session or completion awaiting successful request confirmation. Retry using the same saved hosted link. |
| paid | Verified COMPLETED session and SUCCEEDED request. Inventory remains deducted; fulfillment can proceed. |
| expired / cancelled | Provider confirms closed session with no request, or a terminal FAILED/CANCELED latest request. Atomically cancel order and release stock once. |
| failed | Reserved local terminal enum; currently failed attempts in ACTIVE sessions remain pending with lastAttemptStatus=FAILED. No unsupported provider session status is inferred. |
| review | Unsettled request on closed session, late success after release, partial refund or conflicting successful request. Block fulfillment. Re-read may resolve ordinary in-flight state; financial/inventory incidents remain held. |
| refunded | Verified successful full v3 refund total. Block further fulfillment. Never restore inventory automatically. |

The 30-minute stock reservation is separate from the 20-minute authentication idle
limit. At a deadline, only an **unclaimed** creation can expire from the clock alone.
A claimed/unknown/active session must be reconciled with Xendit. Underlying attempts
that might settle keep stock reserved. Never assume closing the browser, a cancel
return URL or an expired app login closed a payment. If Xendit later confirms money
after stock was released, record paid_at and an auditable incident, retain Cancelled
fulfillment and released stock, and require manual resolution/refund; do not silently
re-deduct inventory or fulfill. A newer success with a different request after an
already verified success also creates review rather than overwriting its identifiers.

All coordinated transitions lock **owner profile → order → payment → order items →
products sorted by ID**. Existing admin/customer cancellation already locks the order;
the new order-update trigger rejects unsafe cancellation and rolls its earlier
restocking writes back with the transaction. No installed RPC body is replaced.
The order lock, terminal state checks and inventory_released flag prevent a separate
expiry/cancel path from double-restocking. Provider I/O is outside SQL transactions.
Database triggers enforce paid-only fulfillment even if an old UI bypasses a check.
The admin HTTP path re-verifies payment/refunds before advancing a managed paid order.

Once paid, stale pending/expiry responses cannot overwrite the paid request/payment
identifiers. Unique order/reference/session/request/payment/refund constraints and
durable semantic event keys serialize retries across process restarts. The session
webhook schema does not supply a stable delivery ID, so observation identity is a
SHA-256 of normalized verified provider state, excluding delivery timestamps. The
append-only payment_events table records transitions and rejected SQL observations;
payment_refunds records monotonic SUCCEEDED results plus per-refund audit observations.
No raw webhook bodies, card fields, secret keys or callback tokens are stored/logged.

Refunds are **reconciliation only**, using the official v3 list read API. No refund
creation/money-out endpoint is implemented. Pending/failed refunds do not remove a
known successful refund. Partial successful refunds freeze fulfillment in review;
full successful refunds mark refunded. Physical returns and restocking require a
separate approved workflow. Freeze an order operationally before initiating any
dashboard refund; external dashboard actions cannot share a SQL transaction with
AVENGEMS. Multiple-success incidents require additional operator investigation.

## API contracts

Browser payment endpoints are under the existing cookie-authenticated, verified
customer /api/me router. POSTs require the existing Origin/CSRF/JSON checks. Body
prices, customer IDs, roles, currencies and return URLs are rejected. All order IDs
below are original internal IDs, not the shortened display references.

| Endpoint | Request | Response / behavior |
| --- | --- | --- |
| GET /api/me/payments/methods | none | `{online,methods}`; defaults to COD only. |
| POST /api/me/orders | existing allowlisted checkout body + existing UUID-v4 Idempotency-Key | Existing order shape plus `payment:{status}` for managed online orders. Same key/request returns the original order, even if gateway later disabled. |
| GET /api/me/payments/:id | none | `{payment}` from owner-scoped database record; no provider call. |
| POST /api/me/payments/:id/start | `{}` | `{payment,checkoutUrl?}`; at most one provider create per order. Known pending session resumes its stored URL; uncertainty returns no new create. |
| POST /api/me/payments/:id/reconcile | `{}` | `{payment}` after provider reads or safe unstarted expiry. |
| POST /api/me/payments/:id/cancel | `{}` | `{payment}`; close provider session first, then reconcile. Paid orders require refund review. |
| POST /api/admin/orders/:id/payment/reconcile | `{}` or `{sessionId}` | Verified admin only. Optional test session ID can recover a lost create response; provider reference/business/amount must still match this order. |
| POST /api/admin/orders/:id/payment/cancel | `{}` | Verified admin close/reconcile; never paid-order refund/restock. |
| POST /api/webhooks/xendit | documented session notification + x-callback-token | 200 after verified durable observation/duplicate, 200 ignored unsupported event, 401 bad token, 422 identity/amount mismatch, 503 transient provider/DB failure for retry. |

Public payment fields: status, currency, amount, refundedAmount, expiresAt, paidAt,
lastAttemptStatus, requiresReview. No claim token, provider credential or raw object
is returned. Only initiation returns the provider-issued hosted URL. Server accepts
HTTPS URLs on exact configured hosts (default xen.to), without userinfo/ports. The
browser additionally rejects executable/insecure URLs. Fixed return paths are
`${APP_ORIGIN}/order-confirmation/<internal-id>?payment_return=1` and the same path
with `payment_return=cancelled`. Those query values never authorize payment.

Creation is attempted once after a durable claim. All ambiguous errors leave
creating/unknown, including crashes after send or failures saving a response. An
early authenticated webhook can attach the session through its unique reference.
Otherwise an operator locates it in the Test Mode dashboard and uses admin reconcile.
No provider POST retry or new-order retry is used as a workaround. Provider requests
time out after ten seconds, reject HTTP redirects, and only GET 429/502/503/504 may
retry once. Browser network errors are not blindly replayed by the commerce client.

Customer confirmation/details poll only the DB status every 15 seconds while visible;
returning from Xendit performs a protected reconciliation. Neither polling nor return
responses renew auth inactivity. Order lists/details and admin management distinguish
payment from fulfillment. Managed unpaid orders are excluded from revenue/spend
aggregates; legacy records keep historical treatment and display unverified payment.

## Proposed migration, preflight and deployment sequence

1. Obtain separate approval for the intended **staging** project and maintenance
   window. This task authorizes no shared-project execution. Back up schema/order
   data, note installed migration fingerprints and inventory aggregates, and freeze
   application order writes during installation. Keep both Xendit flags false.
2. Run the read-only `docs/sql/xendit-payments-preflight.sql` privately. Verify target
   identity; all four installed checkout/admin-cancel/customer-cancel/reference
   prerequisites; expected function bodies/ACLs; absence of new names; checkout
   provenance; existing trigger compatibility. Missing/conflicting objects mean STOP.
   Do not rerun installed migrations or drop conflicts to make this script pass.
3. Review and apply ONLY `server/db/proposed/xendit-test-payments.sql` in the approved
   isolated/staging environment. It adds new objects and explicit order triggers;
   it does not backfill orders or replace any installed function. Installation has
   lock/statement timeouts and one transaction, so a failure rolls back.
4. Run read-only `docs/sql/xendit-payments-postflight.sql`. Compare original counts,
   totals, references, stock and old RPC fingerprints. Verify RLS, effective browser
   grants (none), service-role-only RPC execution, unique constraints, triggers and
   config.enabled=false. Validate behavior with disposable fixtures before sharing.
5. Deploy backend/frontend together with flags still off. Verify COD, old history,
   references, authentication/Google/OTP, cancellation and admin functionality. The
   new migration blocks new old-server demo online orders too; this is deliberate.
6. After schema approval and preliminary local/mock checks, approve a controlled
   staging Test Mode enablement window. Verify the dashboard and keys, configure the
   HTTPS origin/webhooks, then an authorized operator may set payment_gateway_config
   enabled=true and the two environment flags true ONLY on that staging deployment.
   These manual changes are not executed by any artifact here. Complete the sandbox
   checklist below before considering any wider deployment. There is no Live path.
7. Schedule the approved reconciler with alerts. From `server/`, the explicit manual
   command is `node --env-file=.env scripts/reconcile-test-payments.mjs --approved-test-mode`.
   It performs provider GETs and DB transitions, never creates sessions, and must
   not be run without authorization. It snapshots up to 1,000 candidate IDs before
   mutations, reports unknown creations/errors/cap reached without secrets, and
   exits nonzero for intervention. A larger deployment needs a durable paginated
   job scheduler/cursor, alert routing and operational ownership; this bounded
   manual runner is not a production-scale autonomous payment processor.

Rollback means disabling **new** online payment creation in both app and DB gates,
keeping reconciliation/webhook handling available for existing obligations, and
preserving tables, audit data and triggers. Do not roll back to an old app that can
fulfill unpaid online orders, disable guards, delete payment rows, blanket-restock,
or replay creation after uncertainty. Drain/reconcile obligations before any later
forward corrective migration. Restoring a backup is not a payment refund.

## Environment and Test Mode dashboard setup

Documented in server/.env.example; no real values were read or written:

- XENDIT_PAYMENTS_ENABLED: false by default; new online creation gate.
- XENDIT_DEPLOYMENT_VALIDATED: false by default; operator attestation of approved
  staging schema/configuration and readiness for controlled sandbox QA.
- XENDIT_ENVIRONMENT: test only; live is rejected.
- XENDIT_SECRET_KEY: Test Mode secret key, server only. Scope money-in Sessions
  create/read/cancel, payment-request reads and v3 refund reads as the dashboard
  exposes them. Confirm least-privilege permissions with the actual account.
- XENDIT_WEBHOOK_TOKEN: the Test Mode verification token from Webhook Settings.
- XENDIT_BUSINESS_ID: expected Test Mode merchant business ID, checked on provider
  reads and webhooks. No subaccount or split-rule integration is assumed.
- XENDIT_ENABLED_METHODS: empty by default; choose only validated account-enabled
  gcash,maya,card. Mapping is GCASH/PAYMAYA/CARDS; unsupported activation/amounts must
  be resolved with the account, not guessed or silently switched to another method.
- XENDIT_CHECKOUT_HOSTS: exact approved sandbox response hosts; default xen.to from
  the published response example. Add another actual host only after validation.
- Existing APP_ORIGIN must be the actual HTTPS public frontend/API origin, with no
  trailing slash. Xendit requires HTTPS return URLs even when app development is
  local. Do not invent a deployment hostname or use an unrelated return origin.

Use the actual Xendit dashboard in **Test Mode**, generate the permitted test key,
verify GCash/Maya/cards eligibility and use only provider-documented sandbox payer
details. Configure Payment Session Completed and Expired callbacks to
`https://<approved-app-host>/api/webhooks/xendit` and copy that environment's callback
token privately into the server environment. The real host/key/business ID have
not been supplied. For local browser QA, expose the existing Vite app + `/api` proxy
through an approved HTTPS tunnel/reverse proxy, use that same public APP_ORIGIN in
the browser and retain Google callback allowlists if testing Google on that host.
An API-only tunnel with a different frontend origin is not this setup.

Never put these settings in VITE_* or screenshots/logs/committed environment files.
Flags/key-prefix checks are local safeguards; actual account Test Mode, channel
support, webhook payload compatibility and dashboard token delivery remain manual
acceptance requirements. No provider API calls were run by this implementation task.

## Test evidence and manual QA

Automatic unit/HTTP tests use injected fake Xendit responses only. They cover gate
defaults/live rejection, channels, server-derived amount, ownership, input tampering,
CSRF/Origin/customer/admin boundaries, success/failure/expiry/cancel classification,
unknown create without POST replay, provider GET retries, URL validation, webhook
authentication/current-state reconciliation, duplicate semantic IDs, refund identity
checks, and default-disabled/accessibility UI. Existing regressions cover Google,
cookie sessions, Remember Me, inactivity, quote/idempotency and cancellation.

Run local regressions with:

```
node --test server/test/*.test.js src/services/*.test.js
npm run lint
npm run build
git diff --check
node server/scripts/validate-payment-postgres.mjs --pg-bin "C:\Program Files\PostgreSQL\16\bin"
```

The PostgreSQL harness accepts no connection URL, does not load dotenv, strips
database/Supabase variables, initializes a new temporary loopback cluster, verifies
its data directory/port, installs unchanged prerequisites plus the proposal, and
stops only its own cluster. Fictional Auth/role fixtures are not real Supabase Auth.
Evidence is in `docs/testing/evidence/xendit-payments-local.json`, including SQL
hashes and observed concurrent lock waits. It checks preservation/default-off,
same-key reservation, concurrent claims, unpaid fulfillment/cancellation rollback,
duplicate events, expiry/cancel/payment/fulfillment races, late payment, stale paid
identifier protection, one-time restocking, unstarted expiry versus unknown hold,
browser-role denial and partial/full refunds without inventory movement.

Recorded local results: **169 backend tests, 112 frontend tests and 16 isolated
PostgreSQL checks passed**. Lint, production build and `git diff --check` passed.
The PostgreSQL checks also execute the new read-only preflight/postflight files
and simulate hosted-project default service-role grants to verify append-only
audit permissions. No dashboard/hosted checkout/shared PostgREST test is included
in those pass counts.

After explicit approval and staging configuration, perform these real **Test Mode**
checks. These have NOT been performed automatically:

1. With flags off, verify COD checkout/history/references and cancellation work and
   all online options remain disabled. Check a forged online POST is rejected.
2. In the approved enablement window, run server and Vite, open their approved HTTPS
   public origin, sign in with an authorized customer and verify only enabled Test
   Mode methods appear. For each channel create one order, confirm server pricing
   and a single stock deduction, then enter only Xendit sandbox details on its host.
3. Complete payment and verify the authenticated webhook and linked request move
   payment to paid. A return URL alone must show pending verification. Check customer
   and admin pages, references, amount/currency and paid-only fulfillment.
4. Use the channel's documented failure simulation; an ACTIVE session must permit
   another attempt through the SAME link. Deny/back/cancel and separately let the
   provider session expire. Verify provider closure before exactly-once release.
5. Retry webhooks from the dashboard, delay/reorder notifications and run two
   reconciliation requests. Audit dedupe and stock must remain correct. Invalid
   tokens, foreign business/reference or wrong amount/currency must not grant paid.
6. Simulate creation response loss with an approved fault proxy. Keep the original
   order/reference, verify creating/unknown and no second create POST, locate the
   session in the dashboard, then supply its session ID in admin reconciliation.
   If no provider outcome can be established, retain the hold and escalate; do not
   manually free stock based only on elapsed time or a missing browser response.
7. Race cancel/expiry with success and fulfillment. Unpaid fulfillment is blocked;
   late money after released inventory is review, not revived fulfillment. Confirm
   alerts and an operator resolution path before deployment approval.
8. Freeze a test order and perform an approved sandbox v3 refund outside AVENGEMS.
   Reconcile pending/failed/partial/full results; full refunded and partial review
   must not restore physical inventory. Do not use legacy refund contracts here.
9. Test logout, 20-minute inactivity, genuine activity, Remember Me on/off, Google
   login and a backend restart. Auth sessions may be lost as documented, while
   payment claims/events persist. After re-authentication resume the same order.

Remaining deployment blockers: schema approval/shared-project prohibition; actual
Test Mode credentials/business/channel limits; HTTPS origin/callback setup; live
PostgREST/dashboard payload tests; reliable scheduling/alerts; agreed manual handling
for permanently ambiguous creates, late/multiple success and physical returns. The
app does not implement refund creation or automate those financial incident decisions.

## Exact file manifest for this task

Created:

```
server/db/proposed/xendit-test-payments.sql
server/scripts/reconcile-test-payments.mjs
server/scripts/validate-payment-postgres.mjs
server/src/xendit.js
server/src/payments.js
server/src/routes/payments.js
server/test/payments.test.js
src/components/cart/PaymentMethods.jsx
src/components/account/PaymentStatus.jsx
src/services/paymentService.js
src/services/paymentService.test.js
docs/sql/xendit-payments-preflight.sql
docs/sql/xendit-payments-postflight.sql
docs/testing/evidence/xendit-payments-local.json
docs/xendit-test-payments.md
```

Modified, preserving prior work in shared files:

```
server/.env.example
server/src/index.js
server/src/checkout.js
server/src/admin.js
server/src/routes/checkout.js
server/src/routes/me.js
server/src/routes/admin.js
server/test/checkout.test.js
server/test/admin.test.js
src/pages/Checkout.jsx
src/pages/OrderConfirmation.jsx
src/pages/account/OrderDetails.jsx
src/pages/admin/Orders.jsx
src/components/account/OrdersTable.jsx
src/services/adminService.js
src/services/checkoutAttempts.js
src/services/checkoutService.test.js
README.md
```

Other dirty/untracked authentication files predate this task. No previously
installed SQL file was edited. No commit/push/merge/branch switch was performed.
