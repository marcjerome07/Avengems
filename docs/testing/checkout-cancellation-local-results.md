# Executed local PostgreSQL checkout/cancellation validation

**Result: 23 checks passed, 0 failed on the final complete run.** These were real
PostgreSQL transactions, not injected RPC responses or JavaScript simulations.
Shared Supabase deployment remains blocked; local engine evidence does not verify
the shared project's schema, grants, gateway, backup or approval.

## Environment and reproducibility

- Installed native PostgreSQL **16.13** (`server_version` queried from the running
  disposable server), Read Committed isolation, Windows. Docker was installed but
  was not needed or started.
- A new `initdb` cluster was created in a unique `avengems-pg-stage-*` temporary
  directory. It listened only on `127.0.0.1`, on an independently allocated port.
  `avengems_orders_stage` was created only after checking the server's data directory,
  loopback address, port and initial database against the newly created cluster.
- The harness never loads dotenv, Supabase SDKs or application credentials. It
  removes inherited PG/Supabase/database connection environment settings, uses
  explicit loopback connection arguments, disables psql startup files and does not
  offer a remote/existing-database connection option. Local trust authentication is
  limited to this disposable loopback cluster; do not use that configuration for a
  persistent/shared environment.
- The unmodified `server/db/schema.sql` was applied to the empty database. No seed.sql
  or address mutation migration was applied. Checkout was installed first, verified,
  then cancellation. Both exact proposal hashes still match the reviewed manifest.
- A minimal disposable `auth.users(id,raw_user_meta_data)` adapter supplies only
  the FK/registration-trigger interface required by schema.sql. It is not a running
  Supabase Auth service. Two synthetic customer profiles and one synthetic admin
  profile, collections/products/addresses/settings exist only in this new database.
  No real account was registered, promoted or modified.
- Local NOLOGIN anon/authenticated roles, an NOLOGIN BYPASSRLS service_role and an
  NOINHERIT authenticator model invoker/RLS boundaries. Explicit fixture grants make
  the reviewed baseline usable. They are not evidence of actual Supabase privileges.
- The final run occurred **2026-11-06 21:08:41–21:09:02 UTC**
  (**2026-11-07 05:08:41–05:09:02 Asia/Singapore**).
- All owned temporary servers were stopped. Synthetic on-disk cluster files remain
  in their recorded temporary directories; no recursive cleanup or existing-server
  shutdown was performed.

Reproduce with installed local tools, from the repository root:

```powershell
node server/scripts/validate-order-postgres.mjs --pg-bin 'C:\Program Files\PostgreSQL\16\bin'
```

Each invocation creates its own cluster/database; it must never be adapted to point
at shared Supabase. It writes the latest report to
[`evidence/order-postgres-local.json`](evidence/order-postgres-local.json).
Preserve that report before rerunning if its historical evidence is required.
The report includes SQL/schema/harness SHA-256, actual server version, isolation,
timestamps, case results, observed lock waits and cleanup outcome.

## Tests actually executed

| # | Real PostgreSQL check | Result |
| --- | --- | --- |
| 1 | Preflight SQL executes against the isolated baseline; target function conflicts absent | PASS |
| 2 | Checkout installation succeeds, exact named signature, no order/item changes | PASS |
| 3 | Cancellation installation succeeds after checkout, exact signature, no order/item changes | PASS |
| 4 | Postflight executes; JSONB return, invoker security, empty search_path, valid unique index, effective EXECUTE rights | PASS |
| 5 | Checkout creates one order/item, deducts quantity 2 (10→8), exact 210.20 total | PASS |
| 6 | Insufficient stock P1002 leaves stock and order/item counts unchanged | PASS |
| 7 | Invalid quantities and empty carts P1006 leave no persistent changes | PASS |
| 8 | Same-key replay keeps one order; changed contents P1001 | PASS |
| 9 | Concurrent last-unit buyers: observed lock wait, one winner/one P1002, stock 0 | PASS |
| 10 | Concurrent same-key requests: observed lock wait, same order ID, one decrement | PASS |
| 11 | Injected second-stock-update fault rolls back order/items and BOTH deductions | PASS |
| 12 | Historical product/address/pricing snapshots and replay survive later fixture edits | PASS |
| 13 | Cancellation aggregates two size variants, restores 3 units once, snapshots unchanged | PASS |
| 14 | Repeated cancellation restores no additional stock | PASS |
| 15 | Concurrent cancellation: observed lock wait, one restoration | PASS |
| 16 | Cancellation versus conditional fulfillment: observed overlap in both commit orders, no conflicting status/stock outcome | PASS |
| 17 | Cancellation versus another customer's checkout: observed lock wait, exact final stock | PASS |
| 18 | Admin/status/provenance/missing-item guards reject safely (P2001–P2004) | PASS |
| 19 | Injected fault after Cancelled status update rolls back status and restoration | PASS |
| 20 | Restocking overflow fails without retaining fixture mutation or cancellation | PASS |
| 21 | Actual anon/authenticated RPC attempts denied 42501; RLS hides private orders | PASS |
| 22 | Native NaN/infinity predicate behavior, invalid monetary config and ambiguous colors reject safely | PASS |
| 23 | Blind repeat of each installer fails without changing records | PASS |

