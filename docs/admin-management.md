# Admin application implementation and project-checking guide

## Implementation status

Subsequent [native PostgreSQL validation](testing/checkout-cancellation-local-results.md)
now records 23 passing real local transaction checks for checkout and cancellation.
The isolated Auth/role adapter is not Supabase Auth/PostgREST integration; shared
deployment still needs actual project preflight, backup/restore evidence and approval.

For the final SQL modules, use the joint
[checkout/cancellation deployment review](checkout-cancellation-deployment.md),
including read-only inspection artifacts and an unexecuted isolated staging plan.
Shared deployment remains blocked pending PostgreSQL evidence, backup and team approval.

Admin order reads, fulfillment status updates, product creation/editing/archiving,
inventory updates, store settings, customer summaries, dashboard and analytics now
use Express APIs backed by the existing Supabase schema. There is no browser mock
fallback or fabricated order/sales response. Loading, empty, unavailable-data,
authorization and conflict states remain visible in the existing UI.

This is application-code completion, not database deployment approval. No SQL was
executed, accounts promoted, migrations applied, or live records/settings changed
during implementation. All automated tests use fabricated records and mocked
provider/database transport. Actual PostgreSQL execution, grants, transaction
rollback and concurrency remain deployment gates.

## Local setup and demonstration

1. Stay on `backend-mariel` and preserve the existing uncommitted Modules 1–3 work.
2. Use Node 22 or newer and installed root/server dependencies. Configure the
   existing server environment privately using `server/.env.example` as a template.
   Required names are `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and
   `SUPABASE_SECRET_KEY`; never copy secret values into frontend files, screenshots,
   logs or documentation. `DATABASE_PASSWORD` is not needed by these HTTP routes.
3. Run `npm --prefix server run dev` and `npm run dev` in separate terminals. The
   Vite proxy uses backend port 3001. Use the configured `APP_ORIGIN` exactly;
   local default is `http://localhost:5173`. Production requires HTTPS and proper
   protected-cookie configuration as documented in the authentication guides.
4. An existing confirmed Supabase user with an existing `profiles` row whose
   `role` is exactly `admin` is required for admin pages. `profiles.id` references
   `auth.users.id` in `server/db/schema.sql`. There is no admin bootstrap/seed
   script in this implementation. Any first-admin promotion requires a separately
   authorized administrator; do not simulate it in browser storage or metadata.
5. Before using shared data, obtain authorization for any demonstration writes.
   Starting these development servers does not install SQL or seed orders/users.

Without checkout SQL, demonstrate catalog/collections, existing authentication
and recovery screens, cart quotes, existing profile/wishlist/order reads and admin
reads. Admin order lists can be genuinely empty; dashboards must show zero order
value when there are no orders. Existing schema-backed product/settings editing
and fulfillment can be demonstrated with separately authorized disposable data.
Address writes require the independent address RPC to have been deployed already.
Do not claim checkout, cancellation, email delivery or live persistence was tested
merely because local application tests pass.

## API contract

All `/api/admin/*` endpoints require a provider-verified normal access token or
valid cookie session, confirmed email, and a fresh database profile role `admin`.
All writes also require matching trusted Origin, signed CSRF token from
`GET /api/auth/csrf`, and `Content-Type: application/json`. Bearer credentials do
not bypass write protection. Responses are private (`Cache-Control: no-store`).
The privileged Supabase secret remains server-only; each route enforces access
before using the RLS-bypassing client. Unknown request properties are rejected.

| Method and endpoint | Contract |
| --- | --- |
| `GET /api/collections` | Public persisted collection metadata for catalog pages. |
| `GET /api/admin/orders?status=Pending` | Persisted orders/items, optional schema-status or `All` filter, newest first. |
| `GET /api/admin/orders/:id` | Historical item, contact, address and total snapshots. |
| `PATCH /api/admin/orders/:id/status` | `{status, expectedStatus}`; forward fulfillment only. |
| `POST /api/admin/orders/:id/cancel` | `{}`; atomic cancellation RPC only; unavailable before its SQL deployment. |
| `GET /api/admin/products` | Products including archived records. |
| `POST /api/admin/products` | Validated product attributes; server generates ID/slug/date and initial rating/review count. |
| `PATCH /api/admin/products/:id` | Allowlisted editable attributes; stock requires integer `expectedStock`. |
| `DELETE /api/admin/products/:id` | `{}`; archives via `archived=true`, never deletes records. |
| `GET /api/admin/dashboard?months=6` | Statistics, UTC monthly totals (1–12 months), status distribution, recent orders and best sellers. |
| `GET /api/admin/analytics` | Snapshot-based product/stone/type units and order-item values. |
| `GET /api/admin/customers` | Customer profiles, confirmed Auth account email, saved-address city and persisted order summaries; includes email lookup availability. |
| `GET /api/admin/settings` | Existing singleton `store_settings` row with ID 1. |
| `PATCH /api/admin/settings` | Any of `storeName`, `contactEmail`, `shippingFee`, `freeShippingThreshold`. |

