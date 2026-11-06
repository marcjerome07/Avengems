# Server-validated cart, checkout, and persistent orders

## Status and deployment blocker

The joint [checkout/cancellation deployment review](checkout-cancellation-deployment.md)
now supplies read-only preflight/post-install queries, expected results, isolated
staging tests and backup/approval/rollback gates for both exact proposed SQL files.
It supersedes older deployment notes where the cancellation dependency differs.
Native PostgreSQL 16.13 validation has now passed 23 real local engine checks; see
[executed results](testing/checkout-cancellation-local-results.md). Full Supabase
staging integration and shared deployment remain unverified and blocked.

Server cart quotes, authenticated order reads, the transactional checkout API contract, and frontend integration are implemented. **New order placement requires review, explicit approval, and deployment of `server/db/proposed/checkout-orders.sql`.** The repository had no existing checkout RPC or order idempotency columns. The API fails closed with 503 `CHECKOUT_MIGRATION_REQUIRED` when the function is absent. It never substitutes sequential REST inserts/stock updates.

No shared SQL or live Supabase records/settings were changed. The exact proposed
SQL has now installed and executed successfully against a fresh local PostgreSQL
database using the unmodified baseline schema and disposable Auth/role adapters.
Real local transaction, rollback, concurrency and permission checks are recorded
in the linked evidence. Actual shared schema/grants, Supabase integration and live
persistence still require approved validation before deployment. The previously
deployed address function is independent and is not redeployed by this module.

## API contracts

All requests are relative `/api` URLs and responses use `Cache-Control: no-store`. POST requests require JSON, the exact configured Origin, existing signed CSRF cookie, and matching `X-CSRF-Token`, including requests using Bearer authentication. Bootstrap CSRF at `GET /api/auth/csrf` with credentials.

### POST /api/cart/quote

Available to guests and customers. No privileged customer identity is accepted. Maximum 50 lines, each quantity 1–10; matching products across variants share the same stock pool. Rate limit: 60 requests per IP per minute, per server process, bounded to 10,000 keys.

```json
{
  "items": [
    { "productId": "p-01", "quantity": 2, "color": "Purple", "size": "US 5" }
  ]
}
```

Each line accepts only `productId`, `quantity`, `color`, and `size`. Product IDs use 1–100 ASCII letters/digits/underscores/hyphens and start with a letter or digit. Omitted/null options select the product defaults. Client prices, fees, stock, discounts, and totals are rejected.

Response: `{ "items": [CartLine, ...], "totals": {...} }`. CartLine contains the canonical product name/slug/type/material, selected stone/color/size, quantity, stock-based maximum, basePrice, customizationFee, unitPrice, customized flag, images, and lineId. API money values are pesos as numbers; server calculations use integer centavos.

Fabricated totals example:

```json
{
  "itemCount": 2,
  "subtotal": 1800.20,
  "customizationTotal": 200.40,
  "shippingFee": 0,
  "total": 2000.60,
  "freeThreshold": 2000,
  "freeShippingRemaining": 0
}
```

### POST /api/me/orders

Requires a server-verified, confirmed customer, valid stored customer profile, and UUID v4 `Idempotency-Key` header. This endpoint follows the existing `/api/me` ownership boundary rather than adding another authentication architecture.

```json
{
  "items": [{ "productId": "p-01", "quantity": 2, "color": "Purple", "size": "US 5" }],
  "customer": { "name": "Customer Name", "email": "customer@example.test", "phone": "09171234567" },
  "shipping": { "address": "12 Test Street", "city": "Manila", "province": "Metro Manila", "postalCode": "1000" },
  "paymentMethod": "cod"
}
```

Alternatively, shipping can be exactly `{ "addressId": "<saved-address-uuid>" }`; it cannot be mixed with manual fields. The SQL checks ownership under the transaction and snapshots the saved address's postal fields. The existing schema uses checkout customer contact details for the recipient; it has no separate recipient-name/phone columns. Contact details can differ from the account, as documented in `docs/data-requirements.md`.

Only the four top-level fields above are accepted. Customer fields are exactly name/email/phone; manual shipping fields are address/city/province/postalCode. Profile/address validators normalize names and PH mobile numbers; email is normalized and validated. Street address is limited to 300 characters, city/province to 100, and postal code to four digits. Ownership, role, status, amounts, and card details cannot be supplied by the browser.

