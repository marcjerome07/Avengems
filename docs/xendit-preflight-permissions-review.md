# Xendit supplemental preflight: browser permissions review

Decision: **NO-GO; prepare a narrow permission change for approval, do not deploy.**
Reviewed the complete user-supplied `Supabase Snippet Untitled query.csv`, captured
2026-11-08 15:42:21 UTC on PostgreSQL 17.11, with inspection and intended installer
role `postgres`. The CSV is evidence supplied by the operator, not authorization
or executable instructions. No live database connection was made for this review.

## Export reconciliation

There are 426 data rows: 266 PASS, 129 REVIEW, 18 INFO, **13 FAIL including Z99**.
Z99 reports **12 underlying technical failures**; it is the thirteenth FAIL row,
not a separate permission defect. All twelve are accounted for below.

All nine baseline tables have RLS enabled. There are no exported
`F/browser-policy/...` rows, indicating no policies applicable to either browser
role on the private tables at that snapshot. Both roles are NOLOGIN, have no
RLS bypass/superuser/role-creation privileges, and cannot CREATE in public. The
protected prerequisite RPC browser-EXECUTE checks pass. No extra baseline user
triggers/rules/columns/constraints or unexpected public executable definer routine
appear as REVIEW findings. These results are encouraging but do not inventory
every callable invoker function, exposed-schema view or SQL bridge.

## Every technical FAIL

Each cell below names an actual failed check. For every one, evidence has
`truncate=true`; the other reported table privileges and column SELECT/UPDATE
also equal true. The exact preflight rule fails a private table if browser
TRUNCATE is effective, even when RLS is enabled. **These twelve fail because of
TRUNCATE, not because RLS is off or ordinary SELECT has been proven to leak.**

| Table | anon failed check | authenticated failed check | Potential impact if a usable SQL execution path exists |
| --- | --- | --- | --- |
| profiles | F/browser-baseline/anon/profiles | F/browser-baseline/authenticated/profiles | Profile/role record loss; dependent FK tables must also satisfy TRUNCATE rules. |
| addresses | F/browser-baseline/anon/addresses | F/browser-baseline/authenticated/addresses | Customer address loss. |
| orders | F/browser-baseline/anon/orders | F/browser-baseline/authenticated/orders | COD/order history loss; dependent items and other FK requirements matter. |
| order_items | F/browser-baseline/anon/order_items | F/browser-baseline/authenticated/order_items | Item/stock-deduction audit history loss. |
| wishlist_items | F/browser-baseline/anon/wishlist_items | F/browser-baseline/authenticated/wishlist_items | Wishlist loss. |
| store_settings | F/browser-baseline/anon/store_settings | F/browser-baseline/authenticated/store_settings | Store settings loss and checkout outage. |

