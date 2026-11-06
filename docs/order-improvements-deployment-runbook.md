# Forward order migrations: approval and installation runbook

**NOT AUTHORIZED FOR SHARED INSTALLATION. Keep CUSTOMER_ORDER_CANCELLATION_ENABLED
unset/false throughout this runbook.** This document prepares an administrator's
future work; it executes nothing. No shared connection, SQL execution, setting or
record change was made during this preparation. The branch remains backend-mariel.

## Exact files and evidence boundary

1. Single pre-install inspection file: `docs/sql/order-improvements-preflight.sql`.
2. Migration-specific verification file: `docs/sql/order-improvements-postflight.sql`.
3. This runbook: `docs/order-improvements-deployment-runbook.md`.
4. Remaining platform evidence/approvals: `docs/order-improvements-staging-checklist.md`.

The only proposed installation files, in the validated local order, are:

1. `server/db/proposed/customer-order-cancel.sql`
2. `server/db/proposed/order-display-references.sql`

The first requires installed checkout metadata. The two new files are mutually
independent; the second does not replace any checkout/cancellation RPC. Do not run
schema.sql, seed.sql, checkout-orders.sql, admin-order-cancel.sql or address SQL.
The user reports the original checkout/admin functions are already installed; the
actual shared definitions have not been queried here. Leave those artifacts intact.

The existing [local PostgreSQL report](testing/evidence/order-improvements-local.json)
records 33 PASS/0 FAIL on PostgreSQL 16.13, including real races, rollback, legacy
backfill and reference allocation. Its four proposed-SQL hashes match current
files. It uses a minimal local Auth/role adapter, not actual Supabase Auth/PostgREST.
**The inspection scripts were strengthened after that run. Their current revisions
have not been executed against PostgreSQL.** Source-contract tests are not native
SQL syntax/permission/integration evidence. No migrations were executed in this
documentation/inspection-script preparation.

Record/reconfirm these SHA-256 values before separate approval and execution:

| Artifact | SHA-256 |
| --- | --- |
| customer-order-cancel.sql | `342C1B5956183D2FAF07EDD4652D54C79968E4691937CBE0B4379A7FEBD1BF4A` |
| order-display-references.sql | `1570D41DC0A8203176A9F8BA45B2BCC9403E65E2F0285C51EBD4C5FC6943F1C6` |
| Existing checkout-orders.sql — do not edit/rerun | `13F0BF3381B2A5CCA3FE450FF7CEE5FCA1E78539AC49E27E24494685862A09B5` |
| Existing admin-order-cancel.sql — do not edit/rerun | `3D35DD62DCA2A83DF8886A6B2F8E40E48844A70C821BEB2F039610B260D553A7` |

On Windows use `Get-FileHash -Algorithm SHA256 -LiteralPath <reviewed-file>`.
Any byte change, including line endings, invalidates that artifact's approval.
Canonical body MD5 values in inspection SQL are only change indicators normalized
for CRLF/outer whitespace; they do not replace SHA-256 artifact approval, source
review or execution tests. A deployed-body mismatch means inspect the revision,
not replace an installed function automatically.

## Pre-installation gates and expected output

An authorized administrator must confirm the Supabase project reference privately,
not just database name (projects can share a database name). Never paste connection
strings, secret keys, Auth/session metadata or customer records into evidence.
Both inspection files contain SELECT/CTE inspection only, with no business RPC
invocation or mutation. Run sections in order; STOP at a failed prerequisite.

