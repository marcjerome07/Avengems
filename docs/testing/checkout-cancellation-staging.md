# Isolated PostgreSQL validation plan and local evidence

These are administrator-run test instructions. A separate native PostgreSQL run
has now executed 23 real engine checks; see
[local results and limitations](checkout-cancellation-local-results.md).
The full manual Supabase/browser plan below is not a completed test record. It creates/changes
DISPOSABLE staging records and must never be run against the shared production-
labeled database. The original plan was not executed during its preparation;
subsequent local execution and setup failures are recorded separately. Do not count
mocked tests as PostgreSQL evidence.

## Preconditions and fixture ownership

Obtain separate staging execution approval. Use a dedicated disposable Supabase
project or PostgreSQL database with the reviewed baseline schema, matching roles,
grants, RLS, triggers and runtime isolation, and no real customer data. A generic
local database missing the Supabase roles/permissions is not sufficient evidence.
Verify the project reference privately, not just `current_database()` (many Supabase
projects use the same database name). Restore/provision baseline separately; never
execute schema.sql as an upgrade on a shared database.

Provision two confirmed disposable customer accounts and one confirmed disposable
administrator through the separately authorized account process. Record only their
test UUIDs, never passwords/tokens. Do not promote a real user or insert fake Auth
rows. Verify profile roles and profile/Auth UUID links. Use an isolated baseline
with a unique `power` collection; if absent, stop and review fixture provisioning.
Apply checkout then cancellation to STAGING under their installation transactions,
run the read-only verification artifacts, and require exact effective privileges.

Examples use psql metacommands (`\set`, `\gset`) and `:'variable'` SQL literal quoting.
They are not directly executable in Supabase's SQL Editor. Run a private approved
connection; never embed connection secrets in scripts/evidence. In EACH session set
the following placeholders to **staging disposable IDs** before executing tests:

```text
\set ON_ERROR_STOP on
\set customer_a '__STAGING_CUSTOMER_A_UUID__'
\set customer_b '__STAGING_CUSTOMER_B_UUID__'
\set admin_id '__STAGING_ADMIN_UUID__'
```

Unsubstituted placeholders intentionally fail UUID conversion. For an EXPECTED SQL
error, submit that statement interactively and then ROLLBACK before continuing;
ON_ERROR_STOP stops a script on that error. Do not turn an expected failure into
an unnoticed script continuation or a claimed passing assertion.

After verifying the isolated target and fixture IDs do not already exist, an
authorized staging administrator may create this fixture once. No ON CONFLICT
overwrite is provided. All products belong exclusively to this test run:

```sql
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
insert into public.products(id,slug,name,type,stone,material,price,stock,
  customizable_size,customizable_color,customization_fee,sizes,default_size)
select id,id,'Disposable audit fixture','Ring','power','925 Sterling Silver',100.10,units,
  true,true,100.00,array['US 5','US 6'],'US 5'
from (values
  ('audit-last-unit',1),('audit-repeat',10),('audit-insufficient',1),
  ('audit-variants',5),('audit-cancel',10),('audit-race',1),
  ('audit-cancelrace',10),('audit-rollback-a',10),('audit-rollback-b',10),
  ('audit-overflow',2147483647),('audit-snapshot',10),('audit-failure',10)
) fixture(id,units);
update public.store_settings set shipping_fee=10.00,free_shipping_threshold=500.00 where id=1;
commit;
```

Stop if the settings UPDATE did not affect exactly one row. These settings changes
are isolated fixture setup, never shared configuration. After the suite, discard
the dedicated environment via its approved lifecycle rather than deleting arbitrary
orders or resetting shared stock.

For each case define an exact request in both participating sessions, changing only
the specified fixture product/quantity. This canonical example is deliberately
non-private contact/shipping data and uses no real payment method integration:

```text
\set request '{"items":[{"productId":"audit-last-unit","quantity":1,"color":null,"size":"US 5"}],"customer":{"name":"Audit Customer","email":"audit@example.test","phone":"09171234567"},"shipping":{"address":"Disposable test street","city":"Test City","province":"Test Province","postalCode":"1000"},"paymentMethod":"cod"}'
```

Template for a committed successful RPC as the actual database invoker role:

```sql
begin;
set local role service_role;
set local lock_timeout='10s';
set local statement_timeout='30s';
select public.customer_checkout(:'customer_a'::uuid,
  'a0000000-0000-4000-8000-000000000001'::uuid,:'request'::jsonb)->>'id' as order_id \gset
commit;
```

