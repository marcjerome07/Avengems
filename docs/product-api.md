# Product read API

These public, read-only endpoints use the existing server-side Supabase client.
Both explicitly exclude archived products, including when looking up IDs or slugs.
The frontend mock services remain unchanged. Product writes and collection/package
endpoints are outside this implementation.

## Run and test

With backend dependencies and `server/.env` already configured, from the repository root:

```powershell
cd server
npm run dev
```

In a second terminal, from the repository root:

```powershell
# Automated HTTP tests; no credentials, database connection, or writes needed.
node --test --experimental-test-isolation=none server/test/products.test.js

curl.exe "http://localhost:3001/api/products"
curl.exe "http://localhost:3001/api/products/power-stone-ring"
curl.exe "http://localhost:3001/api/products?q=purple%20rings&sort=price-asc"
curl.exe "http://localhost:3001/api/products?type=Ring,Necklace&stone=power,space&minPrice=100&maxPrice=900&inStock=1&customizable=true"
curl.exe "http://localhost:3001/api/products?ids=p-01,p-02"
curl.exe -i "http://localhost:3001/api/products/no-such-product"
curl.exe -i "http://localhost:3001/api/products?minPrice=-1"
```

Use the configured port if it differs from 3001. The test isolation option avoids
child-process spawning in restricted development environments on Node 22+.

## GET /api/products

Returns HTTP 200 with `{ "items": [product], "total": 24 }` (total depends on filters).
No matches returns `{ "items": [], "total": 0 }`.

| Query parameter | Behavior |
|---|---|
| `q` | Case-insensitive search across name, type, material, stone, collection color and gemstone. Every whitespace-separated token must match; a trailing `s` is removed from each token, as in the frontend mock. Input is treated literally, not as SQL/PostgREST syntax or wildcard expressions. |
| `type` | Comma-separated `Ring`, `Necklace`, `Bracelet`, `Earrings`. |
| `stone` | Comma-separated `power`, `space`, `reality`, `soul`, `time`, `mind`. |
| `material` | Comma-separated `925 Sterling Silver`, `Stainless Steel`. URL-encode spaces. |
| `ids` | Comma-separated product IDs; unknown IDs are omitted. |
| `minPrice`, `maxPrice` | Inclusive price bounds in pesos. Non-negative decimal values, at most two decimal places. |
| `inStock` | `true` or `1` restricts results to stock greater than zero. |
| `customizable` | `true` or `1` restricts results to products supporting size or color customization. |
| `sort` | `featured` (default), `newest`, `price-asc`, `price-desc`, `rating`. |

`min`, `max`, and `instock` are aliases for the Shop page's URL parameters.
Canonical names take precedence if both are supplied. False flags (`false`, `0`),
empty flags and omitted flags apply no restriction. Empty price bounds apply no bound.
Values within a category use OR; different filters combine with AND. Categorical
values are case-sensitive. Invalid known filter values, repeated known parameters,
invalid sort modes, and reversed price bounds return HTTP 400. Unknown query
parameters are ignored. An empty `ids` value applies no ID restriction.

Featured sorts featured products first without excluding other products. Newest
uses descending `added_at`; rating uses descending rating then review count.
All sorts use ascending product ID as a final deterministic tie breaker.
ID lookup uses the selected sort rather than the input ID order.

## GET /api/products/:slug

Returns HTTP 200 with a single product object, without an envelope. A missing or
archived slug returns HTTP 404 with `NOT_FOUND`.

## Product shape

The API converts database snake_case columns to the existing frontend contract.
Color and gemstone come from the product's collection through the stone foreign key.
Prices and ratings are JSON numbers; prices are in pesos.

```json
{
  "id": "p-01",
  "slug": "power-stone-ring",
  "name": "Power Stone Ring",
  "type": "Ring",
  "stone": "power",
  "color": "Purple",
  "gemstone": "Amethyst",
  "material": "925 Sterling Silver",
  "price": 649,
  "stock": 14,
  "rating": 4.8,
  "reviewCount": 124,
  "isNew": false,
  "isFeatured": true,
  "customizable": { "size": true, "color": true },
  "customizationFee": 250,
  "sizes": ["US 5", "US 6", "US 7", "US 8", "US 9", "US 10", "US 11", "US 12"],
  "defaultSize": "US 7",
  "shortDescription": "Product summary",
  "details": "Product details",
  "images": [],
  "addedAt": "2026-04-02"
}
```

Descriptions above are illustrative. Nullable database fields remain null.
Internal join data and the archived flag are not exposed.

## Errors and scope assumptions

Errors use the existing `{ "code": "...", "message": "..." }` envelope:

- HTTP 400: `VALIDATION_ERROR`.
- HTTP 404: `NOT_FOUND` for missing or archived products.
- HTTP 503: `DATABASE_UNAVAILABLE` for Supabase query errors, without database details.
- Unexpected errors continue through the existing global error handler.

The list has no public pagination to match the frontend's `{ items, total }`
contract and current small catalog. Structured filters and sorting run in Supabase;
token search runs in the backend across joined data. Database reads use batches of
100 to avoid the standard Supabase response row limit. This assumes the project's
configured row limit is at least 100. For a substantially larger catalog, add
database-backed search and public pagination before scaling this approach.
