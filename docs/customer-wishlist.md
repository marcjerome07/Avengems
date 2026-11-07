# Persistent customer wishlist

## Feature and implementation scope

Confirmed customers can save and remove catalog products through Express APIs backed by Supabase `public.wishlist_items`. Wishlist data is read on authentication and persists independently of browser storage. Product-card hearts, homepage grids, product details, quick view, account counts, and the account wishlist share the same account-scoped state. Quick view now includes a wishlist action using existing button styling.

The existing schema is sufficient: `user_id uuid references profiles`, `product_id text references products`, `created_at timestamptz default now()`, and composite primary key `(user_id, product_id)`. Both foreign keys cascade on deletion in the repository schema. No migration, table, grant, policy, credential, or database setting was changed. The schema contract was inspected in `server/db/schema.sql`; the deployed shared database was not queried or modified for this module. The address function is independent of this module and was not redeployed.

## API contracts

| Method | Endpoint | Request | Success response |
| --- | --- | --- | --- |
| GET | `/api/me/wishlist` | None | 200 `{ "items": [Product, ...] }` |
| POST | `/api/me/wishlist` | `{ "productId": "p-01" }` | 200 `{ "item": Product }` |
| DELETE | `/api/me/wishlist/:productId` | `{}` | 200 `{ "ok": true, "productId": "p-01" }` |

`Product` uses the exact existing `/api/products` response mapper, including ID, slug, name, prices, stock, customization properties, images, and collection color/gemstone. Neither owner IDs nor wishlist database records are returned. Empty lists return `{ "items": [] }`.

POST accepts exactly one `productId` field. IDs contain 1–100 ASCII letters, digits, underscores, or hyphens, beginning with a letter or digit. This supports the current catalog's IDs such as `p-01`; IDs are not UUIDs. Missing values, invalid types, extra fields, and client ownership fields receive 400. DELETE requires an empty JSON object and applies the same identifier validation.

GET fetches batches of 100 ordered by product ID, avoiding silent truncation at the database row cap. Embedded inner joins retrieve only non-archived products with their required collection data. Adding checks product existence and `archived = false` with the same catalog selection. Out-of-stock products can be wishlisted, consistent with catalog visibility and the wishlist's existing out-of-stock presentation.

Adds use `upsert` with `onConflict: 'user_id,product_id'` and `ignoreDuplicates: true`: repeated or simultaneous adds do not create duplicates or reset the existing saved timestamp. Both initial and repeated adds return 200. Removal deletes only the verified owner's matching product; missing or already-removed items also return 200. Removal is allowed for archived/nonexistent IDs to make cleanup predictable.

Errors follow the existing `{ "code": "...", "message": "..." }` contract:

- 400 `VALIDATION_ERROR`: unsupported body fields or invalid product ID.
- 401 `UNAUTHORIZED`: missing, invalid, or expired identity/session.
- 403 `CSRF_REJECTED`: failed exact Origin or signed CSRF checks.
- 403 `CUSTOMER_REQUIRED` / `PROFILE_UNAVAILABLE`: unconfirmed/noncustomer identity or unusable profile.
- 404 `PRODUCT_UNAVAILABLE`: missing/archived product on add, or foreign-key failure during insertion.
- 415 `UNSUPPORTED_MEDIA_TYPE`: writes without JSON content type.
- 503 `DATABASE_UNAVAILABLE`: sanitized database/provider failures.

## Authentication, ownership, and security

The router is mounted beneath `/api/me` **after** existing authentication, write protection, and confirmed-customer validation. HttpOnly cookie sessions and explicit Bearer credentials retain their current behavior. An invalid explicit Authorization header cannot fall back to cookies. Recovery tokens remain subject to the existing normal-access-token exclusion.

Every POST/DELETE requires the exact configured Origin, signed CSRF cookie, matching `X-CSRF-Token`, and JSON content type, including Bearer-authenticated requests. All private responses inherit `Cache-Control: no-store`.