Both initial success and a same-key replay return 200 with the persisted sanitized Order. It includes id, createdAt, status, paymentMethod, customer, shipping, items, subtotal, customizationTotal, shippingFee, and total. Items use historical name/slug/type/material/stone/color/size, basePrice/customizationFee/unitPrice, customized flag, and quantity. Internal checkout request/key and owner ID are excluded.

### GET /api/me/orders and GET /api/me/orders/:id

Both require confirmed customer authentication. Listing returns `{ "items": [Order, ...] }`, newest first, fetching batches of 100. Detail returns Order. Queries always filter by verified `user_id`; another owner's/nonexistent reference returns the same 404. Legacy frontend userId/isAdmin arguments cannot override backend ownership. No admin order-management API was added or weakened.

Errors use `{ "code": "...", "message": "safe explanation" }`: 400 validation/customization, 401 authentication, 403 Origin/CSRF/customer/profile rejection, 404 missing shipping address/order, 409 unavailable products/stock shortage/idempotency conflict, 415 unsupported content type, 429 quote rate limit, or 503 sanitized database/checkout/migration errors. A nonconfirmed checkout response never causes cart removal.

## Price and shipping calculations

The backend fetches non-archived products with their collection, supported collection colors, and singleton `store_settings` ID 1. Missing products, invalid options, duplicate variants, and quantities exceeding aggregate product stock are rejected. Noncustomizable options must equal the product default; customizable sizes must appear in `sizes`, and selected colors must identify a supported collection. Ambiguous collection colors fail closed.

For each line:

- Subtotal contribution = authoritative base price × quantity.
- Customization applies once per unit if either selected color or size differs from the default, regardless of how many options changed.
- Customization contribution = authoritative customization fee × quantity when customized, otherwise zero.
- Merchandise = subtotal + customization total.
- Shipping = zero when merchandise is at least `free_shipping_threshold`, otherwise `shipping_fee`.
- Total = merchandise + shipping. No extra tax/discount/payment charge is invented.

Current schema seed values are ₱120 shipping and a ₱2,000 threshold; the backend reads current database settings rather than assuming those defaults. Quote arithmetic uses integer minor units; checkout SQL uses exact PostgreSQL numeric arithmetic. Amounts are bounded to fit existing numeric(10,2) order columns. Quotes do not reserve stock or authorize checkout prices. SQL recalculates independently; a later order can reflect changed catalog/settings values, and its stored confirmation is authoritative.

Both paths validate **all four configured monetary inputs** before using them: product price, product customization fee, store shipping fee, and free-shipping threshold. A configured customization fee is validated even when no customization is selected; the shipping fee is validated even when shipping will be free. The charged fee remains zero for uncustomized items and qualifying free-shipping orders. This deliberately rejects invalid catalog configuration rather than silently ignoring an invalid uncharged fee.

The accepted input domain is finite, nonnegative money fitting numeric(10,2): at most eight integer digits and two decimal places. SQL validates each native numeric value's decimal text against `^[0-9]{1,8}([.][0-9]{1,2})?$`, with an explicit NULL rejection. JavaScript's cents parser accepts only number/string values in the equivalent decimal domain. NaN, Infinity, -Infinity, negative values, missing values, malformed strings, excess precision, and out-of-range values fail closed. The SQL also checks derived subtotal/customization/shipping/total invariants for NULL, non-finite, and negative values before its existing order-amount limit and before any order/stock DML. Validated finite inputs and exact numeric arithmetic make the derived unit price finite as well.

Invalid quote configuration returns 503 CATALOG_UNAVAILABLE. The SQL raises an unhandled exception for invalid pricing/settings; the existing Express mapping safely returns 503 CHECKOUT_UNAVAILABLE and preserves the pending key. No new RPC parameters, public response fields, payment/status values, or error-code mappings are introduced. A successful same-key replay still returns its historical order before validating current catalog/settings, so later configuration problems cannot cause another inventory decrement or change the stored totals.

## Proposed atomic checkout and inventory safety