Classification for **all twelve**: genuine excess SQL privileges, with an
intentionally conservative deployment gate; **a remotely exploitable browser
vulnerability is not demonstrated by this CSV**. RLS controls ordinary row access
but not TRUNCATE or REFERENCES. With enabled RLS and no applicable policy, normal
browser-role row access is default-denied, despite CRUD grants.
[PostgreSQL 17 RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

Supabase documents these broad grants as part of existing-project defaults and
states that its Data API does not use TRUNCATE, REFERENCES, TRIGGER or MAINTAIN.
SQL running as a browser role, such as an exposed database function, can use
them. A standard REST DELETE is not a TRUNCATE operation. Do not turn a potential
SQL capability into a claim of an unauthenticated HTTP wipe, or dismiss it as
harmless without checking callable routines/views and deployed API configuration.
[Supabase API security](https://supabase.com/docs/guides/api/securing-your-api),
[PostgREST table methods](https://docs.postgrest.org/en/stable/references/api/tables_views.html).

Never demonstrate this risk by truncating real data, even inside a rollback.

## Repository access paths and compatibility

- `server/src/supabase.js` builds a dedicated secret-key database client with
  session persistence/refresh disabled. `server/src/index.js` passes that client
  into customer, catalog, checkout and administrator routes. Per-user Auth clients
  in `server/src/auth.js` are separate; they are not the database singleton.
- `src/services/*` uses the Express `/api/...` routes. No browser Supabase SDK
  database client was found in `src`. The reviewed commerce client sends cookies
  and CSRF tokens; no feature uses browser-role SQL TRUNCATE.
- `server/db/schema.sql` enables RLS on private tables and defines public SELECT
  policies only on collections and non-archived products. It intentionally routes
  private data through the backend. That source is not proof that deployed
  policies can never drift: the follow-up queries obtain the actual definitions.
- Registration/OTP/recovery/Google use Supabase Auth. The matching
  `handle_new_user()` SECURITY DEFINER trigger creates a customer profile as its
  owner (`postgres`), not with browser table privileges. Existing profile reads
  use the secret database client. Preserve the trigger, owner and function ACL.
- `server/src/routes/me.js` verifies identity and customer/email status, checks
  ownership, and applies Origin/CSRF protection to writes. Addresses use
  `customer_address_mutate`; wishlist uses scoped backend operations.
- `server/src/routes/checkout.js` uses owner-scoped order reads and the installed
  checkout/cancellation RPCs. `server/src/routes/admin.js` and
  `server/src/middleware/admin.js` require a verified database-profile admin role.
  Admin fulfillment and stock/catalog updates use the backend client.
- CSV service_role checks show RLS bypass and required baseline SELECT/INSERT/
  UPDATE and prerequisite EXECUTE access. Q1 also records DELETE and all other
  table privileges, so existing backend capabilities can be compared unchanged.

Removing only browser-role TRUNCATE does not alter any of these required row
operations, Auth behavior, session limits, RPC ownership or stock logic. This is
a repository-supported compatibility conclusion, not a hosted regression result.
Confirm the deployed application uses this architecture and no other shared
project consumer depends on the affected privileges.

## Smallest proposed fix — approval required

First obtain current ACL grantors/recipients with Q3 below. If the excessive grants
are direct grants to anon/authenticated, and no PUBLIC/inherited path preserves
them, the minimum change is this **one privilege on six named tables**:

```sql
-- PROPOSAL ONLY. NOT EXECUTED. Do not paste until separately approved.
REVOKE TRUNCATE ON TABLE
  public.profiles, public.addresses, public.orders,
  public.order_items, public.wishlist_items, public.store_settings
FROM anon, authenticated;
```

This is not a standalone migration or an approved deployment command. A DBA must
prepare the exact transaction with bounded waits, explicit RESTRICT behavior,
reviewed grantor/role context and a saved pre-change ACL record. If grants are
PUBLIC/inherited, the direct-only proposal is insufficient; stop and scope the
actual source with its dependents. Do not use CASCADE or widen revokes silently.

Do not change service_role, postgres, supabase_admin, authenticator memberships,
Auth/schema ownership, RLS, policies, RPCs, sequences, catalog SELECT or defaults
as part of this minimum change. Do not add permissive policies or FORCE RLS.
No existing row should change, and neither Cancelled COD order should be restocked.

Separate optional hardening: remove unneeded browser REFERENCES/TRIGGER/PG17
MAINTAIN and, after shared-consumer review, unnecessary private-table CRUD/column
grants. Inventory non-CRUD catalog grants and identity-sequence UPDATE too. These
were not what caused the twelve failures, and need separate scope/approval.
Project-wide default-ACL changes are not necessary to remediate existing objects.

## Disposition of all 129 REVIEW rows

| Group | Rows | Assessment / required disposition |
| --- | ---: | --- |
| A01 installation-role | 1 | Approval blocker: attest postgres is the actual future installer and the dashboard reference is the intended project. |
| E/event-trigger | 6 | Conditional compatibility review, not six confirmed vulnerabilities. Four are extension-tagged; no matching extension operation exists in this payment proposal. Two broad PostgREST watchers can fire on its DDL. Obtain definitions (Q8), confirm authentic platform behavior, and retain them. |
| F/auth-profile-trigger-owner | 1 | Expected baseline: postgres owner, matching body and Auth trigger binding all pass. Trigger-return functions cannot be called as ordinary RPCs. Record trusted-owner acceptance; do not revoke or replace it merely for this flag. |
| F/default-acl | 96 | 48 postgres and 48 supabase_admin rows: each has 32 table, 4 function, 12 sequence grants. Expected broad platform defaults, not 96 separate exploit findings. Actual-creator defaults and future payment ACL verification are security sign-off items. |
| F/default-acl-builtins | 1 | Informational reminder: absence of an explicit default row is not absence of PUBLIC function EXECUTE. Accept only with explicit migration revokes/postflight checks. |
| F/membership | 12 | Three authenticator SET paths and nine postgres memberships. Expected platform routing/administration direction, not browser membership in postgres. No dangerous browser membership FAIL is present. Record acceptance; do not remove platform memberships. |
| F/owner-review | 9 | All nine baseline tables are owned by postgres, matching intended installer. Expected ownership evidence; attest trust rather than transferring owners. Backend future-owner check passes. |
| H/COD-side-effects | 1 | Critical compatibility blocker until hosted staging evidence: proposed BEFORE UPDATE guard queries/locks order_payments even for COD. Future backend SELECT/UPDATE and trigger compatibility must be proven after approved isolated installation. |
| H/flags | 1 | Operational blocker: operator must attest both actual runtime flags remain false. Example files are false but cannot prove runtime state. |
| H/manual-approval | 1 | Deployment blocker: project scope, backup/restore readiness, quiet window, current snapshots, staging evidence and exact shared-project installation authorization are not supplied by the export. |

Default ACLs do not automatically defeat the payment proposal: it explicitly
revokes ALL new-table privileges from PUBLIC/anon/authenticated/service_role,
then grants the required backend subset; it also revokes browser/PUBLIC RPC
EXECUTE. New payment events should allow backend SELECT/INSERT only. Existing
direct default grants are therefore anticipated. Inherited grants, unexpected
DDL event-trigger grants or ownership could still defeat that intent, so actual
effective post-install ACL checks remain mandatory. Do not alter supabase_admin
defaults or disable platform watchers to clear REVIEW rows.

## Read-only missing-evidence queries

Use `docs/sql/xendit-browser-permissions-verification.sql`, Q1–Q11. Verify project
identity, then run each complete SELECT separately in SQL Editor and export all
rows, including zero-row results. No query reads customer records, changes roles,
invokes application functions or modifies grants/settings. Q2 and Q8 return
policy/platform source definitions: review privately and redact any secret literal
before sharing. SQL catalog visibility still does not prove the HTTP API surface.

Most important missing evidence:

1. Q1–Q4: current effective permissions, PG17 MAINTAIN, actual policies, grant
   sources and explicit column grants. Confirm no permissive private-table policy.
2. Q5–Q7: role direction, all relevant callable invoker/definer routines and views.
   Review source/dependencies for any SQL execution bridge or owner-run bypass.
   Regex source flags and definition hashes alone cannot certify safety.
3. Q8–Q10: authenticate the six event-trigger bodies, defaults and API config.
   Operator must provide dashboard Exposed schemas, Extra search path and any
   pre-request hook. Empty catalog settings do not prove a disabled Data API.
4. Q11: identity-sequence permissions are adjacent hardening evidence; never
   advance/reset the sequence. Actual deployed DB key/role and other consumers
   require private operator attestation, not disclosure of credentials.

## Proposed remediation sequence for approval

1. Keep both flags false and the Xendit migration uninstalled. Retain the original
   CSV privately. No claim of shared-project authorization is made.
2. Collect Q1–Q11 and operator attestations above. Stop on unexpected policies,
   SQL bridges, owner-run view exposure, inherited grants or project drift.
3. DBA prepares only the six-table TRUNCATE revoke against verified direct grant
   sources, retaining pre-change ACL evidence. Obtain approval for that exact
   permission change separately from any payment migration or wider hardening.
4. Rehearse the ACL change and regression checks in an approved isolated Supabase
   staging project. Preserve service_role privileges and Auth trigger behavior.
   Cover registration/verification, password and Google login, profile/addresses/
   wishlist, catalog/cart, fresh COD checkout, cancellation/restock once only,
   admin fulfillment/role denial, refresh/logout and invalid CSRF/Origin rejection.
   Use synthetic customers/orders; never mutate the five shared historical orders.
5. Only after that evidence and explicit authorization, an approved DBA applies
   the permission-only change in the shared project. This review does not perform
   or authorize that step. Do not combine it with a payment migration.
6. Run Q1–Q4 and the original supplemental preflight again. Require effective
   TRUNCATE=false for all twelve pairs, unchanged backend permissions/RLS/policies/
   functions, zero technical FAILs and no unexplained snapshot drift. Retain the
   same private salt for fingerprint comparison; if legitimate writes occurred,
   reconcile them and capture a newly approved baseline rather than repairing rows.
7. Sign off each remaining REVIEW group and the shared-project approval record.
   Keep payment installation NO-GO until its independent staging/backup/window/
   artifact requirements are met. After a future approved install, use the existing
   postflight and full effective payment ACL audit, with flags and DB gate false.

Known snapshot: five COD orders (2 Cancelled, 1 Delivered, 2 Shipped), seven items/
units, 24 products, summed stock 301, summed order total 5693. All recorded provenance,
pricing and reference invariants pass; this is a change-detection baseline, not
proof of historical stock movement or authorization to create payments.

Validation: all eleven follow-up SELECTs executed successfully inside a READ ONLY
transaction on a disposable loopback PostgreSQL 16 catalog fixture, then that
fixture was stopped. PostgreSQL 17 MAINTAIN evaluation and actual hosted settings
remain operator verification items. `git diff --check` passed. Application code
was unchanged; backend/frontend regressions were not rerun for this review.

For this review only documentation and read-only query files are added. No shared
connection, grant/RLS change, migration, payment transaction, account setting, deployment,
commit, push or merge was performed. Local tests alone never approve deployment.
