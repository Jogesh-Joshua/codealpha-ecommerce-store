# CodeAlpha\_EcommerceStore: Backend Implementation Contract

For Antigravity. This document fixes the architecture, data model, API, security rules, and tests. It contains specifications and SQL only; it does not contain the application. Companion documents: the requirements brief (acceptance criteria AC-1 to AC-55) and the Deskline design specification.

## 0. How to read this contract

**Normative words.** MUST and MUST NOT are requirements. SHOULD is the default unless there is a written reason. Anything marked **\[REC\]** is my recommendation for something CodeAlpha and the brief left open.

**Honesty rule for the implementing agent.** Nothing in this contract is implemented yet. The agent MUST NOT state that a feature works or a test passes until it has actually run the code or test and seen the result. The agent MUST keep `docs/STATUS.md` with one row per acceptance test in section 11 (ID, command run, PASS/FAIL, date, short evidence). A test that was not run is `NOT RUN`, never `PASS`.

**Where this contract changes the earlier brief (all deliberate):**

| Change | Brief said | Contract says | Why |
| --- | --- | --- | --- |
| Session mechanism (D6) | JWT in HttpOnly cookie | **Server-side sessions**: random opaque token in an HttpOnly cookie, SHA-256 of the token stored in a `sessions` table | Real logout and revocation, no JWT secret to leak or rotate, no token-format pitfalls. Costs one indexed query per authenticated request |
| Tables | users, products, orders, order\_items (plus categories) | Adds `categories`, `product_images`, `sessions`, `rate_limits` | Category filtering and counts, galleries, revocable sessions, and rate limiting that works on serverless (in-memory limiters do not) |
| Product columns | name, slug, description, price, stock, image | Adds `summary`, `specs`, `featured_rank` | The design shows a short description, a specifications list, and a featured set |
| Order creation | idempotency key mentioned | `Idempotency-Key` header is required, with request hashing | Double-submit and retry safety |
| Local entry file | `server.js` | `scripts/dev-server.js` | `server.js` at the project root is one of Vercel's recognised entry names and would create two competing entries |
| Rate limiting (D16) | Open | DB-backed, specified in section 6 | Resolves the open decision |

**Facts verified for this contract (from Vercel's and Neon's current documentation):**

- Vercel detects an Express app from an entry file such as `app.js`, `index.js`, or `server.js` at the root or under `src/`. The file must export the app as the default export or start it with a port listener.
- `express.static()` is ignored on Vercel. Static files must live in `public/**` and are served by Vercel, not by Express.
- The Express app becomes a single Vercel Function on Fluid compute. Express renders its own 500 pages, so the app MUST install its own error handler.
- Neon provides a pooled connection string (host contains `-pooler`) that runs PgBouncer in transaction mode, and a direct string. TLS is required: keep `sslmode=require` (and `channel_binding=require` when Neon supplies it) exactly as given.

**Facts NOT verified here. The agent MUST verify each one and record the result in `docs/STATUS.md`:** whether `cleanUrls` in `vercel.json` makes `/shop` serve `public/shop.html`; how Vercel populates `X-Forwarded-For` for `req.ip`; whether Vercel recommends a pool helper for `pg` under Fluid compute; the exact current latest versions of every dependency (`npm view <pkg> version`).

## 1. Architecture summary

```
Browser (HTML, CSS, vanilla JS modules)
   |  static files: GET /, /shop, /css/*, /js/*, /images/*   -> Vercel CDN from public/
   |  JSON API:     /api/*                                   -> Vercel Function (Express app)
   v
Express app (src/app.js, default export)
   request id -> security headers -> origin guard (unsafe methods) -> JSON body parser (20 kB)
   -> session loader -> router -> validators (zod) -> services -> db (pg Pool)
   -> not-found handler -> error handler
   v
Neon PostgreSQL (pooled connection for runtime, direct connection for migrations and tests)
```

### Key decisions

