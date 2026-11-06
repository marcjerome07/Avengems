# Customer cancellation and short order references — forward deployment

## Current readiness

The authoritative installation-only package is now the
[deployment runbook](order-improvements-deployment-runbook.md), with the single
[preflight](sql/order-improvements-preflight.sql), migration-specific
[verification](sql/order-improvements-postflight.sql), and
[pending Supabase checklist](order-improvements-staging-checklist.md).
Keep the customer feature disabled; activation is excluded from this package.
The revised inspection queries have not been executed against PostgreSQL.

Application code is implemented on backend-mariel. **Customer cancellation is
disabled by default. Neither new migration has been run on shared Supabase.**
The user reports that the original checkout/admin-cancellation migrations are
already installed; that shared state has not been independently queried here.
Do not rerun or edit those installed files. Existing uncommitted work is preserved.

New, separately reviewed forward artifacts:

1. `server/db/proposed/customer-order-cancel.sql`
2. `server/db/proposed/order-display-references.sql`

Customer cancellation requires the already-installed checkout metadata. The two
new files are independent of one another; the order above matches the executed
local validation. Do not rerun schema.sql, seed.sql, checkout-orders.sql or
admin-order-cancel.sql against the shared project.

## Customer cancellation

`POST /api/me/orders/:internalId/cancel`, JSON `{}`, uses the existing cookie/Bearer
verification, confirmed email/customer role, signed CSRF, exact Origin and JSON
checks. Ownership comes exclusively from the verified subject. Unknown request
properties (including roles, customer IDs, quantities and prices) are rejected.
The route checks owner/status/provenance and calls only
`customer_cancel_order(p_user_id uuid,p_order_id text) RETURNS jsonb`.
It never invokes the administrator RPC or passes an administrator identity.

The SECURITY INVOKER function uses empty search_path and fully qualified application
tables, locks the customer profile FOR SHARE and the owned order FOR UPDATE, and
locks items/products in deterministic order. Only Pending/Processing may cancel.
Non-owned or missing orders return the same P3002/404. Shipped/Delivered/Cancelled
raise P3003/409, including duplicate concurrent requests after the first succeeds.
There is no second inventory restoration. Admin replay still returns its existing
Cancelled snapshot and remains unchanged.

Metadata must contain the checkout key/object request; reference backfill does not
create provenance. Legacy/manual orders are ineligible. The function validates
1–50 items, quantities 1–10, aggregates all variants once per product (1–500), and
guards missing products/stock overflow. P3004/409 denies unsafe history or restock.
Status and every inventory update commit/roll back together. Metadata/items must
remain immutable; privileged writers must never reopen Cancelled orders.

Both the cancellation RPC and the read-only `customer_cancellation_version()` are
EXECUTE-restricted to service_role (plus trusted owner/platform administration).
The secret stays server-only. SQL itself trusts the backend identity parameter;
ordinary customers must not have effective RPC execution rights.

### Deployment gate and customer UI

`CUSTOMER_ORDER_CANCELLATION_ENABLED` defaults to false/absent. The backend requires
it to be exactly `true` AND the new version RPC to return integer 1. The flag is an
operator attestation of completed validation/approval; version presence alone is
not proof of safe deployment. Set no flag during implementation or before approval.
An absent/unavailable version fails closed. POST returns 503
CUSTOMER_CANCELLATION_DISABLED; detail reads return `canCancel:false`.

My Orders detail shows a disabled action for otherwise eligible statuses until the
server returns `canCancel:true`. Eligible orders require an explicit confirmation
modal. Submissions show loading and suppress repeated clicks. Errors close the
modal and offer Refresh order status; uncertain network responses are never treated
as success or blindly replayed. A confirmed cancellation immediately replaces the
timeline with cancelled information and refreshes owner-scoped order history; list
navigation also reloads persisted history. Terminal orders have no cancel action.
No real payment/refund or 5–7-day refund promise is implemented.

## Short customer-facing references

Internal text `orders.id`, order-item foreign keys, API URLs, admin/customer
cancellation IDs and idempotency remain unchanged. DTOs gain nullable `reference`;
detail reads also gain `canCancel`. Before deployment or for missing/invalid labels,
the frontend shows the original ID with safe wrapping, never a fabricated counter.

The new migration adds:

- `public.order_reference_counters(reference_year integer PRIMARY KEY,last_value bigint)`;
  RLS enabled, no client policies/rights; service_role gets SELECT/INSERT/UPDATE only.
- Orders columns `reference_year`, `reference_number`, and stored generated text
  `order_reference`; a unique index on generated reference.
- SECURITY INVOKER/empty-search_path `assign_order_reference()` and BEFORE INSERT /
  reference-column UPDATE triggers. Existing checkout/admin RPC definitions are
  not replaced. Their `to_jsonb(order)` returns the generated field automatically.

Allocation uses an atomic yearly counter INSERT ... ON CONFLICT UPDATE ... RETURNING,
which locks that year's row until commit. It uses neither COUNT/MAX allocation nor
random/client counters. Year is derived from created_at in UTC; a transaction crossing
midnight follows its order timestamp's UTC year. The initial number each year is 1.
Formatting pads to AT LEAST four digits: AVG-2026-0001, AVG-2026-0002, and
AVG-2026-10000 remain distinct. Bigint numbers are formatted in PostgreSQL, never
rounded through a JavaScript numeric counter. Supplied reference numbers/years on
insert and later reference changes are rejected. Aborted checkout rolls its counter
allocation back with the order; idempotent replay allocates nothing.

The migration takes the orders DDL lock, creates the new objects and deterministically
backfills every existing order by created_at, then ID, per UTC year. Only NEW display
columns change. Original IDs, contact/item/price snapshots, stock and checkout metadata
remain untouched. Legacy orders receive labels but stay cancellation-ineligible
without provenance. Required year/number columns become NOT NULL after backfill.

**Operational cost:** the generated stored column can rewrite orders, the backfill
updates every order and invokes existing UPDATE triggers, and the index scans it.
Pause competing checkout/order/inventory writers in an approved quiet window. Stop
for any unreviewed trigger/rule. The deployment is one transaction with 5-second
local lock and 60-second statement timeouts. Large tables may exceed the reviewed
window; measure in representative staging and revise under separate review rather
than raising global limits or hiding conflicts. Runtime yearly counter contention
serializes reference allocation; external writers must follow compatible lock order.
Never reset/delete/reseed counter rows.

## Executed evidence and remaining limits

The opt-in local harness now supports:

```powershell
node server/scripts/validate-order-postgres.mjs --pg-bin 'C:\Program Files\PostgreSQL\16\bin' --order-improvements
```

It creates a fresh loopback-only cluster, applies the original baseline plus local
Auth/role adapters and original migrations there, then the two new files. It never
loads production configuration or accepts an existing/shared database endpoint.
Results and exact artifact/schema/harness SHA-256 are recorded in
[`testing/evidence/order-improvements-local.json`](testing/evidence/order-improvements-local.json).
The temporary server is stopped afterward; synthetic cluster files remain in Temp.

The run passed **33 real PostgreSQL checks**, including the original 23 checks plus:
service-only customer RPC installation, new read-only pre/postflight SQL execution,
backfill preserving all pre-existing fields, distinct concurrent counter allocation,
UTC year rollover/10000 width, immutable references, exact customer restocking,
customer replay denial, customer/admin races in both commit orders, fulfillment
races in both orders, legacy/missing-item/missing-product/overflow rejection and
rollback after customer status mutation. Missing-product fault injection drops a
constraint ONLY inside an aborted disposable test transaction; its restoration is
asserted. No shared constraint/data/settings were changed.

Local adapters are not Supabase Auth/PostgREST integration, and successful query
execution does not replace operator review of every live preflight result. Browser
click/confirmation interaction still requires authorized manual smoke verification.

Final application regression run: **135 backend tests and 95 frontend tests passed**;
lint (no warnings), production build and `git diff --check` passed. These are separate
from the 33 native PostgreSQL checks. No shared migration was run or feature flag set.

Reviewed on-disk SHA-256 (recalculate before approval/execution; byte changes invalidate review):

| New file | SHA-256 |
| --- | --- |
| `customer-order-cancel.sql` | `342C1B5956183D2FAF07EDD4652D54C79968E4691937CBE0B4379A7FEBD1BF4A` |
| `order-display-references.sql` | `1570D41DC0A8203176A9F8BA45B2BCC9403E65E2F0285C51EBD4C5FC6943F1C6` |

## Exact next safe deployment steps