Product creation requires `name`, `type`, `stone`, `material`, `price`, `stock`,
`shortDescription`, `sizes`, `defaultSize`, `customizable: {size, color}` and
`customizationFee`. Optional editable properties are `details`, `images`,
`isFeatured`, `isNew`, and `archived`. Changes to sizes/default/customization flags
must send that complete group. Collection stone must exist; supported jewelry
types/materials match the current catalog. Image URLs must be HTTPS without URL
credentials. Inventory is a nonnegative 32-bit integer. Money uses the existing
finite nonnegative numeric(10,2) domain, at most two decimals and 99,999,999.99.
NaN, infinities, negatives, missing required values and malformed formats fail.
The existing product form retains its stricter price/customization-fee UI bounds.

Settings updates never insert missing configuration or modify IDs. Missing row 1
is an explicit service-unavailable error. Both cart quote and checkout use these
authoritative database shipping settings; static marketing copy is not a quote.

## Fulfillment, inventory and snapshots

Allowed fulfillment path: `Pending → Processing → Shipped → Delivered`.
Delivered/Cancelled are terminal. An atomic conditional update checks the expected
previous status, so simultaneous fulfillment/cancellation cannot silently overwrite
one another. Repeating an already-applied fulfillment status returns the current
order. There is no arbitrary backward transition, status injection or direct
Cancelled update. Changing a status does not contact a shipping provider or charge
a payment method.

Intentional inventory edits atomically update `WHERE id = ... AND stock =
expectedStock`; mismatches return `409 INVENTORY_CONFLICT`. Metadata-only edits
omit stock, preventing a stale product editor from overwriting checkout decrements.
A failed comparison closes the stale editor and reloads inventory; it never retries
blindly. This is value comparison, not a version counter: stock changing away and
back cannot be detected. Other administration tools/direct SQL must follow safe
transactional inventory rules. Metadata/settings edits otherwise use last-writer
wins; product IDs and historical order snapshots remain unchanged. Archiving hides
products from public catalog/new quotes without deleting orders, items or wishlist
relations; the editor can restore an archived product.

Dashboard order value excludes Cancelled orders and includes shipping. Product
analytics sum historical `unit_price × quantity`, excluding shipping. Pending,
Processing, Shipped and Delivered all count as non-cancelled demo order value;
these figures are not settled payment revenue. Totals use integer centavos and
safe-integer checks. Monthly boundaries are UTC. Customer count excludes admin
profiles. Customers use confirmed account emails from a server-only Auth admin
directory lookup and city from their default saved address (smallest address UUID
if no default exists). Missing values are null; no order is needed to show either
field. Historical email remains separate as `lastOrderEmail`. Reports page through all rows
in batches of 100 to avoid the default REST result cap. These are application-side
reports for project scale, not a consistent database snapshot or a scalable data
warehouse; concurrent writes across pages/table requests may cause temporary report
differences. Refresh after completing a write.

### Customer information sources and failure behavior

Previously, the Customers endpoint called the general reporting loader, then took
both displayed email (`customer_email`) and city (`ship_city`) from the latest order.
This caused missing information for registered customers with no persisted orders.
The dedicated customer directory now reads only profiles, minimal order summary
columns and minimal saved-address columns; it does not fetch products, collections
or order items for this page.