| Area | Decision |
| --- | --- |
| Module system | ESM (`type: module`), Node 22 LTS, Express 5 (async handler errors propagate to the error handler) |
| Layers | Routes handle HTTP only. Validators parse and normalise input. Services hold business rules and run SQL. `lib/` holds pure helpers. No SQL in routes |
| Static assets | `public/` only. The Express app MUST NOT call `express.static`. A local-only wrapper (`scripts/dev-server.js`) serves `public/` so local behaviour matches production |
| Pages | Multi-page HTML (D7). Page URLs are extensionless (`/shop`, `/product?slug=...`). `vercel.json` sets `cleanUrls: true` and the agent verifies it; if verification fails the fallback is explicit rewrites in `vercel.json` (section 9) |
| Money | Integer minor currency units everywhere (`price_cents` is the column name; it means minor units of the configured currency). No floats. Currency code and shipping fee come from environment config |
| Database access | `pg` with one module-level `Pool`, parameterised queries only (`$1, $2`), a `withTransaction(fn)` helper that always releases the client. Pool settings: `max` 5, `idleTimeoutMillis` 10000, `connectionTimeoutMillis` 5000, `statement_timeout` 10000 ms |
| Auth | bcryptjs password hashes, opaque session token, `sessions` table, HttpOnly cookie, origin check on unsafe methods |
| Cart | Browser storage holds only `{productId, quantity}` pairs. The server re-validates everything at `/api/cart/validate` and again, authoritatively, at order creation |
| Orders | One transaction: lock product rows, verify stock, price from DB, decrement stock, insert order and items, commit |
| Errors | One JSON error envelope for every API error (section 4). No stack traces or SQL in responses |
| Observability | JSON logs with a request ID; bodies, passwords, cookies, and tokens are never logged |

### Dependencies (and nothing else without approval)

`express` (v5), `pg`, `bcryptjs`, `cookie-parser`, `helmet`, `zod`. No `dotenv` (use `node --env-file=.env`, supported by Node 22). No `nodemon` (use `node --watch`). Tests use Node's built-in `node:test` and `fetch`, with no extra test dependency. Run `npm audit` and record the result.

## 2. Folder and file tree

```
CodeAlpha_EcommerceStore/
  package.json           type module; engines node 22.x; scripts (section 7 and 8)
  package-lock.json      committed
  vercel.json            cleanUrls, security headers for static files, function settings
  .env.example           placeholders only (section 5)
  .gitignore             .env, .env.*, !.env.example, node_modules, .vercel, coverage
  README.md              setup, scripts, demo notice, honest limitations
  docs/STATUS.md         agent-maintained acceptance-test log
  db/
    migrations/001_init.sql     schema from section 3
    seeds/catalog.js            data only: categories, products, images, specs
  scripts/
    migrate.js           applies SQL migrations (direct connection)
    seed.js              idempotent catalogue upsert (direct connection)
    dev-server.js        local listener; serves public/ then mounts the app
    test-db-reset.js     truncates and reseeds TEST_DATABASE_URL only
  src/
    app.js               builds and default-exports the Express app. VERCEL ENTRY
    config.js            reads and validates env vars once; exports frozen config
    db/pool.js           the single Pool
    db/tx.js             withTransaction(fn): BEGIN, COMMIT or ROLLBACK, release
    middleware/
      requestId.js  originGuard.js  session.js  requireAuth.js
      rateLimit.js  noStore.js  notFound.js  errorHandler.js
    routes/
      index.js  health.js  auth.js  categories.js  products.js  cart.js  orders.js
    services/
      authService.js  productService.js  cartService.js  orderService.js
      rateLimitService.js
    validators/
      common.js  auth.js  products.js  cart.js  orders.js
    lib/
      errors.js  money.js  passwords.js  tokens.js  escapeLike.js
      orderNumber.js  logger.js
    views/notFoundPage.js   returns the HTML string for unknown non-API routes
  public/
    index.html shop.html product.html cart.html login.html register.html
    checkout.html order.html orders.html 404.html
    css/      tokens.css base.css components.css pages.css
    js/       api.js cart-store.js format.js ui/*.js pages/*.js
    fonts/    images/products/    images/placeholders/    icons/    favicon.svg
  tests/
    helpers/  server.js  db.js  factories.js
    unit/     money.test.js passwords.test.js validators.test.js order-math.test.js
    db/       schema.test.js
    api/      health.test.js categories.test.js products.test.js auth.test.js
              cart-validate.test.js orders-create.test.js orders-read.test.js
              security.test.js
```

