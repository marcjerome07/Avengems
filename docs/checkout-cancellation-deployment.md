# Checkout and cancellation: staged deployment review

**Shared production-labeled database deployment: BLOCKED pending evidence and team
approval.** Both proposed files exist and have been reviewed locally. The latest
[native PostgreSQL evidence](testing/checkout-cancellation-local-results.md) records
23 passing real transaction checks in a newly created disposable loopback cluster.
Shared Supabase was not contacted or modified. Actual Supabase staging integration,
shared preflight, backup/restore evidence and team approval remain outstanding.

## Artifacts and required order

1. `server/db/proposed/checkout-orders.sql`
2. `server/db/proposed/admin-order-cancel.sql` (this is the exact cancellation
   filename; `admin-order-cancellation.sql` does not exist).

Apply checkout first and verify it before applying cancellation. Cancellation now
explicitly requires the added checkout metadata to distinguish checkout-created
orders from legacy/manual orders with unproven inventory deductions. Do not rename
or substitute files at deployment. `server/db/schema.sql` is the baseline reference,
not a migration to rerun. The address mutation proposal is independent: saved-address
checkout reads need the existing addresses table, not its mutation RPC; address
editing still needs its separately reviewed deployment.

Related inspection artifacts:

- [Read-only preflight SQL](sql/checkout-cancellation-preflight.sql), queries P01–P19.
- [Read-only post-installation SQL](sql/checkout-cancellation-postflight.sql), V01–V08.
- [Isolated PostgreSQL tests and smoke procedure](testing/checkout-cancellation-staging.md).
- [Checkout application contract](checkout-order-placement.md) and
  [admin contract](admin-management.md).

## Statement-by-statement effects

| Statement | Checkout effect | Cancellation effect |
| --- | --- | --- |
| `BEGIN` | Starts installation transaction | Same |
| `SET LOCAL lock_timeout='5s'` | Bounds each deployment lock wait | Same |
| `SET LOCAL statement_timeout='60s'` | Bounds deployment statements; not whole-file duration | Same |
| Two `ALTER TABLE ... ADD COLUMN` | Adds nullable UUID `orders.checkout_key` and JSONB `orders.checkout_request`, no defaults/backfill | None |
| `CREATE UNIQUE INDEX orders_customer_checkout_key` | Unique `(user_id,checkout_key)` for non-null keys; existing null keys remain allowed | None |
| `CREATE FUNCTION` | Adds `public.customer_checkout(uuid,uuid,jsonb)` | Adds `public.admin_cancel_order(uuid,text)` |
| `REVOKE ALL ... PUBLIC, anon, authenticated` | Removes those EXECUTE paths on the new function | Same, for cancellation |
| `GRANT EXECUTE ... service_role` | Allows trusted backend RPC execution | Same |
| `NOTIFY pgrst, 'reload schema'` | Transactional PostgREST schema-cache notification | Same |
| `COMMIT` | Publishes installation atomically | Same |

Installation contains no table-record INSERT/UPDATE/DELETE, stock reset, seed,
trigger, policy, existing constraint replacement, table deletion or global setting
change. Fresh CREATE statements intentionally fail on conflicts. They are not
idempotent installers and must not be rerun blindly. An uncaught installation error
aborts its transaction; stop and roll back rather than continuing partial steps.
The checkout ALTERs require strong table locks and the normal index build scans
existing orders. Reads/writes can be blocked until commit. A coordinated quiet
window is mandatory; do not substitute a concurrent index or split the transaction
without a new reviewed artifact.

The function bodies execute DML only when called later. Checkout inserts one order
and its historical items, then decrements stock grouped by product. Cancellation
increments stock grouped by product, then changes status to Cancelled. Both return
JSONB including items. Neither contains COMMIT, exception suppression or separate
REST writes, so an error must roll back the surrounding RPC transaction. Identity
sequence gaps after failed item inserts are normal and are not lost orders.

## Static correctness and security assessment

Checkout retains finite nonnegative numeric(10,2) guards for price, configured
customization fee, shipping fee and threshold before calculation, including unused
fees; derived amounts are checked and total is capped. No NaN or infinity is accepted.
Color cardinality and selected stone are resolved in one aggregate statement.
Existing collection row locks do not prevent new inserts: later statements/lines
can see newer rows at Read Committed. No globally frozen catalog is promised.
Duplicate visible colors reject checkout; coordinate collection maintenance.