| Section | Required results and stopping conditions |
| --- | --- |
| F01 | Intended project/inspection role, supported PG and core UUID function; exact two existing signatures, named arguments, JSONB scalar, invoker, empty search_path, approved owner, reviewed body matches=true, no_overloads=true. Record original session timeouts/isolation. Stop on a missing function or revision mismatch. |
| F02 | **Zero rows**: no new functions/overloads, counter table/index, reference columns or trigger-name conflicts. Any row means prior/partial installation or collision; inspect, never rerun blindly. |
| F03 | Seven required relations exist as ordinary tables, expected RLS/owners, every explicit column/type/nullability matches=true. Review all validated PK/FK/CHECK constraints; profiles.id→auth.users.id, orders.user_id→profiles.id, item order/product FKs, quantity 1–10 and stock≥0 must remain intact. Status CHECK contains Pending/Processing/Shipped/Delivered/Cancelled. Verify order item bigint identity/default and existing unique customer/key index, predicate and readiness. Any difference/unvalidated constraint is a stop pending review. |
| F04 | Record enabled/internal flags, function identities and fingerprints for order/item/product triggers. Internal FK triggers are expected. No unreviewed UPDATE/INSERT rule/trigger may run during backfill and alter status, inventory, timestamps, snapshots or external services. Stop on unknown side effects. |
| F05 | Record exact existing order count, volume and ineligible legacy count. Invalid years, quantities, stock, status, provenance pairs, missing parents/products must be zero. Orders without items require a documented disposition, not deletion. Legacy Pending/Processing rows can exist but must stay ineligible; never manufacture metadata. Representative staging must fit rewrite/backfill/index work within reviewed per-statement limits. |
| F06 | All three roles exist. anon/authenticated are not superusers/bypass-RLS; trusted service_role model verified. Six existing-RPC privilege rows: service=true, ordinary roles=false. Required table/schema/locking rights true. Default creator grants, inherited roles, table ACLs, RLS/policies and dependencies approved. Catalog dependencies are incomplete for PL/pgSQL/external writers; review those separately. |
| F07 | In a coordinated quiet window record order/item counts, total units, original-field/item/inventory hashes and lock state. Defer on contention or active competing writers. Save the hashes privately for G07. |

**Specific default-grant stopping condition:** the current reference migration
revokes PUBLIC/anon/authenticated rights, but does not revoke prior/default rights
from service_role before granting SELECT/INSERT/UPDATE. If the actual creator's
default ACL includes service_role DELETE/TRUNCATE/REFERENCES/TRIGGER rights, those
may survive. Any such effective rights conflict with the narrow expected privilege
model in G03. Stop BEFORE installation and obtain a separately reviewed correction
to the new proposal or an explicit reviewed privilege-model decision. Do not repair
global default grants, relax the check or modify an installed old migration in this
task. Other unexpected default/inherited grantees are also stops. Local test roles
had no such creator defaults, so the 33-pass report does not resolve this risk.

The preflight SQL is a report, not an automatic safe-to-deploy decision. Zero
conflicts and matching hashes are necessary but do not establish backup, platform
integration or team approval. Counts/hashes over active traffic cannot prove
backfill preservation and must not be treated as matching installation evidence.

## Backup, approvals and quiet window

Before any shared installation record:

- Named database owner, backend owner and team approver authorize these exact
  artifact hashes, target production-labeled project, backfill, expected permissions,
  maintenance scope and incident/rollback operator. Installation approval does not
  authorize shared test purchases/cancellations or customer-feature activation.
- A recoverable backup or restore point with timestamp/project, retention, access,
  restore steps and successful restore evidence to an isolated target. Verify actual
  backup capability, not just a production label. Cover database schema/data, orders,
  order items, inventory, profiles/Auth associations, relevant sequences, functions,
  triggers, policies, grants and existing checkout metadata. Secure backups privately.
- Supabase staging checklist evidence and a representative-volume rehearsal, including
  the current inspection-script revisions. Capture schema/runtime/role differences.
- Confirm the feature flag is disabled using authorized config review without dumping
  other environment variables. No flag or credential is changed by this runbook.
- Coordinate a quiet window pausing ALL competing checkout, cancellation, fulfillment,
  item edits, inventory writes/imports/jobs and manual order writers, including other
  developers. Drain in-flight transactions before F07. There is no new automatic
  maintenance mode; the operational method must be agreed separately.

The reference migration adds three columns (one generated stored), one counter
table, one unique index, one trigger function and two triggers. It backfills only
the new order columns and the new counters. Creating the generated column can
rewrite orders; every old order is updated, invoking existing UPDATE triggers.
The strong DDL lock remains through the transaction. Cancellation installs two
functions and their EXECUTE ACLs only. Both files use installation-local 5-second
lock/60-second statement timeouts; they do not configure global or RPC runtime
timeouts and do not impose a 60-second whole-file deadline.

## Exact future installation sequence — no activation

1. Complete all gates above. Recheck target, hashes and disabled flag. Run/review
   F01–F06, then fresh F07 after writers are paused. Store evidence privately.
2. Submit the entire exact `customer-order-cancel.sql` ONCE through the approved
   administrator client. It already contains BEGIN/COMMIT. Do not double-wrap,
   split into individually committed statements or add CREATE OR REPLACE/IF NOT
   EXISTS. Stop on any error; ROLLBACK an open aborted transaction. If the connection
   is lost around COMMIT, inspect catalogs before deciding its state; do not rerun.
