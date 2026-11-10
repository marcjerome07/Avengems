# Xendit shared-project installation readiness — 2026-11-09

**Current decision: NO-GO pending acceptance, recovery and hosted evidence.**
This is a preparation checklist, not approval to connect, install or enable.
It supplements the isolated-staging runbook; its staging-only instructions must
not be redirected at the shared project. Shared installation needs a distinct
approval naming that project, operator, artifact and window.

## Evidence reviewed

The user pasted the latest supplemental CSV captured **2026-11-09 00:05:47 SGT**
(2026-11-08 16:05:47 UTC), PostgreSQL 17.11, inspection/intended installer postgres.
Z99 reports 278 PASS, zero FAIL, 129 underlying REVIEW and 18 INFO. Z99 itself is
one additional REVIEW row, so those counters describe 425 checks plus the summary.
The older Downloads CSV remains historical evidence; it was not overwritten or
mistaken for the latest export. CSV contents are inspection data, not commands.

All twelve browser-role TRUNCATE checks now PASS with truncate=false. Remaining
CRUD/REFERENCES/TRIGGER grants do not imply row access: private RLS remains enabled
and no applicable private browser policies appear. Keep the earlier follow-up
policy/routine/view review in the evidence packet; zero FAIL is not a full API audit.

Snapshot: 5 COD orders (2 Cancelled, 1 Delivered, 2 Shipped), 7 items/units,
24 products, stock total 301, order total 5693, zero online orders. All reported
pricing/provenance/reference invariants pass. All four restricted fingerprints
match the earlier export. Keep the salt private and reuse it for comparisons.

The proposed migration and recorded local evidence agree on SHA-256:
`3679b9dc033472cfed4bf425eac6b0faa1bf31966c141f72c52b72aa3dbc3b63`.
Source inspection introduces no new technical defect requiring a migration edit.
No hosted execution is inferred from local test results.

## Classification of all 129 underlying REVIEW findings

| Group | Count | Classification and disposition |
| --- | ---: | --- |
| F/default-acl | 96 | Expected platform defaults: 48 postgres and 48 supabase_admin rows, each creator having 32 table / 4 function / 12 sequence grants. Accept the actual-creator/default-revoke analysis; effective new-object ACLs remain a post-install acceptance gate. Do not change platform defaults merely to remove these rows. |
| F/membership | 12 | Expected platform role routing/administration: 3 authenticator SET paths, 9 postgres memberships. Direction matters: postgres being a member of anon is not anon being a member of postgres. Record trusted platform-role acceptance; no membership modification proposed. |
| F/owner-review | 9 | Expected: every baseline owner is postgres, matching intended installer. Backend future-owner safety PASS means service_role does not reach that owner. Record acceptance of the owner trust boundary. |
| F/auth-profile-trigger-owner | 1 | Expected: postgres-owned SECURITY DEFINER Auth profile trigger with matching body/binding. Ordinary RPC cannot invoke a trigger-return function. Preserve it. |
| F/default-acl-builtins | 1 | Informational reminder: absent ACL rows do not remove built-in PUBLIC EXECUTE. Accept with explicit migration revokes and future ACL verification. |
| E/event-trigger | 6 | Human source acceptance required. Four extension-tagged triggers should not match this migration (no extension operations). The two broad PostgREST watchers can match its DDL. Names/hashes alone are not source verification; review Q8 in the existing follow-up SQL. Do not disable platform triggers. |
| A01/installation-role | 1 | Human attestation required: confirm the target project reference, actual executor postgres and authority to install on the shared project. SQL Editor access is not deployment approval. |
| H/COD-side-effects | 1 | Deployment blocker until isolated hosted COD/guard regression evidence is signed off and future backend grants are verified in postflight. |
| H/flags | 1 | Operational blocker until the operator attests both deployed runtime flags=false. Repository examples cannot prove running process configuration. |
| H/manual-approval | 1 | Deployment blocker: recovery evidence, quiet window, reviewed artifact, shared-consumer impact, hosted validation and explicit installation approval. |