For later cases change the key to a fresh UUID v4, recording it and the returned
`order_id`. These fixed examples are for a fresh disposable suite only. Never reuse
an environment's old keys as if they were new test purchases. `\gset` avoids dumping
contact snapshots into the test log. Compare only fixture-filtered counts/stock.

## Checkout tests

**T01 — Last unit, two different customers.** Use audit-last-unit and quantity 1.
Session A runs the template SELECT but leaves its transaction open before COMMIT.
Start session B as service_role with the same request, customer_b and key
`a0000000-0000-4000-8000-000000000002`. B must actually overlap/block. A commits
within the staging lock timeout. B must fail with P1002, then ROLLBACK. If B wins
instead, swap winner/loser expectations. Exactly one persisted order/item and stock
0; no negative stock. Record blocking in an independent inspection session using
pg_locks/pg_blocking_pids, without query text or private values. Two sequential calls
are not concurrency evidence. If a test times out instead, record it, roll back and
rerun in a fresh fixture/environment with controlled overlap; it is not a stock-test
pass by itself.

**T02 — Simultaneous duplicate, same customer/key/request.** Use audit-repeat,
quantity 2, key `a0000000-0000-4000-8000-000000000003` in both sessions. Hold A open,
start B and establish overlap, then commit A. Both calls must return the same ID;
one order, one item with quantity 2, stock 8. Replay after commit must still return
that ID without another decrement (simulated lost HTTP response). The same key with
quantity 3 must raise P1001, leaving stock/counts unchanged. A JSONB-equivalent
request with object key order changed is equal; changed array contents/order is a
different normalized request. The Express API supplies normalized request values.

**T03 — Insufficient/invalid quantity.** Use audit-insufficient with quantity 2
and a fresh key: P1002, no new order/items/metadata, stock 1. In separate rolled-back
attempts try 0, -1, 1.5, 11, string "1", null and missing quantity: P1006 or the
documented validator error, no DML survives. Test duplicated identical variants
and aggregate quantities exceeding stock across different sizes as well.

**T04 — Exact money/settings/colors/snapshots.** Verify the default unit is
100.10 and quantity-1 total is 110.10 with the fixture settings. Quantity 5 reaches
500.50 and has zero shipping. A changed US 6 size adds 100.00 per unit. In isolated
transactions, set each configured numeric input to NaN (or negative where its
constraint allows it), call checkout and require rejection with unchanged counts/
stock, then ROLLBACK. Test invalid unused customization and free-order shipping
configuration too. Native constrained numeric(10,2) may reject infinity on assignment;
do not weaken constraints. Validate the predicate separately with native values:

```sql
select amount::text,amount::text ~ '^[0-9]{1,8}([.][0-9]{1,2})?$' as valid_money
from (values (0::numeric),(0.01::numeric),(99999999.99::numeric),
  ('NaN'::numeric),('Infinity'::numeric),('-Infinity'::numeric),(-1::numeric)) v(amount);
```

Expected: first three true, remaining four false. NULL is rejected by the function's
separate null guard. In disposable transactions add a collection with a duplicate
selected color, or use a missing color: ambiguous color rejects (P0001), unsupported
color P1004. Roll back the collection change. Interleave a committed collection
insertion in a second session around resolution; confirm one-statement count/value
consistency without claiming a single catalog snapshot for all lines. Existing
collection UPDATE/DELETE must wait for share locks; INSERT need not. Record timing.
Create an audit-snapshot order, then separately edit its product name/price/defaults
and saved-address/contact fixture. Persisted order/item snapshots/totals must stay
unchanged. Replay the original key returns the original snapshot; cross-owner saved
address rejects P1005. Do not compare historical totals to new product prices.

**T05 — Force rollback after inventory mutation.** Request audit-rollback-a and
audit-rollback-b, quantity 1 each, with a fresh key. Record stock 10/10 and baseline
counts. Build the two-item request below, then in a staging administrator transaction install the fault, switch
locally to service_role, and call checkout. The second product update fails after
order/items and the first stock mutation have occurred. Then ROLLBACK the aborted
transaction, removing both fault objects automatically:

```sql
select jsonb_set(:'request'::jsonb,'{items}',
  '[{"productId":"audit-rollback-a","quantity":1,"color":null,"size":"US 5"},
    {"productId":"audit-rollback-b","quantity":1,"color":null,"size":"US 5"}]'::jsonb)::text as rollback_request \gset
begin;
set local lock_timeout='10s';
set local statement_timeout='30s';
create function public.__audit_fail_second_stock() returns trigger language plpgsql as $$
begin
  if new.id='audit-rollback-b' then raise exception 'STAGING stock fault'; end if;
  return new;
end;
$$;
create trigger __audit_fail_second_stock after update on public.products
for each row execute function public.__audit_fail_second_stock();
set local role service_role;
select public.customer_checkout(:'customer_a'::uuid,
  'a0000000-0000-4000-8000-000000000005'::uuid,:'rollback_request'::jsonb)->>'id';
-- EXPECTED ERROR; then issue ROLLBACK as a separate command.
```

Expected after rollback: both stocks 10, no matching customer/key order, unchanged
order/item counts, no test fault function/trigger. No orphan item or reserved key
survives. Identity sequences may have gaps. Also inject an AFTER INSERT item fault
and verify the same invariant at the earlier boundary. A source/mock assertion that
throws an error is not proof of PostgreSQL rollback.

## Cancellation tests

For a fixture order created and COMMITTED by checkout, record its ID as
`\set cancel_id 'RETURNED_DISPOSABLE_ORDER_ID'`. Call cancellation as service_role
in its own transaction, passing the disposable admin UUID:

```sql
begin;
set local role service_role;
set local lock_timeout='10s';
set local statement_timeout='30s';
select public.admin_cancel_order(:'admin_id'::uuid,:'cancel_id')->>'status' as status;
commit;
```

**T06 — Cancel/repeat/aggregate variants.** Checkout audit-cancel quantity 2:
stock 10→8. Cancel: Pending→Cancelled and stock 8→10. Repeat: same order/status/items,
stock stays 10. Repeat after discarding the first cancellation HTTP response too.
Using audit-variants, buy US 5 quantity 2 and US 6 quantity 1 in the same order:
stock 5→2; cancellation restores 3 units once (2→5), not once per line with duplicate
product totals. Total before cancellation is **410.30** (base 300.30 + customization
100.00 for the single changed-size unit + shipping 10.00), and stored snapshots
remain unchanged on cancellation.
Do not treat cancellation as deletion of an order or a cash refund. Replay checkout
after cancellation with its original key/request must return that same Cancelled
order, not decrement stock or create a replacement. A new purchase needs new intent/key.

**T07 — Two simultaneous cancellations.** Hold A's successful cancellation
transaction open, start B with the same admin/order, prove B blocks, then commit A.
B returns Cancelled with no second increment. Repeat with two different disposable
admins if available. Stock returns exactly to its original value; one order remains.

**T08 — Cancellation vs fulfillment.** Prepare a checkout order on audit-cancelrace
and advance Pending→Processing using the real admin status API. Race cancellation
against the actual Processing→Shipped conditional update. If cancellation wins,
the conditional shipping update affects no row/returns 409 and inventory is restored.
If shipping wins, cancellation raises P2003/409, order is Shipped and stock remains
deducted. Run both commit orderings with fresh orders. Shipped/Delivered cannot
cancel; non-admin identity P2001; missing order P2002. Any other outcome is a blocker.

**T09 — Cancellation vs checkout / lock order.** First buy the only audit-race unit.
Overlap cancellation of that order and another customer's purchase of the same
product. If checkout sees zero first it fails P1002 and cancellation leaves stock 1;
if restock commits first, checkout may succeed and stock ends 0. Always verify
`initial stock − quantities in non-cancelled successful orders = final stock` for
this isolated product. Run two-product requests in reverse client array order to
exercise sorted database locking. Detect/review deadlocks or serialization failures;
failed transactions must leave no partial records or stock mutations.

**T10 — Cancellation rollback after restoration/status update.** First create a
committed two-product order on the rollback fixtures without faults. Record deducted
stock and Pending status. Reuse the stock fault transaction from T05 but call
admin_cancel_order instead: failure after the second restock must leave BOTH stocks
deducted and order Pending after ROLLBACK. In a second isolated transaction use an
AFTER UPDATE OF status trigger on orders to raise when new.status='Cancelled';
failure after the status change must also roll back all restorations. Install and
remove the fault within the same rolled-back transaction. Verify no fault objects
remain and that a later fault-free cancellation works once.

Concrete status-boundary fault transaction for a committed disposable `cancel_id`
(issue ROLLBACK after the expected error):