| API field / displayed column | Current source | Previous source |
| --- | --- | --- |
| `id` | `profiles.id`, referencing `auth.users.id` | Same |
| `name` / Customer | `profiles.name` | Same |
| `phone` (API only) | `profiles.phone` | Same |
| `email` / Customer Email | Auth admin `listUsers`: matching `id`, `email`, nonempty `email_confirmed_at` | Latest `orders.customer_email` |
| `city` / City | Default `addresses.city`; otherwise smallest saved address UUID ascending | Latest `orders.ship_city` |
| `lastOrderEmail` (API only) | Latest persisted `orders.customer_email`; null without orders | Previously exposed as `email` |
| `orderCount` / Orders | Count of persisted orders, including Cancelled | Same |
| `totalSpent` / Total Spent | Sum of non-cancelled persisted `orders.total`, using integer centavos | Same |
| `lastOrderAt` / Last Order | Latest persisted `orders.created_at`, smallest order ID for equal timestamps | Latest persisted order timestamp |

The response remains `{items: [...]}` with an additional boolean
`emailLookupAvailable`. `email` and `city` now return null when unavailable instead
of empty strings. Neither account email nor saved-address city falls back to an
order snapshot. The table label is **Customer Email**, and historical email stays
available through the explicitly named `lastOrderEmail` API field. Search matches
profile name, available account email and saved-address city, ignoring case and
leading/trailing whitespace. Missing fields never match the literal text "null".

Every request still passes provider verification, confirmed administrator checks
and a fresh database role lookup before the Auth admin operation. The existing
server-only privileged Supabase client calls `auth.admin.listUsers` in pages of
200, stopping when all requested profile IDs are found, the directory ends, or
25 pages (5,000 Auth users) have been inspected. There are no per-customer Auth or
address calls. Database reads retain ordered 100-row pagination; in-memory grouping
uses user-ID maps. Raw Auth responses, passwords, tokens, sessions, identities,
metadata and confirmation timestamps are never returned or logged by this code.
Names are never taken from Auth metadata, and pending/unconfirmed emails are not
shown as confirmed account email.

If Auth admin capability is absent, errors, or the scan limit is reached, already
resolved confirmed emails remain available, unresolved emails stay null, and
`emailLookupAvailable` is false. The page displays an explicit retry notice while
retaining genuine customer/order/address information. Missing/unconfirmed Auth
email is individually null even when the directory read succeeds. Database read
failure instead uses the existing safe error/retry state. No email is invented and
historical contact email is never silently relabeled as account email.

This is intended for the project-size directory. Large deployments need a separately
reviewed bounded customer-directory design rather than raising scan limits without
review. Auth/database pagination is not a single transactional snapshot; concurrent
registration, address edits or email changes may require a refresh. No migration,
Auth mutation or account promotion is needed by this change. Live Auth permissions
and existing data have not been queried during development.

## Proposed SQL and deployment blockers

`server/db/schema.sql` is a reference, not an upgrade script. Do not rerun it on the
shared database. Existing tables, records, RLS policies and unrelated grants are
not changed by the application implementation.

- `server/db/proposed/checkout-orders.sql` remains undeployed. It adds nullable
  idempotency columns/index and `customer_checkout(uuid,uuid,jsonb)`. Revised
  finite-money guards match quote settings validation; selected color and matching
  collection count now come from one aggregate statement. Existing stock locks,
  ownership, snapshots and atomic rollback are preserved. See
  [checkout review, remaining concurrency assumptions and deployment gates](checkout-order-placement.md).
- `server/db/proposed/admin-order-cancel.sql` is a new, unexecuted proposal, not a
  proven PostgreSQL migration. It introduces only
  `admin_cancel_order(uuid,text)`. Installation has no record/stock DML. Runtime
  DML restores stock and changes status inside one function transaction. The
  Express route has no sequential REST cancellation fallback.
- The independent `customer-addresses.sql` proposal is not redeployed here.

Cancellation is restricted to Pending/Processing orders created by the checkout
function with non-null checkout key and object request metadata. Deploy checkout
SQL first. It locks the admin profile FOR SHARE, then the order, items by ID and
products by ID (compatible product ordering with checkout),
aggregates all variants per product, guards integer overflow, restores inventory
and marks Cancelled together. A repeated call on Cancelled returns the stored
snapshot without another increment. Existing historical Cancelled records are
never retrospectively restocked. Item counts (1–50), per-item quantities (1–10) and
aggregate quantities (1–500) are validated before restocking. Missing provenance
or invalid history raises P2004, currently sanitized by Express as 503
CANCELLATION_UNAVAILABLE. Legacy/manual non-cancelled orders are rejected instead
of guessing inventory deductions. This relies on metadata/item immutability and
checkout as the only metadata writer. External writers must use compatible
lock order. Pending/Processing orders with inconsistent or missing item/product
history need investigation, not automatic repair.