The customer profile UPDATE lock serializes same-user checkout. Same-key replay
compares normalized JSONB content and returns the original stored order before
new pricing/stock checks. The partial unique index also protects customer/key
uniqueness. A different customer may use the same key for its own intent. A changed
request for the same customer/key raises P1001. Product rows lock in sorted ID
order, aggregate requested quantities are checked, and guarded stock decrements
prevent overselling under the reviewed cooperating-writer model. Lock-order
coordination reduces deadlocks; it cannot eliminate deadlocks with arbitrary
external transactions. Read Committed is the expected integration configuration;
higher isolation levels can require transaction retries after serialization errors.

Cancellation locks the verified admin profile FOR SHARE, then the order FOR UPDATE,
then items/products in sorted ID order. Only Pending/Processing advance to
Cancelled. Already Cancelled returns its snapshot without incrementing stock again,
including legacy Cancelled records. Shipped/Delivered reject with P2003. Before any
increment, non-cancelled orders must have non-null checkout key and object request,
1–50 items, each quantity 1–10 and a non-null product. Aggregation restores variants
once per product (1–500 units), and the integer overflow guard prevents stock wrap.
Missing products or failed guards abort the entire operation.

These new cancellation guards correct two review findings: unproven historical
stock deductions and empty/invalid item histories. P2004 rejects legacy/manual or
malformed histories. The current Express route sanitizes P2004 as HTTP 503
`CANCELLATION_UNAVAILABLE`; no application route is changed by this preparation.
Operators must investigate, not repeatedly retry an ineligible legacy order. Never
manufacture checkout metadata to make it eligible. Metadata is provenance only
under the explicitly reviewed assumption that checkout is its sole writer.

Both functions are SECURITY INVOKER, have empty search_path and qualify application
tables with `public`. Built-ins use implicit pg_catalog resolution. Both accept a
trusted identity parameter; neither verifies a user's token/confirmed email itself.
Express validates normal Supabase identity, confirmed email, fresh database role,
and Origin/CSRF for writes. The service secret bypasses RLS and stays server-only.
Ordinary clients must have no effective EXECUTE privilege, including inherited or
default-grant paths. Owner/platform superusers remain trusted. Table grants and
RLS are preserved; the invoker must already have the required table/locking rights.
No grant repair or setting change is authorized by these instructions.

The backend signatures match exactly:

| Endpoint | RPC and named arguments | Return contract |
| --- | --- | --- |
| `POST /api/me/orders` | `customer_checkout(p_user_id uuid,p_key uuid,p_request jsonb)` | JSONB order belonging to verified customer, with items; Express allowlists the response |
| `POST /api/admin/orders/:id/cancel` | `admin_cancel_order(p_admin_id uuid,p_order_id text)` | JSONB matching requested ID, status Cancelled and items |

Checkout keys are UUID v4 at Express; the DB parameter is UUID. Order statuses are
the existing text CHECK values. Snapshots use the baseline order/item columns and
numeric(10,2) amounts. Cancellation needs checkout's two extra columns. Both need
the live schema/types/defaults/identity/FKs/triggers/grants to match their reviewed
baseline; this has NOT been verified against the shared database.

## Preflight expectations and stopping conditions

Run only SELECT queries from the preflight artifact using an authorized inspection
connection. Run P01–P04 first, then stop on any missing/different baseline object
before running queries that reference its columns. Do not paste private row data
or connection credentials into evidence. Counts/catalog metadata are sufficient.