Concurrent cases use separate live psql sessions, leave the first transaction open,
and query pg_stat_activity for an actual second-session lock wait before committing
the first. Rollback faults run inside transactions that also install their temporary
test triggers, so failure/connection teardown removes the fault objects. Object
absence and unchanged stock/order/item state are asserted afterward. Sequence gaps
are allowed and are not counted as failed rollback.

Preflight/postflight SQL was actually executed **locally**. Query execution success
is not a complete assertion/review of every catalog output and is not a shared-
project preflight pass. Exact required function metadata/effective privilege/index
results are explicitly asserted in case 4.

## Earlier setup attempts and failures

After the final native PostgreSQL run, the full existing backend regression suite
was executed again: **127 tests passed, 0 failed**. `npm run lint`, `npm run build`
and `git diff --check` also passed. These are recorded separately from the 23
native PostgreSQL checks; frontend service tests were not rerun for this local
harness/documentation change.

Two harness-only setup issues preceded the successful runs; neither reached
baseline/migration installation or transaction tests:

1. Windows pg_ctl exited while its server retained inherited pipe handles. Waiting
   for the child's `close` event stalled startup handling. The exact owned temporary
   server was manually stopped, with pg_ctl confirming shutdown. The old harness
   then reported a failed connection and failed redundant stop because the server
   was already stopped. Fix: wait for pg_ctl `exit` and close its inherited pipes.
   Original report: [startup attempt](evidence/order-postgres-local-startup-attempt.json).
2. The loopback safety assertion compared the inet text `127.0.0.1/32` to
   `127.0.0.1`. No SQL fixture/migration ran. The owned server stopped successfully.
   Fix: compare PostgreSQL `host(inet_server_addr())` instead.
   Original report: [identity attempt](evidence/order-postgres-local-identity-attempt.json).

The first complete suite then passed 19/19 checks; its report is preserved as
[first complete run](evidence/order-postgres-local-first-complete.json).
The expanded final suite passed 23/23. No proposed migration correction was needed;
their reviewed hashes were preserved. Setup failures are not omitted or represented
as passing migration tests.

## Remaining evidence and deployment blockers

- Actual shared-project P01–P19 outputs, live schema/custom triggers/default grants/
  dependencies and effective privileges remain unverified. No shared connection
  was made by this work.
- Real Supabase Auth/PostgREST role switching, gateway schema cache, cookie/CSRF
  browser flows and provider-driven account provisioning still need approved
  disposable Supabase staging integration. Application mocked tests alone do not
  satisfy that platform gate.
- The complete manual T01–T14 plan has not been executed in full. Installer lock/
  statement-timeout fault tests, broader collection-insertion interleavings and
  browser smoke tests are not established by these 23 local checks.
- Recoverable shared backup/restore evidence, named team approval for the exact
  migration hashes, maintenance window and external-writer coordination remain
  required. Do not reopen Cancelled orders or manufacture legacy checkout metadata.

Next safe step: review this local evidence, obtain authorized read-only shared
preflight and backup/restore evidence, then run the remaining platform-specific
tests in a separately approved disposable Supabase staging project. Only explicit
team approval after those gates can authorize shared deployment.