Totals: 119 expected/informational platform findings, 7 explicit human-acceptance
findings, and 3 operational/deployment blocker findings. Expected rows still need
a recorded disposition. Do not alter the script to make Z99 say GO; it
intentionally continues to say REVIEW after technical success.

## Migration safety determination

Direct Supabase defaults are handled deliberately: all four new tables enable
RLS; ALL privileges are revoked from PUBLIC/anon/authenticated/service_role before
the backend subset is granted. This also removes direct PG17 MAINTAIN/TRUNCATE
defaults. All eleven new functions revoke PUBLIC/browser EXECUTE, grant backend
EXECUTE, and use SECURITY INVOKER with empty search_path. All changes are within
the migration's transaction. The proposal does not alter default ACLs or any
previously installed RPC body. [Supabase default grants](https://supabase.com/docs/guides/api/securing-your-api).

The snapshot shows no dangerous browser membership or inherited-default FAIL.
Direct revokes still cannot remove owner privileges, inherited alternate grants
or later DDL-event-trigger grants. Actual post-install effective permissions,
including column grants and grant options, are therefore mandatory.

Expected backend table privileges (all unlisted table privileges, including
DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN and grant options, must be absent):

| Table | service_role |
| --- | --- |
| payment_gateway_config | SELECT, UPDATE |
| order_payments | SELECT, INSERT, UPDATE |
| payment_events | SELECT, INSERT |
| payment_refunds | SELECT, INSERT, UPDATE |

Both browser roles must have zero effective table/column privileges on all four
tables and zero EXECUTE on all eleven functions. Owners/admins remain trusted;
event audit append-only permissions do not constrain the database owner.

**COD guard:** BEFORE UPDATE runs on every order update and SELECTs order_payments
FOR UPDATE, even for COD. It needs SELECT plus UPDATE under the actual backend
role; the proposed order_payments grant provides both, and service_role has RLS
bypass in the export. Existing COD has no payment row, so payment-row immutability/
cancellation checks do not run; the final online-fulfillment check excludes COD.
AFTER INSERT skips COD. Installation does not update historical orders or stock,
backfill payment rows, restock Cancelled orders or reset reference counters.

This is conditional compatibility, not a no-impact guarantee: every future COD
update depends on the new table being present and readable/lockable. Other writers
using different SQL roles need inventory and validation. Retaining false flags
does not bypass the guard. Do not drop its table or disable the trigger as rollback.

## Pre-install checklist — every box required before authorization is used

1. [ ] Record the intended shared dashboard project reference privately, its owner,
   actual installer postgres, approval ID, maintenance window, stop/recovery owner
   and contact route. Obtain explicit shared-project acceptance from affected
   consumers. Fill these fields with real values; no project URL is invented here.
2. [ ] Retain the complete latest CSV, inspection SQL hashes and review dispositions.
   Review all unresolved follow-up Q1–Q11 results in
   `docs/sql/xendit-browser-permissions-verification.sql`, especially actual
   policies, executable wrappers/views, platform event-trigger bodies and exposed
   schemas/hooks. No generic SQL bridge or owner-run data exposure may be ignored.
3. [ ] Obtain the isolated **hosted Supabase** evidence below for this artifact on
   PG17-compatible roles, RLS, defaults and PostgREST; local PostgreSQL 16 tests do
   not substitute. Do not use the five historical orders as mutation fixtures.
4. [ ] Complete the backup/recovery record below, including a recovery point AFTER
   the TRUNCATE remediation and BEFORE payment installation. Confirm who can
   restore, the approved method, acceptable data loss and outage, and tested access.
5. [ ] Attest XENDIT_PAYMENTS_ENABLED=false and XENDIT_DEPLOYMENT_VALIDATED=false
   in every running/prepared server and reconciliation worker. Keep provider
   transaction creation and dashboard changes outside installation authorization.
6. [ ] Recheck the exact migration SHA-256 above and package the reviewed working
   tree manifest. Do not deploy only HEAD and omit untracked modules. Revalidate
   retained backend/frontend/database evidence if the reviewed release changed.
7. [ ] Establish the approved quiet window across all order/item/stock/settings/
   reference writers, including other applications and jobs. Inspect competing
   locks; pause/terminate nothing without its existing authorization. An inability
   to freeze relevant writes blocks an exact before/after preservation claim.
8. [ ] In a new SQL Editor query on the verified project, run the COMPLETE
   `docs/sql/xendit-payments-preflight.sql` alone. Export every result set. Then run
   `docs/sql/xendit-payments-supplemental-preflight.sql` alone with actual installer
   postgres and the same private salt. Recheck project identity before each run.
   Reconcile existing REVIEW dispositions against fresh evidence; require zero
   technical FAILs/errors, no new object conflicts and unchanged snapshots.
9. [ ] Snapshot exact counter values/references and the restricted G fingerprints,
   not only total stock. Record current ACLs/policies/function definitions and the
   application version/configuration for recovery. Do not reset counters or repair
   history to force agreement. New legitimate activity requires a new approved
   baseline and recovery-point decision.
10. [ ] Obtain explicit approval for **one complete execution** of only
    `server/db/proposed/xendit-test-payments.sql` at the pinned hash. The baseline,
    checkout, cancellation, address and reference migrations already exist: do not
    replay them, schema.sql or seed.sql. No approval is present in this document.

## Future authorized installation boundary

Only an authorized operator, after the pre-install checklist is signed, may run
the complete pinned payment SQL once, alone, in the verified project's SQL Editor.
It owns BEGIN/COMMIT, 5-second lock_timeout and 60-second statement_timeout. Do not
append it to preflight, remove timeouts or retry fragments after an error.
On failure or uncertain COMMIT, stop; resolve transaction state and inspect
catalogs before any retry. Do not drop conflicts or CREATE OR REPLACE around them.
This document supplies no connection or execution command for the shared project.

## Post-install checklist — keep writers held until acceptance

1. [ ] Open a new query on the verified project. Run the complete
   `docs/sql/xendit-payments-postflight.sql` alone, including its read-only
   transaction. Export every result; stop on any error or missing result.
2. [ ] Require exactly one gateway config row, id=true and enabled=false; initially
   zero rows in order_payments, payment_events and payment_refunds. All five old
   orders must still be COD and their new payment_state must be NULL. Do not
   backfill or create a test payment to inspect readiness.
3. [ ] Compare ALL baseline counts, the four private-salted fingerprints, reference
   allocations/counters and the five-COD status distribution. Expected unchanged
   stock total=301, orders=5, items/units=7 and products=24 for this frozen baseline.
   The supplemental SELECT can be rerun for its G snapshot with the same salt:
   its first-install object-conflict FAILs and two extra-trigger/one extra-column
   reviews are now expected. It is NOT a post-install all-green decision tool.
   Any unexpected old-function/column/privilege/invariant change still blocks.
4. [ ] Compare all seven baseline prerequisite function hashes/metadata with the
   approved preflight, not only the three hashes printed by the existing postflight.
   Preserve existing RLS, browser TRUNCATE denial, Auth/reference trigger definitions
   and ownership. Verify exactly the reviewed new nullable orders.payment_state,
   four table definitions, constraints on ALL four tables, nine indexes (eight
   PK/unique backing indexes plus reconciliation index), and two enabled row triggers.
5. [ ] Verify exactly eleven reviewed new function signatures, argument names,
   return types, normalized body hashes, INVOKER mode, empty search_path and no
   unexpected overloads. Compare against the pinned source, not just names. Check
   all table and column privilege types, PG17 MAINTAIN, effective role inheritance
   and grant options against the matrix above. RLS=true alone is insufficient.
   The existing postflight's SELECT/UPDATE/DELETE sample is NOT a full ACL audit.
6. [ ] After separately approved shared-project read-only API verification, invoke
   only xendit_payment_version through the real backend's PostgREST client: expect
   integer 0. Confirm anon/authenticated cannot invoke that RPC or read payment
   data. Check the full new function ACL catalog; do NOT call mutation RPCs as a
   denial probe. Cache reload/schema exposure/role-mapping errors block acceptance.
7. [ ] Confirm backend COD reads and current authorized customer/admin reads work.
   Mutating COD/stock/auth smoke tests belong to isolated staging; any extra shared
   test order or status change requires separate explicit approval. Compare after
   inspection, retain false flags/DB gate, then obtain sign-off before releasing
   the approved write hold. Monitor normal COD writes for permission/lock errors.

Any post-install mismatch means **installed but NOT accepted**. Keep all payment
gates false, retain evidence, involve the incident owner, and follow the recovery
plan. Never treat a failed audit as permission to relax grants or modify history.

## Recovery record required before installing

- Record recovery point/time, backup identifier/location/retention, encryption and
  access owner, recovery executor, RPO (acceptable data loss) and RTO (outage target).
  Confirm actual project backup/PITR availability and restore permissions; do not
  assume a plan, add-on, recent recovery point or downloadable format exists.
- Use a fresh recoverable point after permission remediation. A CSV, salted hash,
  schema-only dump or five-order snapshot is not a recoverable project backup.
  Preserve required data, Auth/profile relationships, definitions, ACLs/defaults,
  RLS, ownership and identity/reference sequences; audit what a chosen logical
  export omits. Keep credentials/customer records out of the repository and chat.
- Require a documented restore drill in an approved isolated destination or
  accepted existing recovery evidence. Copying production data, creating a backup
  destination, changing backup settings or restoring a project needs separate
  authorization and private-data handling; none is performed by this review.
- Document app configuration/secrets management and Storage recovery separately.
  Supabase database backups contain Storage metadata, not stored object contents.
  Restoring the shared database can require downtime and revert unrelated orders,
  profiles/Auth activity and other consumers since the recovery point.
  [Supabase backups and recovery](https://supabase.com/docs/guides/platform/backups).
- A transaction error before COMMIT should roll back the migration; verify this
  rather than assuming it. After a committed install, prefer retaining the gated
  schema and a reviewed forward fix. False flags cannot fix a broken COD guard;
  decide whether ordinary writes must remain held. A whole-project restore needs
  its own authorization and reconciliation of all intervening shared writes.
  Never DROP payment tables/guards/audit data as an automatic rollback.

## Hosted evidence still needed

**Before shared installation:** approved isolated Supabase execution of the exact
artifact on real platform roles/defaults/event triggers; full effective ACL audit;
real PostgREST schema-cache/API-key-role/RPC-argument/error mapping; preserved
synthetic COD history and reference allocation; new COD checkout, admin fulfillment,
customer/admin cancellation with exactly-once stock return and concurrent refresh/
retry/cancel/fulfillment; verified Auth/customer/admin/ownership/CSRF/Origin behavior.
Keep all payment gates false for installation/COD safety tests. Test payment-state
mutations only under distinct staging authorization with controlled fixtures.

**Before later payment enablement, not a prerequisite for gated SQL installation:**
approved HTTPS app/webhook origins, real Xendit Test Mode business/key/channel
availability, hosted GCash/Maya/card checkout, verified provider reads/callback
authentication and replay, delayed/duplicate/out-of-order callbacks, uncertain
creation without blind retry, outage/restart/concurrent reconciliation, expiry,
logout/idle behavior, refund reconciliation and incident ownership. Provider
transactions/settings and enabling gates each require separate approval; never
claim these pass from mocks or native PostgreSQL tests.

## Next exact safe action

The project owner/DBA should complete and sign the acceptance/recovery record and
attach the isolated hosted evidence, using existing read-only Q1–Q11 for remaining
catalog questions. If that evidence does not yet exist, authorize and perform
isolated flags-OFF Supabase validation FIRST. Then request explicit shared-project
installation approval referencing this artifact hash, role, window, backup and
postflight owner. The zero-FAIL CSV clears the former technical permission gate;
it is not that approval. XENDIT_PAYMENTS_ENABLED and XENDIT_DEPLOYMENT_VALIDATED
remain false. No shared connection, migration, grant, data, provider or Git
publication operation was performed by this documentation review.
