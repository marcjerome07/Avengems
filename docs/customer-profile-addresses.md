# Customer profile and address management

## Implementation status

Profile updates and address reads use the existing Supabase database client. All frontend profile/address operations now use relative API requests, never mock user records. Address mutations are implemented through an atomic database RPC, but require approval and deployment of `server/db/proposed/customer-addresses.sql`. That file is a proposal only: no migration, database write, dashboard change, or real-user test was performed during implementation. Without the RPC, address mutations fail closed with HTTP 503 `ADDRESS_MIGRATION_REQUIRED`.

The existing `server/db/schema.sql` remains unchanged. Its `profiles` and `addresses` columns are the source of truth. No columns or RLS policies were added or weakened.

## API contracts

All endpoints require the existing verified-token authentication middleware. It supports HttpOnly application cookies and explicit Bearer credentials; an invalid explicit Authorization header never falls back to cookies. All responses use `Cache-Control: no-store`. Existing `GET /api/me` behavior is preserved, including admin identities and the `verified` flag. New operations require a confirmed customer with a valid stored profile.

Every write requires the exact configured `APP_ORIGIN`, existing signed CSRF cookie, matching `X-CSRF-Token`, and `Content-Type: application/json`, including Bearer requests. Obtain CSRF using `GET /api/auth/csrf` with credentials before writing. No client-supplied owner ID is accepted.

| Method | Endpoint | Request | Success |
| --- | --- | --- | --- |
| GET | `/api/me` | None | 200 sanitized profile |
| PATCH | `/api/me` | Nonempty subset of `{ "name": "Customer Name", "phone": "09171234567" }` | 200 sanitized profile |
| GET | `/api/me/addresses` | None | 200 `{ "items": [...] }` |
| POST | `/api/me/addresses` | Address fields below, without `id` | 201 `{ "items": [...] }` |
| PATCH | `/api/me/addresses/:id` | Nonempty subset of address fields | 200 `{ "items": [...] }` |
| DELETE | `/api/me/addresses/:id` | `{}` | 200 `{ "items": [...] }` |
| PATCH | `/api/me/addresses/:id/default` | `{}` | 200 `{ "items": [...] }` |