**Entry rules.**

- `src/app.js` is the only recognised Vercel entry. No `app.js`, `index.js`, or `server.js` may exist at the project root or in `src/` other than `src/app.js`.
- `src/app.js` default-exports the app and MUST NOT call `listen`.
- `scripts/dev-server.js` creates a wrapper Express app that serves `public/` (with `extensions: ['html']`) and then mounts the real app, so `/shop` and `/api/products` both work locally.
- Unknown non-API GET requests that reach Express get a 404 HTML page generated by `src/views/notFoundPage.js` (an in-code string using `/css/*` links), not a file read, because `public/` is not guaranteed to be present in the function bundle. Unknown `/api/*` requests get the JSON 404 envelope.

## 3. Database schema SQL

Target: PostgreSQL 16 or later on Neon. `gen_random_uuid()` is built in; no extensions are required. The migration runner wraps each file in a transaction, so the file itself contains no `BEGIN` or `COMMIT`. File: `db/migrations/001_init.sql`.

```sql
-- Shared trigger to maintain updated_at
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  email         text NOT NULL CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email)
);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sessions (opaque token; only its SHA-256 is stored)
CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  CONSTRAINT sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT sessions_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Categories
CREATE TABLE categories (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  sort_order integer NOT NULL DEFAULT 0,
  image_url  text CHECK (image_url IS NULL OR image_url ~ '^/images/[A-Za-z0-9._/-]+$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_slug_key UNIQUE (slug)
);

-- Products
CREATE TABLE products (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id    integer NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  slug           text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  summary        text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 300),
  description    text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 5000),
  specs          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(specs) = 'array'),
  price_cents    integer NOT NULL CHECK (price_cents > 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  is_active      boolean NOT NULL DEFAULT true,
  featured_rank  integer CHECK (featured_rank IS NULL OR featured_rank > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_slug_key UNIQUE (slug)
);
CREATE INDEX products_category_idx ON products (category_id) WHERE is_active;
CREATE INDEX products_newest_idx   ON products (created_at DESC, id DESC) WHERE is_active;
CREATE INDEX products_price_idx    ON products (price_cents, id) WHERE is_active;
CREATE INDEX products_featured_idx ON products (featured_rank, id) WHERE is_active AND featured_rank IS NOT NULL;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Product images (url is a path under /images, never an external URL)
CREATE TABLE product_images (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        text NOT NULL CHECK (url ~ '^/images/[A-Za-z0-9._/-]+$'),
  alt        text NOT NULL CHECK (char_length(alt) BETWEEN 1 AND 200),
  width      integer NOT NULL CHECK (width > 0),
  height     integer NOT NULL CHECK (height > 0),
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT product_images_order_key UNIQUE (product_id, sort_order)
);

-- Orders
CREATE SEQUENCE order_number_seq START WITH 100001;

CREATE TABLE orders (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number           text NOT NULL,
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status                 text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed')),
  currency               char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_cents         bigint NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents         bigint NOT NULL CHECK (shipping_cents >= 0),
  total_cents            bigint NOT NULL,
  shipping_full_name     text NOT NULL CHECK (char_length(shipping_full_name) BETWEEN 1 AND 100),
  shipping_phone         text NOT NULL CHECK (shipping_phone ~ '^[0-9]{10,15}$'),
  shipping_address_line1 text NOT NULL CHECK (char_length(shipping_address_line1) BETWEEN 1 AND 150),
  shipping_address_line2 text CHECK (shipping_address_line2 IS NULL OR char_length(shipping_address_line2) <= 150),
  shipping_city          text NOT NULL CHECK (char_length(shipping_city) BETWEEN 1 AND 80),
  shipping_region        text NOT NULL CHECK (char_length(shipping_region) BETWEEN 1 AND 80),
  shipping_postal_code   text NOT NULL CHECK (shipping_postal_code ~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$'),
  idempotency_key        uuid NOT NULL,
  request_hash           bytea NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_order_number_key UNIQUE (order_number),
  CONSTRAINT orders_idempotency_key UNIQUE (user_id, idempotency_key),
  CONSTRAINT orders_total_check CHECK (total_cents = subtotal_cents + shipping_cents)
);
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC, id DESC);

-- Order items (name, slug, and unit price are snapshots taken at purchase time)
CREATE TABLE order_items (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name     text NOT NULL,
  product_slug     text NOT NULL,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0),
  quantity         integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  line_total_cents bigint NOT NULL,
  CONSTRAINT order_items_line_unique UNIQUE (order_id, product_id),
  CONSTRAINT order_items_total_check CHECK (line_total_cents = unit_price_cents::bigint * quantity)
);
CREATE INDEX order_items_product_idx ON order_items (product_id);

-- DB-backed rate limiting (works across serverless instances)
CREATE TABLE rate_limits (
  bucket       text NOT NULL,
  key_hash     bytea NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, key_hash, window_start)
);
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);
```

