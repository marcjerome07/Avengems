# Xendit: next-stage Supabase staging handoff

Prepared 2026-11-08. **Preparation only; no infrastructure, account, SQL or provider
operation was executed. Both payment flags remain false.** This document does not
approve a domain, project, migration installation or payment transaction.

## Approval record and boundaries

Complete this record privately before any remote step. No values are assumed:

| Input | Current status |
| --- | --- |
| Separate Supabase staging project reference and owner | Not supplied / not approved here |
| Approved staging public HTTPS hostname and TLS operator | Not supplied / not approved here |
| Approved Xendit Test Mode business and callback owner | Not supplied / not approved here |
| Approved staging schema/bootstrap and migration operator | Pending |
| Verified staging test customers and administrator | Pending; do not copy production Auth users |
| Provider transaction, fault-injection and refund test window | Pending separate approval |
| Reconciliation/incident owner and escalation destination | Pending |

Keep these settings in every prepared deployment:

```
XENDIT_PAYMENTS_ENABLED=false
XENDIT_DEPLOYMENT_VALIDATED=false
```

Keep payment_gateway_config.enabled=false after installation too. Do not use the
shared production-labeled Supabase project for any step, including a "test order".
Do not change Xendit callback URLs/channels/keys or create Test Mode sessions until
those specific actions are approved. Test Mode still creates external records.

There are two separate acceptance stages: (A) isolated schema/HTTP readiness with
flags OFF, and (B) future explicitly approved hosted-transaction QA. Stage B cannot
run through the current application while the flags are false. Record it as BLOCKED,
not passed. This handoff supplies no enablement command or automatic account change.

## Migration review and compatibility

The proposal creates four payment/config/audit/refund tables, one nullable order
summary column, payment RPCs and two order triggers. Its install transaction has
5-second lock and 60-second statement limits. It does not replace installed RPC
bodies, backfill historical payments, alter old references or restock on installation.
All five SQL artifact hashes currently match the recorded local PostgreSQL evidence.

Compatibility requirements:

- Real Supabase auth.users, public profiles/catalog/addresses/settings/orders/items
  baseline, service_role/anon/authenticated roles and sufficient migration-owner
  privileges. The source baseline is server/db/schema.sql; it is NOT idempotent.
- Installed reviewed customer_checkout, admin_cancel_order, customer_cancel_order,
  customer_cancellation_version and assign_order_reference definitions; checkout
  metadata/unique key, reference columns/index/counters/triggers must exist.
- Existing checkout/cancellation stock snapshots must remain immutable. Other
  order/product triggers and any deployed SQL drift need review before installation.
- The new guard affects ALL online orders, including historical demo orders without
  payment rows: advancing those orders to fulfillment is blocked. It does not mark
  them paid. Inventory/cancellation provenance for legacy orders stays as before.
  Agree on a legacy-order handling policy; never fabricate paid rows to bypass it.
- Managed paid orders cannot use the old cancellation/restock path. Provider closure
  must precede unpaid cancellation; paid/refunded/incident orders need review.
- RPCs are SECURITY INVOKER with an empty search_path. Hosted effective privileges,
  RLS bypass for the backend role and default/inherited grants must be verified.
  Audit events should be SELECT/INSERT only for service_role, with no UPDATE/DELETE.
- The SQL files live under server/db/proposed, not supabase/migrations. Do not assume
  `supabase db push`, a Git branch deployment or a schema branch replays them. Do not
  link/push the CLI to the shared project or repair its migration history here.

The tested lock discipline is order-serialized payment/cancellation/fulfillment,
with products locked in ascending ID order. The local checks prove their tested
interleavings, not every possible hosted trigger, isolation or timeout configuration.
Freeze staging order writes during installation and compare before/after evidence.

## Isolated Supabase setup and installation order