Both proposals use transaction-local 5-second lock and 60-second statement
timeouts **for deployment only**. No global/role/session-persistent setting or RPC
runtime timeout is changed. Cancellation uses SECURITY INVOKER and empty
search_path, fully qualified table references, a database admin-role recheck, and
EXECUTE restricted to service_role (with PUBLIC/anon/authenticated revoked).
The identity parameter is trusted only because the backend verifies it and ordinary
clients must not have EXECUTE access. Effective inherited/custom-role grants and
deployment-role defaults require live review. Fresh-install CREATE intentionally
fails on conflicting function signatures; do not add CREATE OR REPLACE or hide
conflicts with IF NOT EXISTS.

## Administrator deployment and rollback procedure — instructions only

No deployment is authorized by this document. An authorized administrator must:

1. Verify target project, deployed schema/types/constraints, policies, triggers,
   function overloads/dependencies and effective privileges against these artifacts.
   Confirm all relevant stock, quantity and order history invariants; review every
   external inventory/order writer. Take a recoverable backup and record current
   schema/grants before any approved shared deployment. Never print customer rows
   or secrets in review outputs.
2. In isolated staging, after separate execution approval, deploy checkout using its
   documented procedure and validate it before enabling cancellation. Inspect for
   `admin_cancel_order(uuid,text)` conflicts before applying that exact SQL file.
   On timeout/error, issue ROLLBACK for the aborted installation transaction and
   investigate. Do not skip statements or relax global settings. Neither proposal
   is an automatically repeatable migration.
3. Test ordinary anon/authenticated EXECUTE denial and effective service_role
   allowance with `has_function_privilege` and inspect `pg_proc.prosecdef`,
   `proconfig`, `pg_get_functiondef` and ACLs. For the cancellation signature,
   `prosecdef` must be false and configuration must contain empty search_path.
   Review additional inherited/custom grants as well as direct ACLs. Confirm no
   new table policies or unexpected triggers appeared.
4. Use disposable staging fixtures, never shared customer orders: test one
   cancellation, duplicate simultaneous cancellations, retry after a lost response,
   cancellation versus fulfillment, two orders sharing stock, and concurrent
   checkout versus restocking. Confirm only one restoration, compatible lock order,
   and rejection of Shipped/Delivered, non-admin, missing product, invalid quantity
   and overflow cases. Inject a reviewed isolated fault after the first product
   restoration and confirm all status/stock changes roll back. Source-contract or
   mocked RPC tests cannot prove any of these properties.
5. Shared deployment needs explicit approval after staging passes and a quiet
   window. Apply only reviewed artifacts once, verify effective permissions/schema
   reload, and enable only demonstrated paths. Installation does not itself place
   any order or change inventory.
6. To roll back cancellation capability, disable its application action/calls first;
   under separate authorization revoke its service_role EXECUTE and drop only the
   exact new function using RESTRICT after inspecting dependencies. Never use
   CASCADE. Do not reset order statuses or subtract stock to reverse historical
   cancellations; these require per-order reconciliation, not migration rollback.
   Reverting this function does not undo completed cancellations. For checkout,
   follow its separate rollback instructions and preserve idempotency metadata for
   completed orders. A whole-database restore can overwrite other developers' work
   and must never be the default response to an application rollback.

## Automated validation and manual checklist

Run from repository root; no environment credentials or database access are needed:

```powershell
node --test server/test/*.test.js
node --test src/services/*.test.js
npm run lint
npm run build
git diff --check
```

The customer-directory regression run passed 125 backend and 87 frontend tests. New admin suites
cover expired/customer/unconfirmed/forged roles, current database role revalidation,
cookie/Bearer access, CSRF/Origin/JSON enforcement, snapshot reads, status transitions,
atomic-update contracts, cancellation deployment failures, product validation and
archiving, stale inventory, bounded finite shipping/settings values, paginated
reports, genuine empty states, historical totals, private frontend transport,
uncertain-write handling and no mock fallback. SQL tests inspect files only.

