# Avengems Data Requirements (for the database design)

This lists the data the API needs to store and read. It's a list of requirements, not a finished
schema. Table names, types and indexes are up to whoever designs the database.

Seed data already exists in `src/data/` (24 products, 6 collections, 5 packages, 2 demo users,
28 demo orders across 12 demo customers).

---

## Entities

### users
| Field | Notes |
|---|---|
| id | primary key |
| name | required |
| email | required, **unique, stored lowercase** |
| password_hash | argon2/bcrypt output. Nullable only if we add Google-only accounts later |
| role | `customer` or `admin` |
| phone | optional, PH mobile |
| verified | boolean, default false |
| created_at | timestamp |
| google_id | optional, unique. **Only if we add Google sign-in** |

Look up by: email (login, register, OTP), id (session).

### addresses (many per user)
| Field | Notes |
|---|---|
| id | primary key |
| user_id | → users, delete with user |
| label | e.g. "Home", "Office" |
| full_name, phone | recipient |
| address, city, province | required |
| postal_code | 4 digits, store as **text** |
| is_default | **at most one true per user** (the API enforces it; a partial unique index is nice to have) |

### products
| Field | Notes |
|---|---|
| id | primary key |
| slug | **unique**, used in URLs |
| name | required |
| type | `Ring`, `Necklace`, `Bracelet`, `Earrings` |
| stone | `power`, `space`, `reality`, `soul`, `time`, `mind` (→ collections) |
| material | `925 Sterling Silver`, `Stainless Steel` |
| price | money, see "Money" below |
| stock | integer ≥ 0 |
| rating | decimal like 4.8 |
| review_count | integer |
| is_new, is_featured | booleans |
| customizable_size, customizable_color | booleans |
| customization_fee | money, 0 or 100–300 |
| sizes | list of size labels (e.g. `["US 5", …]`) plus **default_size** |
| short_description, details | text |
| images | list of image URLs (empty for now) |
| added_at | date |
| archived | boolean, for soft delete (pending team decision) |

`color` and `gemstone` come from the stone, so they can be **read from collections** instead of
stored on each product.

Filtered/sorted by: type, stone, material, price, stock, is_featured, added_at, rating. Search runs
over name/type/material/stone/color/gemstone (only 24 products, so a simple `LIKE` is fine).

### collections (6 rows, rarely change)
id, slug (unique), stone (unique), stone_name, color, color_hex, gemstone, tagline, description.

### packages (5 rows, informational)
id, name, includes, price_min, price_max (nullable), price_label (nullable), pieces, signature
(bool), shop_link.

### orders
| Field | Notes |
|---|---|
| id | **the order number** `AVG-YYYY-NNNNN`, unique (or a separate surrogate key plus a unique `order_number`) |
| user_id | → users |
| created_at | timestamp |
| status | `Pending`, `Processing`, `Shipped`, `Delivered`, `Cancelled` |
| payment_method | `gcash`, `maya`, `cod`, `card` |
| customer_name, customer_email, customer_phone | **copied at checkout** (can differ from the account) |
| ship_address, ship_city, ship_province, ship_postal_code | **copied at checkout**, not a reference to `addresses` (the user may edit or delete that address later) |
| subtotal, customization_total, shipping_fee, total | money, stored as calculated when the order was placed |

Queried by: user_id (my orders, newest first), status (admin filter), created_at (monthly sales
chart, recent orders).

### order_items (many per order)
| Field | Notes |
|---|---|
| id | primary key |
| order_id | → orders |
| product_id | → products (keep the reference even if the product is archived) |
| product_name, product_slug, type, material | **snapshot** at time of order |
| stone, color, size | what the customer picked (color may differ from the product's own) |
| base_price, customization_fee, unit_price | **snapshot** money |
| customized | boolean |
| quantity | 1–10 |

Used for: order details, best sellers, analytics by stone/type (sum of `unit_price × quantity`
grouped by product/stone/type, excluding cancelled orders).

### wishlist_items
user_id + product_id (unique pair), created_at.

### otp_codes
| Field | Notes |
|---|---|
| email | lowercase |
| purpose | `verify` or `reset` |
| code_hash | **hashed**, never plain text |
| expires_at | now + 5 min |
| resend_at | now + 60 s |
| attempts | wrong tries so far |
| used_at | nullable |

At most one active code per (email, purpose). Old rows can be cleaned up regularly.

### reset_tokens (or the same table as otp_codes with a type column)
email, purpose, token_hash, expires_at (now + 10 min), used_at. Single-use.

### sessions (only if we choose cookie sessions over JWT)
id (random, unguessable), user_id, created_at, expires_at, plus user_agent/ip if wanted.

### store_settings (one row)
store_name, contact_email, shipping_fee (default 120), free_shipping_threshold (default 2000).

### team_members (optional, could stay as a static file)
id, last_name, first_name, middle_initial, role (`Team Leader`, `Scrum Master`, `Member`,
`Administrator`), status, accent (stone key).

---

## Relationships at a glance

```
users 1─* addresses
users 1─* orders 1─* order_items *─1 products *─1 collections (by stone)
users 1─* wishlist_items *─1 products
```

## Cross-cutting requirements

- **Money:** either `DECIMAL(10,2)` or integer centavos. Don't use floats. The API returns pesos as
  numbers.
- **Transactions:** placing an order = insert the order + insert its items + decrement stock for each
  product, all-or-nothing. Stock must never go below 0, even when two people check out at once
  (e.g. `UPDATE … SET stock = stock - n WHERE id = ? AND stock >= n`).
- **Timestamps** in UTC.
- **Demo seed data:** 11 of the 12 demo customers (`c-101`…`c-111`) only exist inside
  `demoOrders.js`; only `u-customer` is a real account. In the database they should be seeded as real `users` rows so the admin customer
  list and foreign keys work. The demo user passwords are in `src/data/demoUsers.js` and must be
  hashed when seeded.

## Questions for the DB designer

1. Which database (PostgreSQL / MySQL / Supabase / Firebase…)? Our requirements are relational
   (orders → items → products, transactions on stock), so SQL fits best.
2. Will you provide migrations and a seed script, or should the backend own those?
3. Should sizes and images be their own tables or array/JSON columns?
4. Do we store `color`/`gemstone` on products or join them from collections?