Owner IDs are taken only from `req.auth.userId`. Privileged reads and deletes filter by that ID; inserts supply it directly from verified identity. Query parameters cannot override ownership. A customer's deletion of a product saved only by another customer is an idempotent no-op; it does not disclose that other customer's record. Existing composite-key uniqueness provides duplicate protection without a new database function.

The existing server-only privileged client is reused. No key or provider exception is returned to the browser, and wishlist handlers do not log raw database errors. RLS and grants are unchanged. The frontend uses the existing shared `ServiceError` type; it no longer uses mock wishlist records or browser storage.

## Frontend integration and concurrency

`wishlistService.js` performs relative requests using `credentials: 'include'` and `cache: 'no-store'`. Writes first bootstrap `/api/auth/csrf`. One authentication refresh and one CSRF retry are allowed only after explicit pre-write rejection. Network failures, non-JSON results, and database errors do not automatically replay uncertain writes.

`wishlistStore.js` manages memory-only, owner-scoped product snapshots. The provider loads once when a verified customer becomes authenticated and reuses that state across product grids and account pages. Account changes clear prior items and invalidate/abort old requests; render-time ownership gating hides prior data before the synchronization effect runs. Async stages also check the current authentication store, so an old request cannot continue after CSRF/session bootstrap using a later account's cookies. Late successes/failures cannot update a later owner/session.

Heart changes are optimistic. A per-product pending lock ignores repeat clicks until the first operation settles; different products can be updated independently. Success uses the returned canonical product. Failure rolls back only that product, shows an error, and requires an explicit refresh/retry to reconcile potentially committed server state. No success toast is shown for an unconfirmed write. Loading/error states and Retry are distinct from an empty wishlist.

The wishlist page uses products returned by its existing context instead of issuing a second product lookup. It provides Refresh wishlist for other-device changes. Refresh waits for in-flight mutations before reloading. Auth restoration with the same owner does not refetch every minute. Heart controls preserve existing icons, active classes, aria-pressed state, and toast text, with disabled/busy feedback while loading or pending. Rapid repeated Move to cart actions are also guarded locally.

## Anonymous users

Anonymous, initializing, unconfirmed, and admin sessions have no customer wishlist state. An anonymous heart click displays a sign-in prompt and link; it does not call a private API or store a product. A later sign-in loads only that account's server wishlist.

Old browser `wishlist` data is neither read, imported, nor deleted. It has no verified owner and cannot be safely assigned to a customer. No automatic guest-to-customer merge occurs.

## Testing

Implementation files:

- Backend: `server/src/routes/wishlist.js`, `server/src/routes/me.js`, `server/src/routes/products.js` (shared catalog response mapper).
- Frontend services/state: `src/services/wishlistService.js`, `src/services/wishlistStore.js`, `src/context/WishlistContext.jsx`.
- Consumers: `src/components/product/ProductCard.jsx`, `src/components/product/QuickViewModal.jsx`, `src/pages/ProductDetails.jsx`, `src/pages/account/Wishlist.jsx`, `src/pages/account/Overview.jsx`.
- Tests: `server/test/wishlist.test.js`, `src/services/wishlistService.test.js`.
- Documentation: `docs/customer-wishlist.md`.

From the repository root with the existing dependencies installed:

```powershell
node --test server/test/*.test.js
node --test src/services/*.test.js
npm run lint
npm run build
git diff --check
```

The backend wishlist suite uses injected database/authentication clients and ephemeral HTTP servers. It covers cookie/Bearer paths, private owner-scoped retrieval, batches, empty lists, additions/removal, duplicate requests, missing/archived products, ownership injection, cross-account isolation, Origin/CSRF, expiration, safe errors, and foreign-key races.