3. Run **G00 only** in the verification file: two customer-function metadata rows
   must match, and exactly six basic effective permission rows must be correct.
   Confirm no extra overloads/executors/default privileges. Do not run G03 onward
   yet because the reference table is not installed. Keep the customer flag off.
4. After that verification, submit the entire exact `order-display-references.sql`
   ONCE with identical error/uncertain-outcome handling. Each file is a separate
   transaction: failure here does not undo successful cancellation-function install.
   Keep all new capabilities unavailable to customers while investigating failures.
5. Run **all G00–G08** before writers resume, and compare the results below. Recheck
   existing policies/grants/triggers and old function bodies. Keep immutable evidence
   of target/version/hashes, installation outcomes, inspector and approvals.
6. If any verification fails, stop the rollout and keep writers paused as needed;
   do not reset inventory/metadata/counters to force a pass. Investigate using
   read-only inspection and agree a forward repair. Do not repeat the entire files.
7. Shared smoke writes require separate authorization of exact disposable accounts,
   products and reconciliation scope. Without that approval, shared post-install
   verification remains read-only; perform smoke tests only in approved staging.
8. Resume agreed existing traffic only after postflight approval. **Leave customer
   cancellation disabled.** Any future activation is a separate explicit approval
   and deployment task after platform evidence, outside this preparation/runbook.

## Postflight acceptance

| Section | Required results |
| --- | --- |
| G00 | Exactly customer_cancel_order(uuid,text)→JSONB and customer_cancellation_version()→integer, correct argument names, volatility v/s, invoker, empty search_path, fingerprints and no overloads; six basic role rights correct. |
| G01–G02 | Exactly three reviewed new functions after both installs; nine basic role privilege rows. anon/authenticated false, service_role true. ALL effective executor rows must be on the signed trusted owner/platform/service allowlist. |
| G03 | Counter RLS true; no client policy; ordinary-role table rights denied. service SELECT/INSERT/UPDATE true, DELETE false. Inspect raw ACLs for other rights/grantees as well. No default/inherited grant surprise is acceptable. |
| G04 | New year integer and number bigint NOT NULL, generated stored reference; reviewed generator expression; valid/ready unique index on order_reference; exactly two correctly defined enabled triggers; allocator body matches; validated year/positive-number/PK constraints. |
| G05 | No missing/duplicate/malformed labels, duplicate year-number groups, UTC-year mismatch, invalid numbers, incorrect generated values or counters behind orders. Empty orders legitimately returns zero violations and no counter rows. |
| G06 | Immediately after backfill BEFORE any new checkout: ordinals match row_number partitioned by UTC year, ordered by created_at/id; counters equal initial per-year assignment count. Ineligible legacy count equals F05. Do not impose historical ordinal/count equality after concurrent insertion/deletion resumes. |
| G07 | Every saved F07 count/unit/hash value matches. Only the three new display columns are excluded from the order fingerprint; IDs, contact/item/price snapshots and checkout provenance remain unchanged. Hashes are change indicators, not recoverable backups. |
| G08 | Both old RPC bodies preserved; existing RLS/table ACLs/policies/unrelated trigger fingerprints unchanged, counter has no client policy. Same inspection connection's original timeouts restored after commits. |

Neither verification file invokes cancellation, checkout or even the version
capability RPC; it inspects metadata instead. A constant capability result of 1 is
installation presence, not a staging/backup/approval certificate. It must not be
used to enable the customer action automatically.

Preparation checks actually executed: **5 file-only deployment-contract tests
passed** (including read-only statements and all five reviewed function-body
fingerprints), plus lint and `git diff --check`. These do not execute SQL. Full
application/native test counts above refer to the existing prior evidence, not new
execution in this preparation.

## Rollback/incident considerations

Before COMMIT, ROLLBACK restores that file's changes. After COMMIT, this is a
forward-only schema/data upgrade. First keep/restore the customer flag to disabled
through an independently approved config operation and pause affected writers.
Do not drop columns, triggers, functions or counters automatically. Installed old
checkout/admin SQL must not be edited/reinstalled as a rollback tactic.

Application display can fall back to internal IDs; retain new references, counter
state and uniqueness protections. Reference-trigger failures can block checkout;
keeping the customer flag off does NOT disable that trigger. Such an incident
requires an approved forward repair/operational plan while checkout writers are
paused, not a blind retry or counter reset. No destructive rollback SQL is provided.

Completed cancellations and references are historical business facts. Do not
reopen Cancelled, subtract restored stock, delete orders, forge checkout metadata
or renumber references. A whole-project restore can erase other developers' later
work and needs a separate incident decision with a rehearsed recovery plan.