| Query | Required result / stop condition |
| --- | --- |
| P01 | Approved target identity, supported PG with core UUID function and plpgsql, recorded original timeouts/isolation and relevant role/database defaults (zero override rows is allowed). Inspection-session defaults do not prove gateway runtime limits; validate actual service invocation in staging. Database name alone does not prove Supabase project identity; operator must match project reference privately. Stop on mismatch. |
| P02 | All 8 baseline relations exist as ordinary tables (`relkind=r`), RLS true, owners/forced-RLS known. Stop on schema surprises. |
| P03 | All baseline column names, types, nullability, defaults and identity match schema.sql. Monetary columns numeric(10,2); product stock integer; item identity bigint; snapshot fields non-null as declared. New metadata absent before first install. Stop on mismatch. |
| P04 | Validated expected PK/FK/check constraints; profiles ID references auth.users ID, products collection FK, order/item FKs and quantity/status constraints intact. Review deferrability/custom constraints; stop on unreviewed differences. |
| P05 | All required indexes valid/ready, baseline unique/default-address protections intact. Invalid index or unexpected object is a stop. |
| P06 | Zero rows before first deployment of BOTH files. Any column/index/function overload means conflict or prior/partial deployment: stop and identify state, not CREATE OR REPLACE. After checkout is installed, its objects are expected; verify exact V01–V06 results before installing cancellation and require no existing cancellation overload. |
| P07 | Only known/approved table/Auth triggers and rules. Internal FK triggers are normal; unknown inventory/status side effects block installation until reviewed. Fingerprints detect change, not correctness. |
| P08 | Reviewed existing policies preserved; baseline only public product/collection read policies. Additional existing policies need explicit review, not deletion. |
| P09 | Exactly anon/authenticated/service_role exist; ordinary roles are not superuser/bypass-RLS. Trusted service role bypass/RLS model confirmed. |
| P10 | Service schema/table/locking rights all true; table ACLs reviewed with RLS. UPDATE rights support row locking even where no record UPDATE occurs. Sequence information reviewed; identity INSERT under actual service_role must pass staging, rather than adding speculative sequence grants. |
| P11 | Creator/schema function default grants approved. Any extra role that would inherit EXECUTE must be addressed by a separately approved artifact or stop. Do not silently change defaults. |
| P12 | All dependencies and outside writers reviewed, including jobs/other developers and PL/pgSQL body uses not fully recorded by pg_depend. Unknown dependency or inventory writer is a stop. |
| P13 | settings_rows=1, singleton_rows=1, invalid_money_rows=0. Missing/invalid config blocks checkout. |
| P14 | Every invalid stock/money/size/missing-collection count=0. No automatic repair. |
| P15 | Every integrity count=0, including duplicate colors and cross-table orphans. Missing constraints may need a separately approved migration. |
| P16 | Invalid statuses/methods/amounts/quantities/orphans/missing products=0; orders_without_items=0 expected. Investigate legacy anomalies. |
| P17 | inconsistent_order_totals=0. Historical snapshots, not today's catalog prices, determine the comparison. |
| P18 | Before first install keyed_orders=0; invalid_metadata=0 and duplicate_customer_keys=0 always. Legacy eligible-status rows can exist but are explicitly ineligible for automated restock and require a documented disposition. Metadata presence before first install is a conflict. |
| P19 | Counts/sizes recorded and compatible with tested installation time; no lock contention/maintenance traffic. Defer on contention; do not terminate others' sessions or raise global limits. |

Capture V07 baseline counts/stock units before installing as well as after (it does
not depend on new columns). Equal aggregates are necessary, not sufficient proof
of unchanged individual rows: preserve an approved backup and use protected
row-level/hash comparisons where required, without printing private contents.

## Approval, backup and evidence gates

Before any shared deployment, record **all** of the following:

- Named database owner, backend owner and team approver sign-off explicitly covering
  this production-labeled shared project, both exact artifacts, new cancellation
  restrictions, retained request PII, quiet window and rollback owner.
- An actual recoverable backup/restore point with project ID, timestamp, retention,
  restore instructions, authorized operator and tested restore evidence to an
  isolated target. Cover schema, table data, inventory, Auth/profile associations,
  sequences, triggers/policies/grants and migration metadata. Verify backup capability
  exists for the project's plan; do not assume a dashboard label means a backup.
  Store backups/evidence privately. A backup is not permission to overwrite other
  developers' later changes.
- Successful preflight evidence on the approved target, no unresolved conflicts,
  approved effective grants, and coordinated external stock/order writers. Order
  items and checkout metadata must be immutable; Cancelled must never be reopened
  by direct writers. The existing schema has no independent restock ledger to protect
  against a privileged writer resetting Cancelled to Pending.
- Actual isolated PostgreSQL evidence for every staging case, including role denial,
  concurrency overlap/blocking, rollback, snapshots and once-only restock. Record
  PG version, schema source, isolation/runtime limits and test account/product IDs
  (disposable only), expected/actual counts/stock and timestamps. Redact tokens and
  contact/address values. Source/mock tests do not satisfy this gate.
- SHA-256 fingerprints of the approved on-disk files, schema snapshot and test
  evidence. In PowerShell, `Get-FileHash -Algorithm SHA256 -LiteralPath
  'server/db/proposed/checkout-orders.sql'` and the corresponding cancellation path
  are read-only ways to record them. Any subsequent edit invalidates approval.

`checkout_request` retains normalized contact/shipping selections and items without
TTL; snapshots retain historical contact/address data. Review access/retention and
backup handling. Removing old keys or request metadata can break safe replay and
must not be treated as routine cleanup. No payment secrets/card data belong here.

## Authorized deployment procedure — not performed

1. Complete the gates above; otherwise remain blocked. Verify exact project and
   approved artifact fingerprints again. Coordinate all developers and pause
   checkout/cancellation and competing inventory/order writes for the agreed window
   using the approved operational procedure. There is no new feature-flag system.
2. Record preflight and V07 baseline, plus original session timeouts. Do not rerun
   schema.sql, seed.sql or the address proposal. Use an approved administrator SQL
   connection that submits the whole file transaction in order and stops on error.