The proposed SQL adds two nullable columns on orders: `checkout_key uuid`, `checkout_request jsonb`. A partial unique index on `(user_id, checkout_key)` protects non-null keys. Existing orders remain unchanged with null metadata. Existing snapshot columns already satisfy the required history, so no payment/status or snapshot columns are invented.

`public.customer_checkout(uuid, uuid, jsonb)` uses SECURITY INVOKER and empty search_path with qualified tables. Execution is revoked from PUBLIC/anon/authenticated and granted to service_role. The existing privileged server client remains behind identity/customer/CSRF validation. The function intentionally trusts only that privileged backend to supply `p_user_id`; it is not a direct authenticated-browser RPC.

Transaction order:

1. Lock the customer profile, serializing that customer's checkouts and idempotency checks.
2. Return an existing same-key/same-normalized-request order before examining current stock, prices, or addresses. A different request with the same key raises 409.
3. Validate request structure/contact/shipping. Resolve a saved address with `user_id = p_user_id` and snapshot its postal fields under a shared lock.
4. Lock store settings and existing collection rows against updates/deletes. Lock all requested product rows in sorted ID order to reduce purchase deadlocks.
5. Recheck non-archived status, options, duplicate variants, and summed quantities for each product. Build snapshots and recalculate exact amounts.
6. Insert Pending order and historical items, then decrement each product once using `stock >= requested_quantity` as an additional guard.
7. Return the complete persisted order. Any exception aborts the RPC transaction, rolling back order, items, idempotency metadata, and inventory together.

New references are `AVG-<UTC year>-<32 hexadecimal UUID characters>`. The existing text primary key supports this; the five-digit random demo numbering space is not reused. Confirmation styling permits wrapping long references.

All checkouts using the function coordinate through the same locks. Other stock-management code must also respect transactional inventory rules. Deadlocks/serialization errors from external writers fail safely; the application retains the same checkout key for an explicit retry. There is no inventory reservation, cancellation/restock flow, or actual payment settlement in this module.

### Collection resolution and remaining concurrency assumptions

The selected stone and matching-row count now come from one statement: `SELECT min(c.stone), count(*) INTO chosen_stone, color_matches ... WHERE c.color = chosen_color`. Both aggregates read the same statement snapshot. Zero matches produce INVALID_CUSTOMIZATION; multiple matches fail closed as unavailable catalog configuration. `min` never authorizes picking an arbitrary duplicate: the function rejects count > 1 before using the result. Explicit cardinality checks are required because an aggregate query returns one result row even when there are zero matching source rows; FOUND is not a cardinality check here.

The previous separate duplicate-count and LIMIT 1 lookup have been removed. At normal Read Committed isolation, a collection insert committed between those earlier statements could change the resolution. The single aggregate eliminates that window. Existing collection SHARE locks still do not prevent new rows: an insert visible when the resolution statement starts participates in its count; an insert after that snapshot does not retroactively change the chosen stone for that line. Later statements/lines can see newer inserts and reject the whole checkout. There is no claim that the entire checkout sees one frozen catalog snapshot, and no new uniqueness constraint or table-level catalog lock is introduced.

Deploy with the existing columns/constraints, confirmed non-null collection stone/color values, and a known transaction-isolation configuration. Coordinate catalog maintenance and review all external inventory writers; they must honor transactional stock updates and a compatible lock order. Higher isolation levels or external lock orders can still cause serialization/deadlock failures. None of those failures should leave partial order, item, metadata, or stock changes. Verify these assumptions with actual PostgreSQL sessions in isolated staging.

### Deployment-only transaction timeouts

Immediately after BEGIN and before the first ALTER TABLE, the proposed file now contains:

```sql
set local lock_timeout = '5s';
set local statement_timeout = '60s';
```

These are reviewed conservative defaults for this small application's additive migration: wait at most five seconds for any individual lock acquisition and allow at most sixty seconds per statement. They are not a promise that an unknown shared orders table can be indexed within that time, nor a total migration deadline. The lock limit is shorter than the statement limit so a busy shared database fails promptly instead of waiting indefinitely. Index construction still scans existing orders, and the earlier ALTER TABLE lock can block order reads/writes until transaction end; a coordinated quiet window remains necessary.