Frontend tests mock fetch, control deferred promises, test the production state store, and render the production React components through Vite SSR. They cover request contracts, no browser storage, bounded refresh/CSRF retries, owner changes during bootstrap, initialization/loading/error/retry, optimistic rollback, independent concurrent products, rapid repeats, logout/account switching, and stale responses. SSR checks cover wishlist presentation and heart state; they do not simulate a real browser/device session or establish live database persistence. Existing authentication, recovery, registration, products, profile, address, and session tests remain included.

Automated tests do not create real users, contact Supabase, or modify real customer records.

## Manual browser and Supabase verification

Use two authorized test customers, A and B, and disposable wishlist items. Do not print credentials or use production customer data as fixtures.

1. Start `npm --prefix server run dev` and `npm run dev` in separate terminals with the existing authorized configuration. Open the Vite URL with the configured APP_ORIGIN.
2. While signed out, click a heart on the homepage or shop. Confirm the sign-in toast, no private wishlist request, and no new browser wishlist storage.
3. Sign in as A. Confirm a single initialization request to `GET /api/me/wishlist`, loading feedback, and the correct empty or saved state. Confirm profile/address pages and products still work.
4. Save a product using a card, product details, and quick view. Confirm the corresponding hearts and account count agree. Rapidly click one heart: confirm one pending mutation, no duplicate rows, and success feedback only after confirmation.
5. Open `/account/wishlist`; verify product details, stock handling, Remove, and Move to cart. Confirm the page does not issue a second product-list lookup. Remove twice through the API and confirm both requests succeed without affecting another customer.
6. In an authorized Supabase table view, filter `wishlist_items` by A's verified profile UUID. Confirm each expected `(user_id, product_id)` appears once. Inspect only the test customer's records. Reload the browser, sign out/in, and verify persistence. Sign in as A on another device and verify the saved products appear. Use Refresh wishlist on an already-open device to observe remote changes.
7. Sign out, then sign in as B. Confirm A's hearts, count, and cards disappear immediately, and B receives only B's records. With throttled network, repeat account switching while initialization, CSRF bootstrap, add, and remove requests are pending; confirm no late A result appears or is replayed as a B write.
8. Try POST bodies containing `userId`, `user_id`, or `role`; confirm 400. Try DELETE with another customer ID in query/body; confirm query identity is ignored and body ownership is rejected. Verify the other customer's saved row remains intact.
9. Remove Origin/CSRF headers or use a different Origin for POST/DELETE. Confirm 403 and no row changes. Test missing/expired sessions; confirm safe 401 or the existing single refresh flow.
10. Test a nonexistent/archived product ID: add returns 404. An out-of-stock non-archived product may be saved. If a disposable saved product becomes archived through an independently authorized catalog operation, Refresh wishlist hides it without deleting unrelated data.
11. Simulate offline reads/writes. Confirm loading ends in a visible error, Retry works after reconnecting, failed optimistic changes roll back, and no uncertain write is silently replayed. Check refresh against Supabase after an uncertain response before retrying a change.
12. Smoke-test login/logout, registration/email confirmation, recovery, products, profile/address updates, and checkout address selection. No migration is part of these instructions.

## Known limitations

- Live shared-database compatibility and multi-device persistence require the manual checks above; the repository schema is the implementation contract.
- There is no realtime subscription. Other-device changes appear on initialization, browser reload, or explicit Refresh wishlist.
- A catalog product can be archived between validation and insertion. That saved row is hidden on subsequent reads; this does not grant access to an archived product or remove existing customer data. A product deletion race is handled as a safe 404.
- Repeated requests in separate devices follow database commit order; simultaneous add/remove intent is not synchronized across devices. Existing uniqueness prevents duplicate rows.
- A transport failure may occur after the database committed. The client rolls back its optimistic view and requires reload to reconcile; it does not assume the server rolled back.
- Move to cart uses the existing cart implementation. If adding to the cart succeeds but wishlist removal fails, the cart item remains and the wishlist removal shows an error. Cart/checkout persistence is outside this module.
- Existing archived wishlist rows are retained and hidden; this module performs no historical cleanup or guest-data migration.

Recommended next module: persistent customer checkout and order management.