Before a demonstration, using separately authorized disposable accounts/data:

- Confirm anonymous/customer direct admin requests fail and database role demotion
  denies subsequent requests; local team-role selectors must never grant access.
- Check loading/error/retry/empty states with API unavailable, empty orders and
  missing settings. Network failures must not display saved/ordered success.
- Read existing orders; compare names/prices/contact/address/totals after editing
  a product. Test every allowed/forbidden transition and a stale two-window update.
- Create/edit/archive/restore a disposable product; verify catalog visibility.
  Load a stock editor, change stock from another window, then save the stale editor:
  it must fail with conflict. An unchanged-stock metadata edit must preserve stock.
- Save valid settings, reload, and compare quotes at the free-shipping boundary;
  submit invalid/negative/NaN/infinite money through fabricated tests, not corrupt
  shared settings. Before migration, checkout/cancellation must report their real
  blockers without creating pretend orders or restoring inventory in the browser.
- Verify customer summaries, zero totals and UTC monthly values against authorized
  disposable order history. No test order is created automatically.
- For Customers, sign in as an existing confirmed administrator and use read-only
  inspection of already existing authorized records. Confirm a customer with no
  orders shows their profile name, confirmed account email and default-address city,
  with Orders 0, Total Spent 0 and Last Order dash. Where no default exists, confirm
  the smallest saved address UUID supplies city; no saved address must show dash.
  Search by each available name/email/city, including mixed case. A customer's old
  order contact email must not replace their current confirmed account email.
- Check customer loading/offline/retry behavior using local network controls. Use
  the mocked automated tests for Auth failure, missing email, address precedence,
  unauthorized access and pagination; do not alter shared records or disable server
  privileges to manufacture those cases. Ordinary customer/anonymous sessions must
  be rejected from `/api/admin/customers`, including direct requests.

## Remaining limitations for checking

Legacy `src/services/mockDb.js`, demo users/orders/product fixtures remain in the
tree to preserve existing work, but production services no longer import mockDb.
The product data module supplies size presets only; live catalog entries, featured
products, related suggestions and collections come from APIs. Packages, team
profiles, care/specification text and informational policies remain static.
Members & Roles changes only temporary project-team labels and explicitly says
it does not save them; it is not account-role administration. Newsletter is
unavailable and reports that no email was saved. Optional Google OAuth, real
payment processing, shipping-provider integration, notifications, media uploads,
distributed reporting and account-role administration are not implemented. Password
changes use the implemented email recovery flow rather than a mock profile update.

Critical before checking: independently confirm server configuration, availability
of an already authorized confirmed admin, required deployed profile/address schema,
and read access to existing data. Obtain separate approval and PostgreSQL staging
evidence before checkout/cancellation deployment. If these gates are incomplete,
present the tested application paths and explicit blocked states accurately.

## Implementation file inventory

New admin/backend files:
`server/src/admin.js`, `server/src/middleware/admin.js`,
`server/src/routes/admin.js`, `server/src/routes/collections.js`,
`server/db/proposed/admin-order-cancel.sql`, `server/test/admin.test.js`.
Router mounting changed in `server/src/index.js`.

Frontend admin integration:
`src/services/adminService.js`, `src/services/adminService.test.js`,
`src/services/commerceService.js`, `src/components/admin/AdminDataState.jsx`,
and `src/pages/admin/{Orders,Products,Dashboard,Analytics,Customers,Settings}.jsx`.

Catalog/error/mock cleanup:
`src/services/{productService,productService.test,serviceError,authService,teamService,mockDb}.js`,
`src/services/{sessionService,registrationService,recoveryService,otpService,orderService,wishlistService,customerService,checkoutAttempts}.js`
(shared error import changes), `src/pages/account/Security.jsx`,
and `src/pages/{Home,Collections,CollectionDetail,Shop,ProductDetails,Cart,InfoPage}.jsx`.
Documentation updated in this guide, README, checkout and profile/address guides.

The checkout audit corrections and their source-contract tests remain in
`server/db/proposed/checkout-orders.sql`, `server/src/checkout.js`,
`server/test/checkout.test.js` and `server/test/checkout-migration.test.js`.
The working tree also contains earlier uncommitted authentication/customer/cart/
checkout work; this inventory does not imply those earlier changes were discarded
or wholly authored by this admin implementation.