Sanitized profile example (fabricated identity):

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Customer Name",
  "email": "customer@example.test",
  "role": "customer",
  "phone": "09171234567",
  "verified": true,
  "createdAt": "2026-01-01T00:00:00Z"
}
```

Address request example:

```json
{
  "label": "Home",
  "fullName": "Customer Name",
  "phone": "0917 123 4567",
  "address": "12 Main Street",
  "city": "Manila",
  "province": "Metro Manila",
  "postalCode": "1000",
  "isDefault": false
}
```

Address responses use the same camelCase fields plus a database-generated UUID `id`; phone is normalized to `09171234567` in this example. The owner ID is excluded. Empty address lists return `{ "items": [] }`. Each successful mutation returns the complete owner-scoped list from the same RPC transaction.

## Validation and ownership

- Profile writes accept only `name` and `phone`; `id`, `role`, `email`, `verified`, `createdAt`, metadata, and unknown fields are rejected. Email and confirmation status always come from verified Supabase Auth identity.
- Names contain 2–100 characters and allow Unicode letters, spaces, periods, commas, apostrophes, and hyphens.
- Phones accept Philippine mobile forms `09xxxxxxxxx` or `+639xxxxxxxxx`, removing spaces and hyphens. Profile phone may be an empty string; shipping phone is required.
- Address creation requires `fullName`, `phone`, `address`, `city`, `province`, and `postalCode`. `label` and `isDefault` are optional. Existing UI still requires its label field.
- Maximum raw input lengths: name 100, phone 30, street address 300, city/province 100, label 50, postal code 4. Strings are trimmed, internal whitespace is collapsed, and control characters are rejected. Postal codes contain exactly four digits. `isDefault` must be boolean.
- Updates accept a nonempty subset; nulls and unknown fields are rejected. IDs must use UUID syntax. Default/delete requests accept only an empty object.
- Every database profile operation filters by verified identity. Address reads and ownership checks filter by `user_id`; the transaction function repeats ownership checks after obtaining its per-customer lock. Nonexistent and other-user UUIDs receive identical 404 `NOT_FOUND` responses.
- Query parameters, legacy frontend user IDs, and supplied role metadata cannot change database ownership.

Errors follow `{ "code": "VALIDATION_ERROR", "message": "Safe explanation." }`. Relevant statuses are 400 validation, 401 invalid/expired authentication, 403 rejected Origin/CSRF or unavailable/noncustomer profile, 404 unavailable address, 415 unsupported content type, and 503 database/provider/migration unavailability. Provider messages and raw exceptions are not returned or logged by these handlers.

## Atomic defaults and proposed database function

The existing partial unique index `one_default_address` allows at most one default for each owner. Switching defaults requires multiple SQL statements in one transaction; separate REST updates are unsafe. All four address mutation routes therefore call `public.customer_address_mutate(uuid, text, uuid, jsonb)`.

The exact proposed SQL is in [`server/db/proposed/customer-addresses.sql`](../server/db/proposed/customer-addresses.sql). It creates an invoker-security function, locks the owning customer profile row before any changes, rechecks target ownership, performs the mutation, and returns the resulting list. Locking the profile also serializes simultaneous first-address inserts. The unique index remains in place. Function execution is revoked from PUBLIC, anon, and authenticated, and granted only to service_role; the backend must verify identity before invoking it. No existing rows are changed by installing the function.

Defined behavior after deployment:

1. The first address becomes default, including when the request says `isDefault: false`.
2. A new address also becomes default if the existing list has no default. Otherwise it preserves the existing default unless explicitly selected.
3. `isDefault: true` and the dedicated default endpoint select the target atomically.
4. Editing the current default with `isDefault: false` preserves it. Select another address to replace it; editing cannot leave the list without a default.
5. Deleting the current default promotes the remaining address with the smallest UUID. Deleting the final address returns an empty list.
6. Deleting or editing a nondefault preserves the default. Existing legacy lists with no default are not silently repaired on reads or unrelated edits.
7. Any exception rolls back the entire operation. There is no unsafe REST fallback.

Approval is required before applying this SQL. Deployment and real PostgreSQL concurrency validation remain outstanding. The automated HTTP tests mock the RPC and validate routing, ownership, payloads, safe failure, and authoritative returned lists; they do **not** prove execution or locking behavior in PostgreSQL.

## Frontend integration

`src/services/customerService.js` is re-exported by the existing `authService.js` interface. Legacy `userId` arguments are ignored, preserving callers such as Checkout without transmitting client identity. Address services keep returning arrays. Requests use `credentials: 'include'` and `cache: 'no-store'`; writes bootstrap CSRF. Only explicit authentication rejection (after one cookie refresh) or CSRF rejection can cause a bounded retry. Network or ambiguous provider failures never replay a write automatically.

Profile saves use normalized server values and await the existing AuthContext server reload; browser data cannot replace authenticated identity. Email remains disabled. Overview already consumes that context and requires no changes. Addresses retains the existing forms, modals, layout, and navigation; it renders skeleton loading, a distinct failure state with Retry, empty content, mutation feedback, and updated lists from successful mutations.

Subsequent modules now provide persisted wishlist/order reads, checkout application code, and real admin APIs/pages. The security page directs password changes through the existing email-verified recovery flow; it no longer uses `mockDb`. Checkout receives persistent addresses through `getAddresses(user.id)`, but order placement remains blocked on its separately reviewed SQL deployment. See [checkout](checkout-order-placement.md), [wishlist](customer-wishlist.md), and [admin management](admin-management.md).

## Local testing

Use the project's already-installed dependencies with Node >=22; no additional packages are required. From the repository root:

```powershell
node --test server/test/*.test.js
node --test src/services/*.test.js
npm run lint
npm run build
git diff --check
```

Backend tests inject authentication/database dependencies and use ephemeral loopback HTTP servers. Frontend tests mock fetch and render React through the existing Vite SSR test approach. They never contact Supabase or create real users. Existing suites cover product, login/session, registration, recovery, and identity regressions. The new suites cover profile allowlists, validation, cookie/Bearer paths, Origin/CSRF, owner-scoped address operations, missing RPC, safe errors, loading/error/retry presentation, and fresh server reads after identity changes. Browser interaction and live-database persistence are manual checks below, not claims made by transport or SSR tests.

To run manually, start `npm --prefix server run dev` and `npm run dev` in separate terminals using the existing authorized local configuration. Keep APP_ORIGIN consistent with the browser origin. Do not edit or expose secrets. Profile and address-read checks work with the existing schema; address-write checks require separately approved deployment of the proposed function.

## Manual browser and database checklist

Use authorized disposable test accounts and data only, after migration approval:

1. Sign in as a confirmed customer. Visit `/account/profile`, update name/phone, save, and verify the account greeting updates. Reload, sign out, sign in, and confirm persistence. Confirm email remains disabled.
2. Submit invalid names/phones and PATCH attempts containing email, role, or id; confirm safe 400 responses and no protected-field changes.
3. Visit `/account/addresses` with no addresses. Confirm loading transitions to the empty state. Add a valid address; confirm it becomes default. Reload and sign in again to verify persistence.
4. Add a second address, edit its shipping fields, select it as default, and confirm exactly one default. Edit the current default with its checkbox cleared; confirm it remains default until another address is selected.
5. Delete the default and confirm reassignment. Delete the final address and confirm the empty state. Use only records created for this test.
6. In two independent sessions for the same test account, issue simultaneous first-address creations, simultaneous default selections, and default-selection/deletion races. Query that owner's rows through an authorized database tool; confirm at most one default, no partial changes, and no cross-owner effects. These live transaction checks remain required before production deployment.
7. With two test customers, list addresses and attempt PATCH, DELETE, and default selection using the other customer's UUID. Confirm identical 404 responses and no record changes. Confirm invalid/expired credentials cannot access either customer's data.
8. Remove CSRF headers, omit Origin, or use a different Origin for each write, including Bearer requests. Confirm 403 and no database mutation. Confirm normal cookie writes still work afterward.
9. Simulate a network failure on address listing: confirm the failure message and Retry button, then reconnect and retry. Simulate failed writes: confirm errors preserve the editor and do not produce false success or automatic network retries.
10. Before function deployment, verify mutations return 503 `ADDRESS_MIGRATION_REQUIRED` while profile updates, address listing, products, login/logout, registration, and recovery remain usable.
11. Smoke-test Checkout address selection and the existing product/authentication flows. Checkout order persistence requires its independent SQL deployment and is not a persistence guarantee of this address module.

Checkout and admin order application code are implemented separately; deployment validation remains required for their atomic SQL functions.
