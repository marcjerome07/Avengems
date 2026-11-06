# Remaining Supabase-specific evidence and approvals

**All cases below are pending actual Supabase staging evidence unless explicitly
noted. No shared connection, migration or record mutation is authorized here.
CUSTOMER_ORDER_CANCELLATION_ENABLED stays disabled.** The existing 33-check local
PostgreSQL PASS report is engine evidence with minimal Auth/role adapters, not a
Supabase Auth/PostgREST/browser acceptance record. The newly strengthened inspection
scripts still need syntax/execution validation in an approved isolated environment.

Use a separate disposable Supabase project matching the shared schema, extensions,
custom triggers, function/table defaults, policies, role grants, isolation and
representative data volume. No real customer data is needed. Accounts/products must
be disposable and provisioning requires its own approval. Never promote a real user
or copy production secrets into logs, fixtures or source.

| Case | Evidence still required | Expected outcome |
| --- | --- | --- |
| S01 Target/schema | Project reference and PG version, current F01–F07 queries, complete live schema/trigger/grant/default/dependency review | Exact approved baseline; no conflicts or unknown writers; all expected booleans/counts correct |
| S02 Default-ACL model | Create equivalent default-grant conditions only in approved staging; review counter and function effective privileges | No unexpected client/custom executor; service counter rights exactly S/I/U. Broader creator defaults are a stop requiring reviewed correction/decision |
| S03 Auth boundary | Genuine confirmed customer A/B, confirmed admin and unconfirmed disposable user through actual Supabase Auth | Verified IDs map to profiles; metadata/browser roles cannot grant access; recovery-only token denied; no real account promotion |
| S04 Disabled gate | Real application requests with server flag absent/false, before/after RPC installation; missing/failed version lookup simulated only in isolated staging | Detail canCancel=false, disabled action; POST 503 with no database mutation. Function version alone never enables customer action |
| S05 Gateway/cache | Actual secret-client role, named RPC arguments, PostgREST cache reload and current G00 metadata/privilege queries | customer_cancel_order(uuid,text) returns JSONB, version() integer; no ambiguous overload/cache error; role maps to trusted service_role |
| S06 Positive customer HTTP flow | Confirmation/keep/confirm, cookie session, owner-scoped ID and current role | One cancellation and exact restoration; customer B receives 404. **Requires a separately approved temporary enablement on the isolated staging app, outside this task; shared flag stays off** |
| S07 CSRF/session denial | Missing/wrong Origin, CSRF, cookies, expired credentials, wrong role, forged ownership/status/quantity | Fail closed without order/stock mutation; HttpOnly/Secure/SameSite and fresh role checks retained |
| S08 Status/provenance | Pending/Processing successes; Shipped/Delivered/Cancelled and legacy/manual histories | Only eligible own checkout-backed orders can cancel; replay 409, no second restoration; no invented provenance |
| S09 Multi-connection races | Customer/customer, customer/admin in both orders, cancellation/fulfillment in both orders and checkout/restock via real gateway/pool | Actual overlap recorded; one restoration; one terminal outcome; failed transactions leave no partial stock/status changes |
| S10 Lost/failed responses | Disposable network interruption and approved transaction faults after stock/status writes | Reload establishes committed state; no blind network write retry/false success; customer replay denied, admin replay unchanged |
| S11 References/backfill | Actual trigger/grant model, empty and existing legacy orders, unchanged field fingerprints, simultaneous checkouts and retry keys | G04–G07 pass before traffic; unique yearly labels; no internal-ID/FK/idempotency/snapshot/stock change; deterministic legacy assignment |
| S12 Year/width/immutability | Disposable fixture timestamps around UTC rollover, >9999 references, attempted override and counter failure/overflow | UTC year, fresh yearly counter, at least 4 digits with no truncation; overrides denied; failed checkout rolls back allocation and stock |
| S13 Volume/timeouts | Representative generated-column rewrite, index and backfill; competing lock plus installation failures on disposable targets | Bounded installation errors roll back that file; session settings restored; no partial DDL/data publication; quiet-window budget measured |
| S14 Browser/presentation | Actual customer confirmation/My Orders/detail and admin list/detail/dashboard, mobile legacy/missing/long labels | Labels display but URLs/actions retain internal IDs; cancelled progress replaces shipment steps; no refund claim; error/loading and gate states correct |

S06 and positive UI cancellation checks cannot be marked passed while the staging
application flag is disabled; record them as blocked pending their separate staging
enablement approval. No such enablement is performed or authorized by this package.
SQL service_role fixture tests can independently validate engine invariants in
approved staging, but do not replace cookie/CSRF/browser evidence.

## Approvals and records to collect

1. Named staging owner approval: exact disposable project, accounts/products,
   fixture writes/faults, environment differences, timeout tests and cleanup plan.
2. Separate approval for temporary staging-app feature activation if S06/S14 need
   it; current/shared activation is excluded. Return staging to disabled afterward
   under its approved procedure.
3. Database/backend/team sign-off on exact new SQL SHA-256, existing deployed
   function revisions, default/inherited privilege model, all staging results,
   unresolved findings and backfill volume/lock budget.
4. Confirmed recoverable shared backup/restore point, isolated restore rehearsal,
   retention, operator and recovery decision scope protecting other developers.
5. Explicit production-labeled shared INSTALLATION approval with target, timestamps,
   artifact hashes, maintenance/writer coordination, operator and incident plan.
   This is not approval for shared smoke writes or customer activation.
6. Distinct authorization for any shared disposable-data smoke writes and cleanup/
   reconciliation; without it, shared postflight remains read-only.
7. Customer-feature activation approval is a later separate task. Leave the flag
   disabled throughout this package and installation runbook.

Each result needs date/operator, project reference, actual server/runtime version,
exact hashes, invocation role/isolation, disposable fixture IDs, expected/actual
status or SQLSTATE, before/after counts/stock/fingerprints, overlap/commit ordering,
and pass/fail/blocker. Omit passwords, tokens, cookies, secret keys and private
contact/address data. Record cleanup and whether faults/defaults were removed from
the disposable environment. No evidence file or approval was supplied for these
platform checks during this preparation; mark missing items pending, never PASS.