Use a **separate Supabase project**, with separate URL, keys, database credentials
and synthetic data. This avoids accidental branch merges/deployments into the shared
base project. A persistent Supabase branch is an alternative only after separate
approval and verification of its distinct credentials and actual schema history;
do not merge it. Do not enable production-data copying. See Supabase's
[environment guidance](https://supabase.com/docs/guides/deployment/managing-environments)
and [branching caveats](https://supabase.com/docs/guides/deployment/branching).

After project-creation/bootstrap approval, the operator must:

1. Record the staging dashboard URL/project reference and its Connect-panel host,
   database user and port. Compare privately with the forbidden shared-project
   reference. `current_database() = postgres` is NOT proof of project identity.
2. Create a private ignored server/.env.staging using ONLY that project's keys.
   Do not copy server/.env, which may target the shared project. Use the existing
   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY variable names.
   Do not copy the local harness's fake auth schema/users, roles or permissive grants
   into Supabase; its Auth and platform roles are already managed by Supabase.
3. Inventory the actual public schema. If this is genuinely empty, install the
   reviewed baseline once. If objects already exist, STOP and reconcile its migration
   history rather than rerunning schema.sql. Never reset/clean/drop a remote schema
   merely to make this procedure pass.
4. For an approved EMPTY public schema only, install this sequence, one file at a
   time, stopping at the first error:

   | Order | File | Requirement |
   | --- | --- | --- |
   | 1 | server/db/schema.sql | Fresh AVENGEMS public baseline; real Supabase Auth already exists |
   | 2 | server/db/proposed/customer-addresses.sql | If saved-address management is included in staging acceptance |
   | 3 | server/db/proposed/checkout-orders.sql | Checkout metadata, idempotency and inventory RPC |
   | 4 | server/db/proposed/admin-order-cancel.sql | Controlled admin restocking |
   | 5 | server/db/proposed/customer-order-cancel.sql | Customer cancellation and version RPC |
   | 6 | server/db/proposed/order-display-references.sql | Short-reference allocator and immutable reference triggers |
   | 7 | Read-only payment preflight, below | Run only after prerequisites exist |
   | 8 | server/db/proposed/xendit-test-payments.sql | ONLY after explicit staging-migration approval |
   | 9 | Read-only payment postflight, below | Payment DB gate must still be false |

   Before step 7, use separately approved synthetic catalog/accounts to create at
   least one COD order through the existing checkout and retain its order ID,
   display reference, items and stock snapshot. An approved cancellation fixture
   can also preserve a cancelled history row. This makes hosted preservation checks
   meaningful instead of comparing only empty tables. These are staging data writes
   needing explicit approval; they do not require Xendit or payment enablement.

   On a staging project ALREADY at the approved checkout/cancellation/reference
   baseline, do not execute steps 1–6 again; inspect and compare them. Only the new
   payment proposal is eligible for installation. These instructions never authorize
   rerunning any previously installed migration on the shared project.
5. Use synthetic catalog/stock and permitted staging accounts. Create real test
   users through the existing authorized Auth flow and verify their profiles; do
   not INSERT fake auth.users fixtures. Reuse an approved staging administrator or
   request explicit permission for a staging role assignment. Do not promote a
   production account. No seed/auth operation is authorized by this document alone.
6. Package the reviewed WORKING TREE, including untracked payment and Google-auth
   modules. `git archive HEAD` or deploying only the remote branch would omit current
   uncommitted work. Pin file hashes and a reviewed manifest; preserve package locks.
   Do not commit/push/merge/switch branches as a shortcut to this staging handoff.

## Exact read-only preflight execution

Preferred path, only after the isolated target is approved:

1. Open `https://supabase.com/dashboard/project/<STAGING_REF>/sql`; replace the
   placeholder with the privately verified staging reference. Recheck the project
   selector and address bar before EVERY execution. Close production editor tabs.
2. Open a new SQL query and paste the COMPLETE contents of
   docs/sql/xendit-payments-preflight.sql. Run the file alone, including its
   `BEGIN ... READ ONLY` and COMMIT. Do not append migrations, DML or enablement SQL.
3. Save every result set in restricted staging evidence, with operator/time/project
   reference, file SHA-256 and the approval ID. Redact credentials/customer data.
4. If any statement errors, stop; roll back an open read-only transaction before
   proceeding. Do not ignore partial results or convert failed checks into grants.

Optional psql execution uses a privately prepared **staging-only libpq service**,
named avengems_xendit_stage, whose host/user/port/dbname and TLS verification come
from that project's Connect panel. Configure TLS/certificate verification using
the actual project instructions; never put a password in the command/URL/history.
Run from the repository root in an operator terminal, not through this agent:

```powershell
psql -X --dbname="service=avengems_xendit_stage" --password --set=ON_ERROR_STOP=on --file="docs/sql/xendit-payments-preflight.sql"
```

`-X` avoids a startup script; `--password` prompts privately. The service name is
only a local profile name, not an identity check: inspect its target beforehand.
Do not use an ambient DATABASE_URL/PGSERVICE or a saved production connection.

Require ALL of the following before installation:

| Check | Required result |
| --- | --- |
| Prerequisite signatures | All five resolve; no unexpected overloads |
| Existing RPC bodies/types/arguments/ownership | Match approved definitions; no silent replacement |
| Conflicting payment relations/functions/column | Zero rows before FIRST install |
| Existing triggers/indexes | Only reviewed compatible definitions; checkout/reference unique indexes present/valid |
| Checkout provenance | invalid_checkout_provenance = 0, or STOP for explicit review |
| Role/default/inherited grants | Documented; browser roles cannot acquire money-RPC execution |
| Historic snapshot | Record orders/items/quantities/totals/references and product stock while writes are frozen |
| Reference allocator | Record counter values and reference assignments; counters must not reset |

Expected normalized body MD5 values from the reviewed local prerequisite source
(CR removed; outer space/newline/tab trimmed, exactly as the preflight query):

| Function | Expected MD5 |
| --- | --- |
| customer_checkout(uuid,uuid,jsonb) | 0d678360d25017f3b3a17e335ff40597 |
| admin_cancel_order(uuid,text) | 44a1a3668c100ec20a2b65055c29f881 |
| customer_cancel_order(uuid,text) | 13dc70fe2cd372bd098653a251bf0423 |
| customer_cancellation_version() | ccb5b4481bced39454dca6d845601d54 |
| assign_order_reference() | db8231ddd2cc7b40073c28f5845482a3 |

The existing file prints body hashes for the first three only. To inspect all five,
run this ADDITIONAL read-only query in a separate new staging query after the file:

```sql
begin isolation level repeatable read read only;
with expected(signature) as (values
  ('public.customer_checkout(uuid,uuid,jsonb)'),
  ('public.admin_cancel_order(uuid,text)'),
  ('public.customer_cancel_order(uuid,text)'),
  ('public.customer_cancellation_version()'),
  ('public.assign_order_reference()'))
select e.signature,p.oid is not null as present,p.proargnames,
  p.prorettype::regtype as result_type,p.prosecdef,p.proconfig,
  md5(btrim(replace(p.prosrc,E'\r',''),E' \n\t')) as normalized_body_md5,
  (select count(*) from pg_proc q where q.pronamespace=p.pronamespace
    and q.proname=p.proname) as overload_count
from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature);
select reference_year,last_value from public.order_reference_counters order by reference_year;
select count(*) as invalid_reference_rows from public.orders
where reference_year is null or reference_number is null or order_reference is null;
commit;
```

MD5 here detects definition drift, not artifact authenticity. Pin SHA-256 for the
actual reviewed release files. The current payment proposal's SHA-256 is
`3679b9dc033472cfed4bf425eac6b0faa1bf31966c141f72c52b72aa3dbc3b63`.
Any discrepancy needs review; do not substitute local definitions into an installed
project automatically. The supplemental query is prepared/source-reviewed only;
it has not been executed against any Supabase project.

## Installation and exact read-only postflight

Only after the staging target and migration have explicit approval, an authorized
operator may run the COMPLETE proposed payment migration once in that project's
SQL Editor. It already owns its BEGIN/COMMIT; do not concatenate it with bootstrap
files or partial retries. If it fails, stop and inspect the rollback; do not drop
objects or use CREATE OR REPLACE to bypass conflicts. Keep all payment gates false.

Then open a NEW query and run the COMPLETE docs/sql/xendit-payments-postflight.sql
alone, including its read-only transaction. The equivalent psql command is:

```powershell
psql -X --dbname="service=avengems_xendit_stage" --password --set=ON_ERROR_STOP=on --file="docs/sql/xendit-payments-postflight.sql"
```

Require config to contain exactly one true-ID row with enabled=false; unchanged
historic aggregates, old definition hashes and reference allocator state; exactly
the reviewed new triggers, RPCs and constraints; and initially empty payment tables.
RLS must be enabled on all four new tables. Browser-role SELECT/EXECUTE checks must
be false. Service-role RPC EXECUTE must be true; payment_events UPDATE/DELETE and
DELETE on all four new tables must be false. Other UPDATE grants in the file are
intentional. Check INSERT/SELECT grants and role inheritance too, not just policies.

Repeat the supplemental fingerprint/counter query from preflight. On small synthetic
fixtures, compare exact id→reference and product→stock snapshots, not aggregate
counts alone: offsetting changes can preserve an aggregate. Do not export real users.

The proposal sends NOTIFY pgrst on commit. SQL success does NOT prove that the hosted
Data API has reloaded or that its API key maps to the intended role. After separate
staging-read approval, use the backend SDK with .env.staging to perform the stable,
read-only xendit_payment_version RPC through PostgREST. It must return 0. Verify
browser anon/authenticated requests cannot invoke it or read the new payment tables.
Use actual API responses, not only SQL Editor's privileged execution. Do not grant
browser access to fix a failure. PGRST202/cache/grant errors block acceptance; any
manual schema-cache notification is a separate approved change, not read-only SQL.

Neither preflight nor postflight calls a payment mutation RPC. The local harness
previously executed the two existing files; no hosted execution is claimed here.

## Hosted integration coverage still missing

The recorded 169 backend / 112 frontend / 16 PostgreSQL passes are retained, not
rerun or enlarged by this documentation review. The SQL hashes still match that
evidence. Its auth.users is a minimal fake table, its roles/default grants are
modeled, and its database is native PostgreSQL 16.13 with direct psql connections.

| Assumption | What staging must add |
| --- | --- |
| SQL state/concurrency | Repeat critical transactions through real PostgREST/connection pooling and deployed triggers/timeouts; native tests exercise only selected interleavings. |
| Platform schema/grants | Real ownership, default ACLs, memberships, grants, RLS bypass, extensions and version; local grant simulation is not hosted certification. |
| Data API | Exposed public schema, cache notification, exact RPC argument names/JSONB/bigint serialization and translated errors with this project's actual server key. |
| Auth | Real verified Supabase users/profile trigger, customer/admin/foreign owner checks, OTP/password and approved staging Google provider. No copied production identities. |
| New channels | SQL reservation tests primarily use gcash. Maya/card have mocked method tests but still need real hosted-channel acceptance. |
| Frontend | Actual browser interaction, redirect/back, TLS Secure cookies, SameSite/CSRF/Origin, expiry/suspension, retry and duplicate-click behavior. Render/transport tests are not browser certification. |
| Xendit | Actual Test Mode activation, payload shapes/optional fields, permission scopes, hosted URL host, return handling, network timeouts and business IDs. |
| Webhooks/refunds | Real callback-token delivery, duplicate/resend timing, linked successful request, refund-list response and provider closure/late settlement semantics. |
| Operations | Crash recovery, durable reconciliation scheduling/alerts, queue-cap behavior, HTTP provider outages, incident resolution and physical returns. |

The current code strictly checks session capture_method, one returned allowed
channel, expires_at, request customer_id/amount/currency/channel and refund fields.
Missing/differently shaped provider fields may safely reject a genuine sandbox
response. Verify the contract in staging; do not loosen validation to make one
response pass without a reviewed change and new regression test.

## HTTPS configuration prepared for approval

Replace placeholders ONLY after hostname/project approval:

| Setting / route | Required value or routing |
| --- | --- |
| APP_ORIGIN | `https://<APPROVED_STAGING_HOST>` exactly; no trailing slash, alternate host or explicit default port |
| Supabase API origin | `https://<STAGING_PROJECT_REF>.supabase.co` from that project's dashboard |
| Webhook URL | `https://<APPROVED_STAGING_HOST>/api/webhooks/xendit` |
| Success return | `https://<APPROVED_STAGING_HOST>/order-confirmation/<INTERNAL_ORDER_ID>?payment_return=1` |
| Cancel return | Same order path with `payment_return=cancelled` |
| Supabase Google app callback | `https://<APPROVED_STAGING_HOST>/api/auth/google/callback/*`, only if staging Google QA is separately approved |

Use NODE_ENV=production so HTTPS browser QA exercises Secure cookie prefixes. Serve
the built dist on this TLS origin and proxy ALL /api routes unchanged to a single
stable Express process before SPA fallback. The proxy must preserve the incoming
Origin and x-callback-token; do not rewrite foreign Origin into APP_ORIGIN or enable
blanket trust proxy. No CDN cache, HTTP→login redirect, Basic Auth challenge or SPA
fallback may intercept the webhook. Public reachability is necessary; the callback
token supplies webhook authentication. Other browser writes keep CSRF protection.

No hostname, TLS certificate or proxy was deployed here. Prefer staging static
hosting over exposing Vite. If an approved tunnel is used, expose the SAME frontend
and /api origin, preserve hostname stability and explicitly review Vite host rules.
Do not use a wildcard allowedHosts setting to fix a blocked tunnel. Redact cookies,
Authorization, callback tokens, request bodies, hosted links and auth callback query
strings from proxy logs.

Use docs/xendit-staging.env.example to prepare a private .env.staging. It contains no
keys. Root .gitignore already ignores .env.staging. Do not overwrite current .env.
After infrastructure/key-configuration approval, the explicit local backend startup
from server/ is `node --env-file=.env.staging src/index.js`; npm start currently
loads .env instead. Also clear inherited Supabase/Xendit environment values in the
dedicated staging process/service configuration: Node env-file does not override
already-set environment variables. Verify names/target without printing secret values.
Use one stable process: auth/PKCE state is process-local, payment state is durable.

## Xendit dashboard and channel worksheet

Only an approved account operator may perform these future changes. Select **Test
Mode**, verify the expected business ID, and provision a least-privilege TEST secret
for Sessions create/read/cancel, linked payment-request reads and v3 refund reads.
No Live credentials, XenPlatform subaccounts/splits or production callback changes.

Inspect existing callback ownership FIRST: the account may already route Test Mode
events to another application. Do not overwrite its URLs or rotate its token without
the owner's approval. Use the approved dedicated business or coordinated test window.
Configure Payment Session Completed and Expired to the SAME exact staging webhook
URL. Copy that environment's verification token privately to XENDIT_WEBHOOK_TOKEN;
do not invent an HMAC scheme. Actual header delivery is an acceptance check.

| App method | Provider channel | Account worksheet before adding to enabled methods |
| --- | --- | --- |
| gcash | GCASH | PH/PHP hosted PAY, activated in Test Mode, actual min/max, sandbox success/failure method, observed status/expiry/refund behavior |
| maya | PAYMAYA | Same checks for this account; the app label Maya is not proof the channel is active |
| card | CARDS | Hosted automatic capture, eligible card/3DS test scenarios, actual limits and refund-read permissions |

Keep XENDIT_ENABLED_METHODS empty now. In a FUTURE approved QA window, add only
channels whose account worksheet is accepted, never every documented channel by
default. If unavailable, mark BLOCKED/NOT AVAILABLE and leave disabled; do not invent
a substitute code. Pin permitted hosted-link hosts from actual approved responses;
xen.to is the current documented default, not a guarantee of this account's host.
Use only the provider's current sandbox payer instructions; no real wallet/card data.

Official sources checked for this preparation:
[Sessions create](https://docs.xendit.co/apidocs/create-session),
[channel catalog](https://docs.xendit.co/docs/available-payment-methods),
[session events](https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session),
[webhook authentication](https://docs.xendit.co/docs/handling-webhooks), and
[request verification](https://docs.xendit.co/apidocs/get-payment-request).
Those documents describe provider capabilities; account-specific availability has
not been inspected. Current Sessions configuration uses PAY/PAYMENT_LINK/AUTOMATIC,
PHP/PH and a 30-minute expiry. Linked request reads use api-version 2024-11-11.

## Manual test plan and evidence requirements

Each row needs an operator, approval/window ID, channel, internal/display order IDs,
expected/actual result, redacted evidence, and PASS/FAIL/BLOCKED. Never count a blocked
scenario as passed. Configure test catalog/account fixtures only after data approval.

With flags OFF after approved staging deployment:

1. Verify DNS/TLS, frontend deep links, real staging Auth and no production requests.
   Check methods returns COD only, all online actions disabled, and a forged online
   checkout cannot reserve stock. Exercise COD checkout and approved existing cancel
   functionality, including customer cancellation's own separately validated flag.
2. Test real customer/admin/foreign-owner restrictions and Origin/CSRF rejection.
   Inspect only cookie attributes/timing, not token values. Verify OTP/password,
   Remember Me/reload/idle and approved staging Google behavior as applicable.
3. An approved infrastructure probe may POST `{}` WITHOUT a callback token to the
   public webhook. Expect backend JSON 401, not a login redirect or HTML 200. This
   tests routing only. Do not send payment-shaped payloads with a valid token as a
   "ping": a configured handler can read provider objects even with creation off.
4. Verify read-only PostgREST readiness and effective access as above. No hosted
   payment creation, signed dashboard resend or reconciler execution in this stage.

Future hosted QA requires explicit permission to enable a controlled staging window
AND initiate provider transactions. Keep both flags false until that separate action
is authorized. The existing installation guide describes the runtime gates; no gate
change is executed or requested implicitly by this checklist.

| Scenario | Required acceptance |
| --- | --- |
| Each approved channel success | One original order/reference, one deduction, one session create; return does not mark paid; verified webhook/request does; admin fulfillment then allowed. |
| Failed attempt / consent Back | ACTIVE session stays retryable using SAME link; no extra order/deduction/create; no paid claim. |
| Expiry and cancellation | Confirm provider session/request closure before one atomic stock release/order cancellation; a pending underlying request remains held/reviewed. |
| Missing/wrong callback token | 401 with no mutation. A provider dashboard ping may fail because it is not a real supported session event; that is not a successful payment test. |
| Authentic completed/expired callbacks | Observe actual header/business/reference/amount/currency, provider GETs and durable receipt. Acknowledge only after successful persistence. |
| Duplicate / delayed / reordered callbacks | Dashboard resend or approved event delivery causes no double stock action or paid downgrade; current provider reads determine state, not delivery time. |
| Wrong amount/currency/reference/business | Approved controlled fixture/replay is rejected, never paid/fulfilled; do not edit actual Xendit objects to force a mismatch. |
| Timeout during create / save / restart | Keep creating/unknown, no second create; recover original session by reference in dashboard, then verify via admin reconciliation. |
| Callback / cancellation / fulfillment race | No unpaid shipment, no independent double restock, no silent late-success fulfillment. |
| Outage and retries | 503 is retryable for provider/DB outage; confirm eventual retry and safe original order; 422 mismatch needs investigation, not indefinite blind resends. |
| Partial/full v3 refunds | Only after separately approved sandbox refund action; reconcile verified refund reads, freeze partial refunds, mark full refunded, never restore inventory automatically. |
| Auth expiry / logout / process restart | Auth limits remain enforced; reauthenticate to resume SAME persisted order. Provider obligations must not disappear with cookies/process memory. |

Store operational evidence without API keys, cookies, callback tokens, card details,
full hosted links or raw provider/customer payloads. Use payment_events and sanitized
status/stock snapshots plus dashboard delivery status/times. Record callback latency:
this implementation performs multiple synchronous GETs before replying, each with
a ten-second timeout and a possible safe GET retry; genuine provider acknowledgement
deadlines and duplicate delivery behavior need measurement. Do not claim the native
SQL tests cover HTTP acknowledgement timing. If this fails, keep disabled and review
a durable ingress/worker design before changing retries or returning early success.

## Unknown outcomes, reconciliation and stop conditions

- **creating/unknown:** a claim can precede a process crash or a successful provider
  create whose response was lost. Retain the reservation, locate the original Test
  session using its merchant reference in the dashboard and reconcile its verified
  session ID for the same order. Never resend create, switch to a new order/key,
  release solely on elapsed time or assume no dashboard result proves no charge.
- **Delayed/duplicate callbacks:** allow idempotent current-state reconciliation.
  Never downgrade paid using stale expiry, or use a browser return as proof.
- **Failure/expiry:** an ACTIVE session's failed attempt is not terminal. Only a
  proven-safe closed session or an unclaimed expired reservation releases stock.
  Preserve holds while underlying attempts could settle.
- **Late or multiple success:** block fulfillment, retain durable incident evidence
  and escalate to the financial/inventory owner. No automated paid-incident repair,
  refund creation or stock re-deduction is implemented; an approved resolution is
  still needed. Do not call payment_observe with hand-invented states to fix records.
- **Refunds:** read/reconcile only; physical returns/restocking are separate. Freeze
  fulfillment before any approved dashboard refund because Xendit and SQL cannot
  share a transaction.
- **Reconciler:** its manual --approved-test-mode switch is not evidence of user
  approval. Do not run it here. With Test Mode configuration it can make provider
  GETs and mutate payment/inventory state even while creation flags are false. The
  current 1,000-candidate cap can repeatedly revisit old records; schedule/cursor
  behavior, alert routing and operator ownership must be accepted before enablement.

Remain OFF for any identity/hash/grant/cache mismatch, missing HTTPS route, unverified
channel or payload shape, insufficient callback timeout budget, unresolved legacy
order policy, or absent incident/reconciliation owner. Do not delete/disable payment
guards or audits as rollback. A future rollback stops new creation while preserving
obligation processing, then uses a separately reviewed forward corrective migration.

## Changes and verification in this preparation

Created this handoff and docs/xendit-staging.env.example; linked this stage from the
existing payment guide. Existing migrations, implementation, test evidence and flag
defaults were not changed. Local SQL artifact SHA-256 comparisons matched the
recorded evidence. New documentation/supplemental SQL is source-reviewed only;
no hosted SQL/API/provider/dashboard/browser test has been performed in this stage.