**Schema notes.**

- The application enforces the per-line limit of 10; the database keeps a looser backstop of 100.
- The `schema_migrations` table (filename, checksum, applied\_at) is created by `scripts/migrate.js`, not by the migration file.
- Orders and products are never hard-deleted. Products are retired with `is_active = false`, which is why the foreign keys use `ON DELETE RESTRICT`.
- `ILIKE` search on 21 rows needs no special index. If the catalogue grows, add `pg_trgm` and a GIN index on `lower(name)` in a later migration (do not add it now).
- **\[REC\]** Create a runtime database role limited to SELECT, INSERT, UPDATE, DELETE on these tables and USAGE on `order_number_seq`, and use the owner role only for migrations. If the agent skips this, it records the reason in `docs/STATUS.md`.

## 4. API specification

### 4.1 Conventions (apply to every endpoint)

- Base path `/api`. Requests and responses are UTF-8 JSON. Dates are ISO 8601 UTC strings. IDs: products and categories are integers, users and orders are UUIDs.
- Money fields end in `Cents` and are integers in minor currency units. Every response that contains money also contains `currency` (3-letter code from `STORE_CURRENCY`). The server never returns formatted prices; the browser formats them with `Intl.NumberFormat`.
- Any request with a body MUST send `Content-Type: application/json`, otherwise 415. Body size limit 20 kB, otherwise 413. Malformed JSON gives 400 `INVALID_JSON`.
- **Unknown body fields are rejected** (strict schemas). A browser that sends `priceCents`, `totalCents`, `userId`, or `confirmPassword` gets 400 `VALIDATION_ERROR` with that field named. Unknown query-string parameters are ignored; a query parameter repeated twice is a 400.
- **Unsafe methods** (POST, PUT, PATCH, DELETE) pass the origin guard (section 6) first. A failure is 403 `FORBIDDEN_ORIGIN`.
- **Caching.** `GET /api/products*` and `GET /api/categories`: `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`. Everything else under `/api`: `Cache-Control: no-store`.
- Authentication is the session cookie (section 6). “Auth required” below means the cookie resolves to an unexpired session, else 401 `UNAUTHENTICATED`.
- Handlers never trust a user ID, price, total, or stock value from the client. The user comes from the session; prices and stock come from PostgreSQL.

### 4.2 Error envelope