SET LOCAL resets on COMMIT or ROLLBACK. These statements do not change database-wide, role-wide, session-persistent, or function runtime settings. Existing checkout calls continue to use their deployment environment's runtime limits. See [PostgreSQL SET LOCAL](https://www.postgresql.org/docs/current/sql-set.html) and [timeout semantics](https://www.postgresql.org/docs/current/runtime-config-client.html).

If a deployment lock or statement times out, stop and roll back the aborted installation transaction. Inspect blockers/table size and arrange a quiet window. Do not retry by skipping statements, changing global settings, removing guards, or using IF NOT EXISTS to hide conflicting objects. If staging measurements require a different bounded limit, revise the proposed artifact under separate review/approval before shared deployment. Applying the file and timeout tests remains prohibited until authorized.

## Idempotency and browser state

The server retains idempotency metadata on the order without expiration. Same customer/key and equal normalized JSON return the original order and never decrement stock again, including when that order's address/product has subsequently changed or disappeared from active catalog reads. Different customers can use the same UUID independently. Deleting orders or their metadata administratively removes this replay protection and is outside the supported flow.

Before submission, Checkout persists a frozen normalized request and cryptographically generated key in sessionStorage, scoped by verified account ID. It contains selections, contact details, shipping, and method only. **It contains no card number, CVV, expiry, password, or auth token.** This draft includes personal contact/address information; it remains until confirmation/definite rejection or tab-session expiry. Browser cart selections remain in their existing localStorage location.

If storage is blocked, checkout refuses submission so it can preserve retry identity across remounts. Uncertain network/provider/JSON outcomes retain the draft and key. The pending banner retries its original contents even if the current cart quote now fails or the browser cart changed. Fields are frozen during pending confirmation. Same-account retries after reload use that draft; another account cannot submit it. A stale session cannot complete the current cart.

Only definite pre-write or transaction-rejected errors release the draft. Missing RPC is a definite deployment rejection. An idempotency conflict remains blocked for investigation. Card inputs are discarded from React state after submission; they are excluded from network/storage at the service boundary.

On confirmed order creation, purchased quantities are removed from the browser cart. Items or quantities added while an uncertain checkout was pending are preserved. The confirmation page then fetches the stored order through its authenticated owner-scoped endpoint before showing success. Existing account orders, details, and Overview now consume persistent order reads with retry/error states.

Automatic retries are limited to one explicit authentication rejection/refresh and one CSRF rejection, retaining the same key. Network or ambiguous server failures are never silently replayed. Quote requests are debounced by 200 ms and obsolete requests are aborted; stale quote data is hidden immediately. Until a quote is available, Cart/Checkout hide cached monetary values and disable fresh order submission.

## Demo payments

Supported method labels remain gcash, maya, cod, and card. Every order starts Pending. No wallet redirect, real card processing, payment status, webhook, or charged-money claim is implemented. Existing test-card validation remains local only; use fabricated test details. The checkout notice explicitly states demo payment and that card details are not sent or stored.

## Validation and test instructions

From the root using existing installed dependencies:

```powershell
node --test server/test/*.test.js
node --test src/services/*.test.js
npm run lint
npm run build
git diff --check
```

New suites: `server/test/checkout.test.js`, `server/test/checkout-migration.test.js`, and `src/services/checkoutService.test.js`. They use fabricated data, injected dependencies, mocked HTTP transport, Vite SSR, and read-only SQL-file inspection. Coverage includes money/shipping boundaries, invalid options and aggregate stock, request allowlists, authentication/CSRF, owner-scoped order reads, historical response mapping, migration/error responses, same-key duplicate requests, simulated concurrent purchase outcomes, retry drafts, session changes, confirmation-only cart cleanup, and loading/error presentation. Existing modules remain in full regression runs.

The audit-correction regressions exercise non-finite/malformed/missing/out-of-range monetary inputs for each configured field, including invalid uncharged customization fees and invalid fees on free-shipping orders. They check zero/exact-centavo/threshold boundaries and duplicate collection colors in both row orders. The migration source-contract suite verifies transaction-local bounded timeouts before DDL, equivalent money-pattern acceptance, guard placement before arithmetic/writes, one-statement color/count resolution, zero/multiple-match rejection, ownership and stock lock contracts, replay ordering, additive schema scope, invoker security, and unchanged restricted function grants. It reads the SQL as text; it never connects to a database or executes any statement. Its money-pattern comparison runs the extracted pattern in JavaScript and is not a substitute for PostgreSQL regex/numeric tests.