```sql
begin;
set local lock_timeout='10s';
set local statement_timeout='30s';
create function public.__audit_fail_cancelled_status() returns trigger language plpgsql as $$
begin
  if new.status='Cancelled' then raise exception 'STAGING cancellation status fault'; end if;
  return new;
end;
$$;
create trigger __audit_fail_cancelled_status after update of status on public.orders
for each row execute function public.__audit_fail_cancelled_status();
set local role service_role;
select public.admin_cancel_order(:'admin_id'::uuid,:'cancel_id')->>'status';
-- EXPECTED ERROR; then ROLLBACK as a separate command and verify stock/status.
```

**T11 — Legacy/malformed/overflow guards.** In separate disposable transactions,
temporarily null a checkout order's metadata or remove its items, then call
cancellation: P2004, no stock/status change; ROLLBACK restores fixture modifications.
Quantity constraints must reject attempts to store 0/11/null; do not drop constraints
to make corrupt rows. The new SQL guards also reject malformed stored histories.
For audit-overflow, checkout one unit then deliberately set that TEST product back
to 2147483647 inside a disposable transaction and attempt cancellation. Require an
error with no partial restock/status update; ROLLBACK also undoes the deliberate
fixture mutation. A previously Cancelled order with null legacy metadata must replay
without adding stock. Never reopen Cancelled or forge provenance in shared data.

## Privileges, installation failure and browser smoke tests

**T12 — Effective roles and backend security.** First run V04/V05 without calling
functions. In separate staging transactions `SET LOCAL ROLE anon` or authenticated
and invoke each function using disposable IDs: require 42501 permission denied.
ROLLBACK after each attempt, including if a test unexpectedly succeeds. service_role
must execute with its real table/sequence rights and RLS configuration. Exercise
the Express endpoints with anonymous/customer/unconfirmed users, forged role/owner
fields, missing Origin/CSRF, cross-owner order/address IDs and privileged recovery
tokens: fail closed, no fixture DML. SQL profile checks alone do not prove HTTP auth.

**T13 — Installer atomicity/repeatability/timeouts.** Use separate fresh staging
databases: hold a conflicting orders lock in session A, apply checkout in B and
confirm the 5-second lock timeout leaves no columns/index/function/grants after
ROLLBACK. Test the bounded statement timeout in an approved isolated transaction;
record timeout originals/restoration, never increase global settings. Create a
deliberate object conflict in another fresh fixture and confirm installation aborts
without partial DDL. Repeating an already installed migration must fail safely,
not replace it. Failure installing cancellation leaves prior committed checkout
intact. Use real runtime limits and record transaction retries/errors. A function
can be created successfully yet still fail to plan its SQL on first invocation.

**T14 — Browser/API smoke, STAGING ONLY by default.** Point a separately configured
local app at the dedicated staging project (never edit or expose shared credentials).
Use existing disposable accounts/products. Quote/default/customized items, select
owned/manual shipping, submit demo COD checkout, inspect customer order/confirmation
and admin detail snapshots. Submit duplicate/lost-response retries with the same
UUID v4 Idempotency-Key. Cancel a Pending order through its admin action; reload and
verify one restoration. Test forward fulfillment and forbidden cancellation. Confirm
archiving, stale-stock admin edits and reports still behave correctly. No real charge,
fulfillment or refund is implemented. Shared-project smoke writes require distinct
team approval for exact disposable accounts/products and reconciliation scope;
otherwise verification there remains read-only.

## Evidence record and approval decision

For EACH T01–T14 record: actual date/operator; isolated project identity; PostgreSQL
version/schema/artifact SHA-256; actual role/isolation/runtime limits; disposable
fixture/key IDs; session overlap/commit ordering; expected versus observed SQLSTATE,
order/item counts and stock; pass/fail; and fault cleanup. Keep contact data, Auth
metadata, credentials and token/cookie headers out of evidence. Record both success
and failure rollback observations; sequence gaps are allowed.

Use fixture-filtered queries, for example (post-install, test IDs only):

```sql
select id,stock from public.products where id like 'audit-%' order by id;
select count(*) as orders,count(distinct checkout_key) as keys
from public.orders where user_id in (:'customer_a'::uuid,:'customer_b'::uuid);
select count(*) as items from public.order_items i join public.orders o on o.id=i.order_id
where o.user_id in (:'customer_a'::uuid,:'customer_b'::uuid);
select status,count(*) from public.orders
where user_id in (:'customer_a'::uuid,:'customer_b'::uuid) group by status;
```

**Current evidence: 23 local PostgreSQL checks passed; full Supabase/browser plan
not completed.** See the linked results for exact executed cases and remaining gaps.
All failures, missing evidence or environment differences remain approval blockers.
Do not mark staging passed based on this document, application mocks or SQL-file tests.