Every non-2xx response from `/api` uses this shape and no other. `fields` is present only for validation-type errors; `details` only where stated.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields need attention.",
    "fields": { "email": "Enter a valid email address, like name@example.com." },
    "requestId": "abc123"
  }
}
```

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Schema or rule failure. `fields` maps field path to a message written for display |
| 400 | `INVALID_JSON` | Body is not parseable JSON |
| 400 | `MISSING_IDEMPOTENCY_KEY` | `Idempotency-Key` header absent or not a UUID |
| 401 | `UNAUTHENTICATED` | No valid session |
| 401 | `INVALID_CREDENTIALS` | Login failed (same response for unknown email and wrong password) |
| 403 | `FORBIDDEN_ORIGIN` | Origin guard rejected an unsafe request |
| 404 | `PRODUCT_NOT_FOUND`, `ORDER_NOT_FOUND`, `ROUTE_NOT_FOUND` | Missing, inactive, malformed ID, or not owned by the caller |
| 405 | `METHOD_NOT_ALLOWED` | Route exists, method does not. Include `Allow` header |
| 409 | `EMAIL_TAKEN` | Registration with an existing email |
| 409 | `STOCK_CONFLICT` | Order cannot be fulfilled. `details.items` lists each problem |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same key, different request body |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 20 kB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Body not `application/json` |
| 429 | `RATE_LIMITED` | Include `Retry-After` (seconds) |
| 500 | `INTERNAL_ERROR` | Unexpected. Generic message, details only in server logs |
| 503 | `SERVICE_UNAVAILABLE` | Database unreachable or a lock timeout; the client may retry |

The `message` for 500 and 503 is always generic. SQL text, stack traces, table names, and constraint names never appear in a response.

### 4.3 Shared object shapes

| Object | Fields |
| --- | --- |
| `User` | `id`, `name`, `email` |
| `Image` | `url` (a path under `/images/`), `alt`, `width`, `height` |
| `ProductSummary` | `id`, `slug`, `name`, `summary`, `priceCents`, `currency`, `category` (`{slug, name}`), `image` (`Image` or null), `stockStatus` (`in_stock`, `low_stock`, `out_of_stock`), `maxPurchasableQuantity` (min of stock and 10), `lowStockRemaining` (integer when `low_stock`, else null) |
| `ProductDetail` | all `ProductSummary` fields plus `description`, `specs` (array of `{label, value}`), `images` (array of `Image`, ordered), `createdAt` |
| `Category` | `id`, `slug`, `name`, `productCount` (active products only), `image` (path or null) |
| `Pagination` | `page`, `limit`, `total`, `totalPages` |
| `OrderItem` | `productId`, `slug`, `name`, `unitPriceCents`, `quantity`, `lineTotalCents`, `image` (`Image` or null, from the product's first image) |
| `ShippingAddress` | `fullName`, `phone`, `addressLine1`, `addressLine2` (string or null), `city`, `region`, `postalCode` |
| `OrderSummary` | `id`, `orderNumber`, `status`, `createdAt`, `currency`, `itemCount` (sum of quantities), `totalCents`, `thumbnails` (up to 3 `Image`) |
| `OrderDetail` | `id`, `orderNumber`, `status`, `createdAt`, `currency`, `subtotalCents`, `shippingCents`, `totalCents`, `shipping` (`ShippingAddress`), `items` (array of `OrderItem`) |

`stockStatus` thresholds: `out_of_stock` at 0, `low_stock` from 1 to 5, otherwise `in_stock`. The exact stock number is never returned above 5.

### 4.4 Health

`GET /api/health` returns 200 `{ status: 'ok' }`. `GET /api/health?deep=1` also runs `SELECT 1` and returns `{ status: 'ok', database: 'up' }`, or 503 `SERVICE_UNAVAILABLE`. No version, environment, or host information is ever included.

### 4.5 Products and categories

**`GET /api/categories`** (public). 200 `{ items: [Category] }` ordered by `sort_order`, then name.

**`GET /api/products`** (public). Query parameters:

| Parameter | Rule | Default |
| --- | --- | --- |
| `search` | Trim, collapse inner whitespace, 1 to 80 characters. Empty after trim means absent. Over 80 is a 400 | none |
| `category` | Slug matching `^[a-z0-9]+(-[a-z0-9]+)*$`, up to 60 characters. An unknown but well-formed slug returns an empty list (200), not an error | none |
| `sort` | One of `featured`, `price_asc`, `price_desc`, `newest`, `name_asc`. Anything else is a 400 | `featured` |
| `page` | Integer 1 to 10000 | 1 |
| `limit` | Integer 1 to 48 | 12 |

Success 200: `{ items: [ProductSummary], pagination: Pagination, query: { search, category, sort } }`. A page beyond `totalPages` returns 200 with an empty `items` (the frontend redirects to the last valid page).

**Rules.**

- Only `is_active = true` products are returned.
- Search matches `name` and `summary` and `description` with `ILIKE`. The term MUST be parameterised, and LIKE wildcards in it (percent, underscore, and the backslash escape character) MUST be escaped (`lib/escapeLike.js`) with an explicit `ESCAPE` clause.
- Sort definitions, each with a final `id` tie-breaker so paging is stable: `featured` = `featured_rank` ascending with nulls last, then `id`; `price_asc` / `price_desc` = `price_cents`; `newest` = `created_at` descending; `name_asc` = `lower(name)`.
- `total` comes from a separate `COUNT(*)` using the same WHERE clause. Images come from one batched query for the page's product IDs (no per-product queries).
- The sort expression is chosen from a fixed allow-list in code. User input is never concatenated into SQL, including ORDER BY.

**`GET /api/products/:slug`** (public). 200 `{ product: ProductDetail }`. Slug not matching the slug pattern, not found, or inactive gives 404 `PRODUCT_NOT_FOUND`.

### 4.6 Cart validation

**`POST /api/cart/validate`** (public, so the cart page works logged out; rate limited per IP, 120 per 10 minutes).

Request: `{ items: [ { productId: integer >= 1, quantity: integer >= 1 } ] }`, 0 to 50 lines. Duplicate `productId` lines are merged by summing quantities before validation. A quantity above the cap is not an error here; it is reported as an issue.

Success 200:

```json
{
  "lines": [
    {
      "productId": 7, "slug": "felt-desk-mat-moss", "name": "Felt desk mat, moss",
      "image": null, "unitPriceCents": 2800, "requestedQuantity": 4,
      "status": "quantity_reduced", "allowedQuantity": 3,
      "lineTotalCents": 0,
      "issues": [ { "code": "INSUFFICIENT_STOCK", "message": "Only 3 are available." } ]
    }
  ],
  "summary": { "subtotalCents": 0, "shippingCents": 0, "totalCents": 0, "currency": "USD", "itemCount": 0 },
  "hasBlockingIssues": true
}
```

(The numbers above only illustrate the shape.)

| `status` | Meaning | Issue code |
| --- | --- | --- |
| `ok` | Product is active and requested quantity is within stock and the per-line cap | none |
| `quantity_reduced` | Product is purchasable but requested quantity exceeds stock or the cap. `allowedQuantity` is the maximum the client may use | `INSUFFICIENT_STOCK` or `QUANTITY_CAPPED` |
| `out_of_stock` | Stock is 0 | `OUT_OF_STOCK` |
| `unavailable` | Unknown or inactive product ID | `PRODUCT_UNAVAILABLE` |

The summary counts only lines with status `ok`. `hasBlockingIssues` is true if any line is not `ok`. `shippingCents` is 0 when there are no `ok` lines, otherwise the configured flat fee. This endpoint is advisory: order creation (4.9) repeats every check authoritatively.

### 4.7 Authentication endpoints

**`POST /api/auth/register`** (public; rate limited, section 6).

Request: `{ name, email, password }` (strict; no other fields).

| Field | Rules (server authority) | Field error text |
| --- | --- | --- |
| `name` | Trim. 1 to 80 characters. No control characters | “Enter your name.” |
| `email` | Trim, lower-case. 3 to 254 characters. Valid address syntax | “Enter a valid email address, like name@example.com.” |
| `password` | 8 to 72 **bytes** in UTF-8 (bcrypt truncates at 72, so longer is rejected, never truncated). Must not equal the email | “Use at least 8 characters.” or “Use 72 characters or fewer.” |

Success 201: `{ user: User }` and `Set-Cookie` (a new session). Failures: 400 `VALIDATION_ERROR`; 409 `EMAIL_TAKEN` with `fields.email` = “An account with this email already exists. Sign in instead.” (detected through the unique constraint, SQLSTATE 23505, never through check-then-insert); 429 `RATE_LIMITED`.

**`POST /api/auth/login`** (public; rate limited).

Request: `{ email, password }`. Same normalisation as above, but no strength rules (never reveal the policy at login).

Success 200: `{ user: User }` and `Set-Cookie` with a **new** session token (any session presented on the request is deleted: no session fixation). Failures: 400 `VALIDATION_ERROR` (missing or non-string fields); 401 `INVALID_CREDENTIALS` with message “Email or password is incorrect. Check both and try again.”, identical for unknown email and wrong password. For an unknown email the server MUST still run a bcrypt comparison against a fixed dummy hash so response time does not reveal whether the email exists. 429 `RATE_LIMITED` with message “Too many sign-in attempts. Wait a few minutes and try again.”

**`POST /api/auth/logout`** (no auth required; origin guard applies). Deletes the session row matching the cookie (if any) and clears the cookie with the same attributes and `Max-Age=0`. Always 204 with no body, even when there was no session (idempotent).

**`GET /api/auth/me`** (auth required). 200 `{ user: User }`, or 401 `UNAUTHENTICATED`. If the cookie is present but the session is missing or expired, the response also clears the cookie.

### 4.8 Order endpoints (all require auth)

**`POST /api/orders`**

Headers: `Content-Type: application/json`, `Idempotency-Key: <UUID v4>` (generated by the browser once per checkout attempt and reused only for retries of the same attempt).

Request body (strict):

```json
{
  "items": [ { "productId": 7, "quantity": 2 } ],
  "shipping": {
    "fullName": "Alex Morgan", "phone": "+1 555 010 0199",
    "addressLine1": "221 Example Street", "addressLine2": "",
    "city": "Springfield", "region": "Example State", "postalCode": "12345"
  }
}
```

| Field | Rules | Field error text |
| --- | --- | --- |
| `items` | Array of 1 to 50 lines. `productId` integer >= 1. `quantity` integer 1 to 10. Duplicate product IDs are merged by summing, then re-checked against the cap of 10 | “Your cart is empty.” / “Quantity must be between 1 and 10.” |
| `shipping.fullName` | Trim, 1 to 100, no control characters | “Enter the recipient's name.” |
| `shipping.phone` | Remove spaces, hyphens, parentheses, and a leading plus; the remainder must be 10 to 15 digits; stored as digits only | “Enter a phone number with 10 to 15 digits.” |
| `shipping.addressLine1` | Trim, 1 to 150 | “Enter a street address.” |
| `shipping.addressLine2` | Optional. Trim, 0 to 150. Empty string stored as null | “Use 150 characters or fewer.” |
| `shipping.city` | Trim, 1 to 80 | “Enter a city.” |
| `shipping.region` | Trim, 1 to 80 | “Enter a state or region.” |
| `shipping.postalCode` | Trim, 3 to 10 characters, letters, digits, space, hyphen; must start with a letter or digit | “Enter a valid postal code.” |

Field paths in `fields` use dot notation, for example `shipping.postalCode` and `items.0.quantity`.

Responses:

| Status | Body | When |
| --- | --- | --- |
| 201 | `{ order: OrderDetail }` | Order created |
| 200 | `{ order: OrderDetail }` plus header `Idempotent-Replay: true` | Same user, same key, same request hash: returns the original order, creates nothing |
| 400 | `VALIDATION_ERROR` / `MISSING_IDEMPOTENCY_KEY` | Input invalid |
| 401 | `UNAUTHENTICATED` | No session |
| 409 | `STOCK_CONFLICT` with `details.items: [{ productId, name, requestedQuantity, availableQuantity, reason }]`, reason is `insufficient_stock`, `out_of_stock`, or `unavailable` | Nothing was written |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same key with a different request body |
| 429 | `RATE_LIMITED` | More than 10 order attempts per user per hour |
| 503 | `SERVICE_UNAVAILABLE` | Database down or lock wait timeout. Nothing was written; retry with the same key is safe |

**`GET /api/orders`**: query `page` (default 1) and `limit` (1 to 50, default 10). 200 `{ items: [OrderSummary], pagination: Pagination }`, newest first, only the caller's orders (the WHERE clause always includes the session's user ID).

**`GET /api/orders/:id`**: `:id` is a UUID. A malformed ID, an unknown ID, and another user's ID all return the identical 404 `ORDER_NOT_FOUND` (same body, same timing class). 200 `{ order: OrderDetail }`.

### 4.9 Order creation algorithm (normative)

Implemented in `services/orderService.js`. All SQL is parameterised. The user ID is `req.user.id` from the session and nothing else.

1. **Parse and normalise** the body with the strict schema. Merge duplicate product IDs by summing quantities; reject any merged quantity over 10. Build a canonical request object (items sorted by product ID, normalised shipping) and compute `request_hash` = SHA-256 of its JSON.
2. **Origin guard, auth, and rate limit** have already run. Count this attempt against the `orders` rate-limit bucket.
3. **Open a transaction** on a dedicated pool client (`BEGIN`, default READ COMMITTED). Immediately run `SET LOCAL lock_timeout = '3s'` and `SET LOCAL statement_timeout = '8s'`.
4. **Idempotency check.** Select an order by `(user_id, idempotency_key)`. If found: same `request_hash` returns that order (200 replay); a different hash returns 409 `IDEMPOTENCY_KEY_REUSED`. Either way, end the transaction.
5. **Lock and read the products** in one statement: select `id, name, slug, price_cents, stock_quantity, is_active` from `products` where `id` is in the requested set, `ORDER BY id`, `FOR UPDATE`. Sorting by ID gives every transaction the same lock order, which prevents deadlocks.
6. **Verify every line.** A requested ID missing from the result, or inactive, is `unavailable`. Stock 0 is `out_of_stock`. Quantity above stock is `insufficient_stock`. If there is any problem, `ROLLBACK` and return 409 `STOCK_CONFLICT` listing **all** problems (not just the first).
7. **Compute money in integers** from the locked rows: `line_total = unit_price_cents * quantity`; `subtotal` = sum of lines; `shipping` = configured flat fee (`SHIPPING_FLAT_CENTS`); `total = subtotal + shipping`. No value from the browser participates.
8. **Decrement stock** per line with `UPDATE products SET stock_quantity = stock_quantity - $qty WHERE id = $id AND stock_quantity >= $qty`. If any update affects 0 rows, `ROLLBACK` and return 409 (defence in depth on top of the row lock).
9. **Insert the order** with `order_number` built from the prefix `ORDER_NUMBER_PREFIX` and `nextval('order_number_seq')`, the currency, the three amounts, the normalised shipping fields, the idempotency key, and the request hash. Then insert all `order_items` rows (name, slug, and unit price copied from the locked product rows).
10. **Commit.** Read the created order back inside the same transaction (before commit) to build the response, so the response reflects exactly what was stored.
11. **On any error:** `ROLLBACK`, always release the client in a `finally` block. A unique violation on `(user_id, idempotency_key)` from a concurrent duplicate request triggers one re-read of step 4 on a fresh transaction. SQLSTATE `55P03` (lock timeout) and connection errors map to 503. Everything else maps to 500 with the generic message.
12. **The browser clears its cart only after receiving 201 or 200.** The server does not know about the browser cart.

**Invariants the tests assert:** stock never goes negative; an order row never exists without its items; `total = subtotal + shipping`; each `line_total = unit_price * quantity`; a replayed key creates exactly one order; two concurrent orders for the last unit produce exactly one order.