1. Keep the backend flag unset/false. Record SHA-256 of both new files. Obtain named
   team/database-owner review of these exact bytes, data-retention/backfill behavior,
   table size, lock order, custom triggers/default grants and rollout window.
2. Have an authorized administrator run only the
   [read-only forward preflight](sql/order-improvements-preflight.sql). F01 must show
   the existing checkout/admin signatures on the intended project; F02 must return
   ZERO new-object conflicts. Review F03 schema/types/FKs/index validity, F04 trigger/
   rule side effects, F05 valid years/quantities/stock and sizes, F06 privileges/RLS/
   defaults/dependencies. Stop on differences; do not auto-repair or replace objects.
3. Confirm a recoverable shared backup, isolated restore evidence, named restore
   operator and other developers' writer coordination. Local test evidence is not
   a backup or production deployment approval.
4. In separately approved disposable Supabase staging, validate actual roles/grants,
   PostgREST schema exposure, existing policies/triggers and the real cookie/CSRF
   application flow. Re-run ownership, races, fault rollback and reference/backfill
   checks on representative schema/volume. Use disposable accounts/products only.
5. After explicit shared-project approval and a quiet window, apply
   `customer-order-cancel.sql` once, then `order-display-references.sql` once. Each
   already contains BEGIN/COMMIT. Stop on any error and roll back an open aborted
   transaction. A lost connection requires read-only state inspection, never blind
   rerun. Do not use CREATE OR REPLACE, IF NOT EXISTS or CASCADE to bypass conflicts.
6. Run [read-only postflight](sql/order-improvements-postflight.sql). G01: exactly
   three new signatures, invoker and empty search_path. G02: exactly nine basic role
   rows; anon/authenticated EXECUTE false, service_role true. Review ALL inherited/
   owner/platform execution paths, not only direct ACLs. G03: counter RLS/client
   rights denied, service S/I/U allowed. G04: three columns, generated label, valid
   unique index and two enabled triggers. G05: no missing/duplicate/invalid labels
   or counters behind orders. Compare unchanged IDs, snapshots, item counts and
   inventory against protected baseline evidence. No real cancellation is part of
   read-only verification.
7. Keep `CUSTOMER_ORDER_CANCELLATION_ENABLED` unset/false. Future activation requires
   separate explicit approval after deployment/platform validation and is outside
   the current installation package. No browser or Supabase setting is changed.
   This backend's sessions are process-local; any later approved Express restart
   needs coordination. Failed capability lookup must always leave the button off.
8. Smoke in staging by default: log in as disposable customer A, verify a Pending/
   Processing order's display reference/internal link, open confirmation, keep order,
   reopen and cancel; verify updated detail/list and one stock restoration. Repeat
   direct POST: 409, no more stock. Customer B gets 404; missing Origin/CSRF and
   unauthenticated/unconfirmed/admin-customer-route access fail. Shipped/Delivered/
   Cancelled/legacy have no enabled action. Check missing migration/version with
   local mocks, not by removing shared functions. Verify admin cancellation still
   works, concurrent checkout labels differ, and long legacy labels fit mobile UI.
   Shared smoke WRITES need additional explicit approval for exact disposable data.

If problems occur, disable the customer feature flag and pause affected writers;
the button/API fail closed. Revert application presentation if needed while retaining
new reference data/counters/triggers. Because this is forward-only, any database
repair is a new reviewed migration. Do not erase/reassign references, reset counters,
delete historical orders or reverse cancellations by editing status/stock. Original
admin cancellation remains available under its unchanged eligibility/security rules.

## Files and API inventory

Runtime: `server/src/{index,checkout}.js`, `server/src/routes/{me,checkout}.js`,
`src/services/orderService.js`, `src/utils/orderReference.js`,
`src/components/account/{CancelOrderAction,OrderReference,OrdersTable}.jsx`,
`src/pages/account/OrderDetails.jsx`, `src/pages/OrderConfirmation.jsx`,
`src/pages/admin/{Orders,Dashboard}.jsx`.
Tests: `server/test/{checkout,order-deployment}.test.js`,
`src/services/orderImprovements.test.js`, `server/scripts/validate-order-postgres.mjs`.
New proposed SQL and pre/postflight artifacts are listed above. Existing schema and
installed checkout/admin SQL files are preserved. No shared deployment, real account
promotion, commit, push, merge or branch switch was performed.