3. Submit **only** `checkout-orders.sql` once. Its BEGIN/COMMIT and SET LOCAL are
   already included; do not double-wrap, split into auto-committed statements or
   replace CREATE with IF NOT EXISTS. On any error, stop and ROLLBACK an open aborted
   transaction, then inspect the target state. An uncertain connection outcome
   requires read-only catalog verification, never blind rerun.
4. Verify V01/V02 and checkout's V03–V06 rows. Run invariant/policy comparisons and
   confirm V07 unchanged in the quiet window. Do not call the checkout RPC merely
   to verify installation. Confirm cache exposure through the existing backend
   only after approved smoke testing. Stop on unexpected grants/objects.
5. Submit **only** `admin-order-cancel.sql` once after checkout verification. Repeat
   failure handling. Verify V03–V06 now show exactly the two reviewed signatures
   and no unexpected overloads or effective EXECUTE paths. Confirm no record/stock
   baseline changed and V08 settings restored on the same connection.
6. Repeat P02–P05/P07–P19 as applicable. P06 deliberately now reports the installed
   objects; do not interpret those expected rows as fresh-install clearance.
   Verify other developers' policies/triggers/grants are unchanged. Preserve evidence.
7. Smoke tests default to isolated staging. Shared-project smoke writes require
   additional explicit approval for the exact disposable accounts/products and
   inventory cleanup/reconciliation; otherwise shared post-install checks stay
   read-only. Only after all approved checks pass should agreed traffic resume.

## Rollback and recovery — instructions only

An installation error before COMMIT requires ROLLBACK, not compensating record
writes. Check catalog state if the connection dropped around COMMIT. Each file has
its own transaction: failure installing cancellation does not undo a previously
committed checkout migration. Keep cancellation unavailable and decide with the
team whether validated checkout can remain or should also be withdrawn.

After a committed installation, stop affected API writes and drain in-flight calls
before permission changes. Inventory transactions must not race operational rollback.
Under separate rollback approval, inspect dependencies/effective grants and remove
cancellation first if withdrawing both capabilities. A reviewed capability rollback
template (DDL, **not** part of read-only verification) is:

```sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
revoke execute on function public.admin_cancel_order(uuid,text) from service_role;
drop function public.admin_cancel_order(uuid,text) restrict;
-- Include the next two statements ONLY if withdrawing checkout as well:
revoke execute on function public.customer_checkout(uuid,uuid,jsonb) from service_role;
drop function public.customer_checkout(uuid,uuid,jsonb) restrict;
notify pgrst, 'reload schema';
commit;
```

Use only statements applicable to confirmed installed objects. Failure/dependency
or timeout aborts rollback too: stop; never add CASCADE. Dropping both functions
also removes their individual grants but must not alter unrelated objects. Leave
checkout_key, checkout_request and the unique index in place with historical data.
Removing columns/index needs a separate reviewed data-retention/dependency plan.
Do not clear orders, delete idempotency records, reset stock or reopen Cancelled
orders. Capability rollback never reverses committed purchases/cancellations;
reconciliation requires per-order business approval. A whole shared-database restore
can erase other developers' work and is an incident-recovery decision, not this
routine rollback.

PostgreSQL references: [locking and deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html),
[effective privilege inquiries](https://www.postgresql.org/docs/current/functions-info.html),
and [transaction-local settings](https://www.postgresql.org/docs/current/sql-set.html).
Match documentation and tests to the actual installed PostgreSQL version.

## Local preparation evidence (not deployment approval)

The initial preparation run passed **127 backend tests and 87 frontend tests**; lint,
production build and `git diff --check` passed. New artifact tests enforce read-only
inspection statements and cancellation rejection/locking order; the existing
checkout/admin suites retain their RPC, money, idempotency and authorization
contracts. Those were local source/mock tests. A subsequent native PostgreSQL 16.13
suite has now passed **23 real checks**, including local preflight/postflight,
installation/runtime compilation, permissions, concurrency and rollback; see the
linked evidence. Supabase-specific integration and browser smoke cases remain
unverified, and shared backup/restore evidence/team approval are **NOT CONFIRMED**.

On-disk proposed SQL SHA-256 at preparation (not a signature of approval):

| File | SHA-256 |
| --- | --- |
| `checkout-orders.sql` | `13F0BF3381B2A5CCA3FE450FF7CEE5FCA1E78539AC49E27E24494685862A09B5` |
| `admin-order-cancel.sql` | `3D35DD62DCA2A83DF8886A6B2F8E40E48844A70C821BEB2F039610B260D553A7` |

Recalculate before approval and again before execution; even line-ending changes
alter these file fingerprints. Do not treat a matching hash as evidence that live
schema compatibility or staging tests have passed. Existing uncommitted application
work remains preserved; no commit, push, merge or branch switch was performed.