Targeted audit-correction checks can also be run with `node --test server/test/checkout.test.js server/test/checkout-migration.test.js`.

**Important test boundary:** mocked RPC outcomes verify the application contract and absence of unsafe REST writes. They do not prove SQL compilation, atomic rollback, lock ordering, or overselling prevention in PostgreSQL. Those tests are deployment gates below. No real orders or live customer records are used by automated tests.

## Deployment review and manual verification

Do not deploy the SQL without explicit approval. An authorized administrator must:

1. Confirm the target database, a recoverable backup, PostgreSQL version supporting core `gen_random_uuid()`, and the deployed columns/types/defaults/constraints of profiles, products, collections, addresses, orders, order_items, and store_settings.
2. Check for existing checkout RPC overloads, columns named checkout_key/checkout_request, index orders_customer_checkout_key, custom triggers, function-default grants, and unexpected write paths. Stop on conflicts; do not run schema.sql or automatically replace unrelated objects.
3. Review the exact SQL in `server/db/proposed/checkout-orders.sql`, including its extra retained JSON contact data, role grants, locks, and reference format. The migration intentionally is not repeatable: an existing conflicting object aborts its transaction. It does not backfill or edit historical rows.
4. After approval, apply to isolated staging first. Validate first-order snapshots and numeric totals, identical-key replay after stock/address changes, different-request key conflict, two concurrent purchases of the last unit with different customers/keys, and duplicate simultaneous same-key requests. Confirm at most available inventory is sold and one order exists per customer/key.
5. In staging only, use an independently reviewed temporary failing trigger or equivalent controlled fault after order/item insertion to test rollback. Confirm no order/items/idempotency record remains and stock is unchanged. Remove the test fault before deployment. The provided migration does not install a fault trigger.
6. Verify saved-address cross-owner and missing-ID rejection; verify ordinary authenticated/anon roles cannot execute the function. Inspect effective function privileges, including custom roles inherited from deployment-role default grants. No RLS changes should appear.
7. After staging results and explicit shared-database deployment approval, apply the exact migration once using the authorized database administrator. It includes BEGIN/COMMIT and PostgREST schema reload notification. Confirm function signature, grants, and index before enabling order placement.

Additional staging gates for the audit corrections, requiring separate execution approval:

- Verify native PostgreSQL numeric-to-text/regex behavior for zero, cents, maximum supported amounts, NULL, NaN, Infinity, and -Infinity. Existing constrained numeric(10,2) columns reject infinities on assignment; do not relax their types or constraints just to inject an infinity. Use a separately reviewed isolated expression/scratch test for the guard's native numeric cases. NaN is a distinct case that PostgreSQL numeric can store despite ordinary nonnegative comparisons.
- With disposable staging configuration only, test NaN/negative/missing shipping settings, NaN/negative price or customization fee, an uncustomized line with an invalid configured fee, and a free-shipping order with an invalid configured shipping fee. Confirm quote/checkout both reject invalid configuration and that no new order/items/metadata or stock decrement survives. Restore only the dedicated test fixture; do not repair shared production rows automatically.
- Test unique, zero-match, and duplicate selected colors. Interleave a second session's collection insertion around resolution: verify count and selected stone come from the same resolution snapshot, duplicates visible to that statement abort checkout, and no arbitrary LIMIT 1 selection remains. Test later-line failure rolls back earlier work. No predicate/table lock or global collection snapshot is promised.
- Record the staging session's original timeout values. Hold a conflicting orders-table lock in a separate staging session, then attempt installation: verify the five-second lock timeout aborts the transaction without publishing columns/index/function/grants. Separately test the sixty-second statement timeout with a reviewed slow statement in an isolated transaction. After rollback/commit, verify settings returned to their original values. Do not induce contention or sleep tests on the shared database.
- Re-run last-unit purchases, duplicate same-key submissions, lost-response replay, snapshot preservation, failure-after-insert and failure-after-stock-update rollback, and role-permission tests against PostgreSQL. The new source-contract tests cannot establish these runtime guarantees.

Browser checks using authorized disposable test accounts/data:

1. Start `npm --prefix server run dev` and `npm run dev` in separate terminals with existing configuration and matching APP_ORIGIN.
2. Add default/customized variants; visit `/cart`. Verify loading, authoritative per-unit amounts, once-per-unit customization, summed stock validation, and shipping below/at the threshold. Change quantities rapidly; confirm stale quotes are discarded. Tamper browser prices and confirm server values prevail.
3. Before migration deployment, try demo COD checkout. Confirm a clear deployment-required response, no order/inventory changes, and retained cart. Quotes and order reads remain usable.
4. After approved deployment, sign in as a test customer. Use manual shipping and an owned saved address in separate orders. Verify demo wording, Review totals, duplicate-click protection, and no card fields in network/session storage.
5. Confirm order/items and inventory changes in an authorized Supabase view filtered to the test account. Reload confirmation and My Orders; change a disposable product name/price or address under separate authorization and confirm stored order snapshots remain unchanged.
6. Throttle/disconnect the order response. Confirm the cart remains, a frozen retry draft appears, and retry/reload uses the same key. Verify one order/inventory decrement after confirmation. Add another browser cart item before retry and confirm it is preserved.
7. Switch accounts during bootstrap/submission. Confirm the old pending request is not sent or shown as a new account's order. Check cross-user order references and saved addresses return 404. Test absent/expired credentials and rejected Origin/CSRF.
8. Check quote network/stock errors, explicit Retry, insufficient-stock response after a quote, and quote refresh after rejection. Test malformed pending draft/blocked session storage: submission must remain blocked; check My Orders before clearing storage or starting another draft.
9. Smoke-test products, wishlist, login/logout, registration/email verification, recovery, profile/address changes, and the persisted admin APIs/pages described in [admin management](admin-management.md). Do not place production customer orders for testing.

Rollback: if installation fails before commit, roll back the open transaction. After deployment, pause order writes and use a separately reviewed rollback that drops only `public.customer_checkout(uuid,uuid,jsonb)` with RESTRICT and reloads PostgREST. Retain the new columns/index and historical data to preserve replay information for redeployment. Do not use CASCADE or delete orders/reset inventory as a migration rollback. Already committed orders require a separate business cancellation/restock design.

## Files and remaining limitations

New: `server/src/checkout.js`, `server/src/routes/checkout.js`, `server/db/proposed/checkout-orders.sql`, `server/test/checkout.test.js`, `server/test/checkout-migration.test.js`, `src/services/commerceService.js`, `src/services/checkoutAttempts.js`, `src/hooks/useCartQuote.js`, `src/services/checkoutService.test.js`, and this document.

Updated: `server/src/index.js`, `server/src/routes/me.js`, `src/services/cartService.js`, `src/services/orderService.js`, `src/context/CartContext.jsx`, `src/components/cart/OrderSummary.jsx`, `src/pages/Cart.jsx`, `src/pages/Checkout.jsx`, `src/pages/OrderConfirmation.jsx`, `src/pages/OrderConfirmation.css`, `src/pages/account/Orders.jsx`, `src/pages/account/OrderDetails.jsx`, and `src/pages/account/Overview.jsx`. `README.md` and the note in `src/pages/admin/Settings.jsx` now describe server quote authority accurately; admin setting behavior is unchanged.

Live schema compatibility and PostgreSQL transaction behavior remain unverified until approved staging/deployment. Quotes are informative and can change at checkout; there is no inventory reservation. Separate new checkout keys represent separate purchase intent, including across independent tabs/devices. Closing a tab/clearing its pending storage loses the browser's retry draft: check My Orders before starting another order after an uncertain outcome. Admin orders, settings, products and reports now use persisted APIs; fulfillment advances through guarded status changes. Atomic cancellation/restock requires the separate proposed `admin-order-cancel.sql`, reviewed and tested before deployment. Admin stock edits use an atomic expected-stock condition and metadata-only edits omit unchanged inventory. See [admin implementation and concurrency limits](admin-management.md). The quote rate limiter is per-process/IP and does not add distributed infrastructure or alter proxy trust. Real payment processing, shipping-provider integration and notification delivery remain outside this implementation.

Recommended next module: persistent administrative order management and fulfillment, including controlled cancellation/restock before any real payment integration.
