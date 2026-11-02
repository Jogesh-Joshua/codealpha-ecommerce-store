# CodeAlpha_EcommerceStore: Specification Reconciliation

This file resolves conflicts, corrects stale references, and records the decisions that govern the three-document specification package for **CodeAlpha_EcommerceStore**. Specifications only; no application code. Nothing here claims that anything has been built, deployed, or tested.

**Revision 2 (final correction pass).** Added decisions DR-19 to DR-25 (section 1 and section 10), updated DR-09 (the production dependency list is now **seven** packages), corrected the classification of GitHub visibility (section 5), and recorded contradictions X-21 to X-29 (section 4). The database schema in section 2.3 is **unchanged**: none of the corrections needs a column or constraint change.

## 0. Read this first

### 0.1 Document set and precedence

| # | Document | Role |
|---|---|---|
| 1 | CodeAlpha_EcommerceStore Implementation Brief | Requirements, scope, acceptance criteria AC-1 to AC-55, decision table |
| 2 | Deskline Design System and Page Specifications (sections A to D) plus `Deskline_Design_Spec_Addendum.md` (sections E to L) | Design system and page specifications |
| 3 | CodeAlpha_EcommerceStore Backend Implementation Contract (sections 0 to 4.9) plus `CodeAlpha_Backend_Contract_Addendum.md` (sections 5 to 11) | Architecture, data model, API, security, tests, deployment |
| 4 | **This file** | Decisions and corrections that override the others |

**Order of authority when documents disagree:**

1. The CodeAlpha PDF requirements (never overridden; section 5 below).
2. **This reconciliation file.**
3. The two addenda (they win over the original files they complete).
4. The original brief, design spec, and backend contract.

Where the brief's acceptance criteria text and a later document differ, the criterion's intent still applies; any wording clarification is recorded in section 4.

### 0.2 A note on the source files

The three original `.md` files were not attached to the request that produced these addenda. This reconciliation was prepared by cross-checking the specification text produced earlier in the same working session. If the copies on the owner's machine differ from that text (for example, if a decision-table row or an environment-variable list is absent), apply the **patch list in section 8** by section title; conflicts are resolved by section 0.1 either way.

Also note: the earlier working versions of the design spec and backend contract were more complete than the exported copies described in the request (the design spec reached E4 and the backend contract reached section 7 in the working version), but both were still incomplete. The addenda are written to be **self-contained for the missing sections** and restate material from those drafts, so Antigravity needs no other source for them.

## 1. Decisions resolved

| ID | Decision | Status |
|---|---|---|
| DR-01 | The store prices in **INR**. `STORE_CURRENCY` must equal `INR`; any other value fails startup. Orders store `currency = 'INR'` (database check) | Resolved (owner instruction) |
| DR-02 | All money is stored and transmitted as **integer paise**. No floats anywhere in storage, API, or arithmetic | Resolved (owner instruction) |
| DR-03 | **Naming of minor units:** the suffix is `minor`. Database `price_minor`; API `priceMinor`; env `SHIPPING_FLAT_MINOR`. The word `cents` is retired. See section 2 | Resolved (recommendation, adopted) |
| DR-04 | **Whole-rupee rule:** every catalogue price and the flat shipping fee is a multiple of 100 paise. Enforced by a database check on `products.price_minor`, by seed validation, and by `SHIPPING_FLAT_MINOR` validation. Prices display as whole rupees (no paise) | Resolved (recommendation; alternative in 2.5) |
| DR-05 | **Session architecture:** server-side sessions (random opaque token in an HttpOnly cookie, SHA-256 digest stored in a `sessions` table). No JWT, no JWT secret, no `jsonwebtoken` package. See section 3 | Resolved |
| DR-06 | **Demo checkout:** no payment gateway, no mock gateway, no card/UPI/wallet fields, ever. See section 6 | Resolved (owner instruction) |
| DR-07 | **Framework and hosting constraints unchanged:** HTML, CSS, vanilla JavaScript; Node.js and Express 5; PostgreSQL on Neon; Vercel; npm. See section 7 | Resolved |
| DR-08 | **Vercel entry:** `src/app.js` default-exports the Express app. No `api/index.js`. Local server is `scripts/dev-server.js`. `src/createApp.js` is added to the tree | Resolved |
| DR-09 | Final production dependency list (**seven**): `express`, `pg`, `bcryptjs`, `cookie-parser`, `helmet`, `zod`, `@vercel/functions`. No development dependencies. (`jsonwebtoken`, `dotenv`, `nodemon` removed; `@vercel/functions` added by DR-22.) Local env loading uses `node --env-file`; watch mode uses `node --watch`. Font packages are never retained (DR-23) | Resolved (revised) |
| DR-10 | Search matches `name`, `summary`, and `description` (a superset of the brief's "name and description") | Resolved |
| DR-11 | The register form's "Confirm password" is **browser-only** and is never sent; the server rejects unknown fields | Resolved |
| DR-12 | Header switches to the full layout at **1024 px**; tablet uses the drawer header | Resolved |
| DR-13 | Hero hotspots show the **first four featured products**, loaded from the same request as the featured grid | Resolved |
| DR-14 | Fonts ship **latin and latin-ext** subsets so the rupee sign can render; this overrides "latin only" in design section C | Resolved |
| DR-15 | Rate limiting is **database-backed** with the buckets in backend addendum 6.5 (resolves brief decision D16) | Resolved |
| DR-16 | Flat shipping default: **₹99 = 9900 paise** (`SHIPPING_FLAT_MINOR`), owner may change it to any whole-rupee amount (resolves the money part of brief D3) | Resolved (default; owner may change) |
| DR-17 | Working store name **Deskline** (brief D1 remains open for a final name; section 9.2 lists name-dependent strings) | Default adopted |
| DR-18 | Optional enhancements (mobile sticky buy bar, related products, copy-order-number button) are **excluded** by default | Resolved |
| DR-19 | **Order idempotency is serialised by user and key** with a transaction-scoped advisory lock taken before the idempotency lookup and before any stock check; the lookup then runs as a fresh READ COMMITTED statement. Duplicates replay the original order (200) instead of reporting `STOCK_CONFLICT`. Lock order: advisory lock, then products by ascending id. See section 10.1 and addendum 4A.1 | Resolved |
| DR-20 | **Login-failure limiting is atomic** (reserve a slot with a single-statement upsert, release it only on success). The five-failure policy is unchanged; the effect on simultaneous attempts is stated explicitly. See section 10.1 and addendum 6.5 | Resolved |
| DR-21 | **`bigint` and `numeric` values are never parsed globally.** Money and count fields are converted at the response boundary with validated safe-integer helpers and sent as JSON numbers. See section 10.1 and addendum 4A.2 | Resolved |
| DR-22 | **`@vercel/functions` is an approved production dependency**, used only to call `attachDatabasePool` immediately after the module-level `pg` pool is created, on Vercel only. Pool settings are validated environment variables. See section 10.1 and addendum 4A.3 | Resolved |
| DR-23 | **Fonts are files, not dependencies.** The font npm packages are a one-time acquisition tool and are removed; the WOFF2 files, licence texts, credits, and the rupee-glyph evidence are retained in the repository. See section 10.1 and addendum 7.9 | Resolved |
| DR-24 | **Public GitHub visibility is a portfolio recommendation, not a CodeAlpha requirement.** The repository name and the complete source code are the CodeAlpha requirements. See section 5 | Resolved (corrects the earlier classification) |
| DR-25 | **Explicit test configuration:** tests load only `.env.test` (`NODE_ENV=test`, no `DATABASE_URL`), the reset and the test helpers share `assertSafeTestDatabase()` (including `TEST_DB_DISPOSABLE=yes`), and all npm scripts are Windows-safe (no inline variable assignments, no POSIX-only commands). See section 10.1 and addendum 5.3a, 7.2, 7.6 | Resolved |

## 2. INR and the minor-unit naming strategy

### 2.1 Why `minor`

The original documents name money fields with `cents`, which is wrong for INR (paise) and misleading. Two consistent options were considered:

- `*_paise` (INR-specific, very clear for this store).
- `*_minor` (currency-neutral: "minor units of the store currency").

**Adopted: `*_minor`.** It is accurate for INR, never misleading, and survives a currency change without a mass rename. The documents define once: *one minor unit = one paise; 100 paise = ₹1*. In prose, say "paise" when the currency is meant and "minor units" for the generic idea.

### 2.2 Rename map (apply everywhere before implementation)

**Database**

| Old | New |
|---|---|
| `products.price_cents` | `products.price_minor` |
| `orders.subtotal_cents` | `orders.subtotal_minor` |
| `orders.shipping_cents` | `orders.shipping_minor` |
| `orders.total_cents` | `orders.total_minor` |
| `order_items.unit_price_cents` | `order_items.unit_price_minor` |
| `order_items.line_total_cents` | `order_items.line_total_minor` |

**API fields (camelCase)**

| Old | New |
|---|---|
| `priceCents` | `priceMinor` |
| `unitPriceCents` | `unitPriceMinor` |
| `lineTotalCents` | `lineTotalMinor` |
| `subtotalCents` | `subtotalMinor` |
| `shippingCents` | `shippingMinor` |
| `totalCents` | `totalMinor` |

**Environment, code, and tests**

| Old | New |
|---|---|
| `SHIPPING_FLAT_CENTS` | `SHIPPING_FLAT_MINOR` |
| `STORE_CURRENCY` (any value, placeholder `XXX`) | `STORE_CURRENCY=INR` only |
| JS identifiers `...Cents`, `...cents` | `...Minor`, `...minor` |
| Helper names in `lib/money.js` | `assertMinor`, `mulMinor`, `sumMinor`; frontend `formatMinor` |

**Request rejection.** The strict request schemas reject both the new names (`priceMinor`, `totalMinor`, and so on) **and** the legacy `...Cents` names when a browser sends them, as well as `userId` (backend addendum SEC-22, test API-47).

### 2.3 Corrected schema SQL (authoritative `db/migrations/001_init.sql`)

This replaces the schema in section 3 of the original backend contract. It differs only in the `_minor` names, the whole-rupee check, and the INR check. Runs inside the migration runner's transaction, so there is no `BEGIN` or `COMMIT`.

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

-- Sessions (opaque token; only its SHA-256 digest is stored)
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

-- Products (price_minor is paise; whole-rupee rule: multiple of 100)
CREATE TABLE products (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id    integer NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  slug           text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  summary        text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 300),
  description    text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 5000),
  specs          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(specs) = 'array'),
  price_minor    integer NOT NULL CHECK (price_minor > 0 AND price_minor % 100 = 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  is_active      boolean NOT NULL DEFAULT true,
  featured_rank  integer CHECK (featured_rank IS NULL OR featured_rank > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_slug_key UNIQUE (slug)
);
CREATE INDEX products_category_idx ON products (category_id) WHERE is_active;
CREATE INDEX products_newest_idx   ON products (created_at DESC, id DESC) WHERE is_active;
CREATE INDEX products_price_idx    ON products (price_minor, id) WHERE is_active;
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
  currency               char(3) NOT NULL CHECK (currency = 'INR'),
  subtotal_minor         bigint NOT NULL CHECK (subtotal_minor >= 0),
  shipping_minor         bigint NOT NULL CHECK (shipping_minor >= 0),
  total_minor            bigint NOT NULL,
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
  CONSTRAINT orders_total_check CHECK (total_minor = subtotal_minor + shipping_minor)
);
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC, id DESC);

-- Order items (name, slug, and unit price are snapshots taken at purchase time)
CREATE TABLE order_items (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name     text NOT NULL,
  product_slug     text NOT NULL,
  unit_price_minor integer NOT NULL CHECK (unit_price_minor > 0),
  quantity         integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  line_total_minor bigint NOT NULL,
  CONSTRAINT order_items_line_unique UNIQUE (order_id, product_id),
  CONSTRAINT order_items_total_check CHECK (line_total_minor = unit_price_minor::bigint * quantity)
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

The per-line quantity cap of 10 is enforced by the application; the database keeps the looser backstop of 100. Orders and products are never hard-deleted; retire a product with `is_active = false`.

### 2.4 Corrected API examples

These replace the USD-style examples in contract section 4.6 and show the new names.

**`POST /api/cart/validate`: response with one valid line and one reduced line** (shape illustration; numbers computed from seed prices):

```json
{
  "lines": [
    {
      "productId": 1, "slug": "felt-desk-mat-charcoal", "name": "Felt desk mat, charcoal",
      "image": null, "unitPriceMinor": 149900, "requestedQuantity": 2,
      "status": "ok", "allowedQuantity": 2, "lineTotalMinor": 299800, "issues": []
    },
    {
      "productId": 2, "slug": "felt-desk-mat-moss", "name": "Felt desk mat, moss",
      "image": null, "unitPriceMinor": 149900, "requestedQuantity": 4,
      "status": "quantity_reduced", "allowedQuantity": 3, "lineTotalMinor": 0,
      "issues": [ { "code": "INSUFFICIENT_STOCK", "message": "Only 3 are available." } ]
    }
  ],
  "summary": { "subtotalMinor": 299800, "shippingMinor": 9900, "totalMinor": 309700, "currency": "INR", "itemCount": 2 },
  "hasBlockingIssues": true
}
```

Rules unchanged: the summary counts only `ok` lines; `lineTotalMinor` is 0 for a line that is not `ok`.

**`POST /api/orders`: request** has no money fields:

```json
{
  "items": [ { "productId": 1, "quantity": 2 }, { "productId": 9, "quantity": 1 } ],
  "shipping": {
    "fullName": "Alex Morgan", "phone": "+91 98765 43210",
    "addressLine1": "221 Example Street", "addressLine2": "",
    "city": "Springfield", "region": "Example State", "postalCode": "641001"
  }
}
```

**`POST /api/orders`: 201 response** (`OrderDetail`; `Felt desk mat, charcoal` × 2 and `Aluminium laptop stand` × 1 at seed prices):

```json
{
  "order": {
    "id": "00000000-0000-4000-8000-000000000000", "orderNumber": "DL-100001",
    "status": "placed", "createdAt": "2026-10-26T10:00:00.000Z", "currency": "INR",
    "subtotalMinor": 549700, "shippingMinor": 9900, "totalMinor": 559600,
    "shipping": {
      "fullName": "Alex Morgan", "phone": "919876543210",
      "addressLine1": "221 Example Street", "addressLine2": null,
      "city": "Springfield", "region": "Example State", "postalCode": "641001"
    },
    "items": [
      { "productId": 1, "slug": "felt-desk-mat-charcoal", "name": "Felt desk mat, charcoal",
        "unitPriceMinor": 149900, "quantity": 2, "lineTotalMinor": 299800, "image": null },
      { "productId": 9, "slug": "aluminium-laptop-stand", "name": "Aluminium laptop stand",
        "unitPriceMinor": 249900, "quantity": 1, "lineTotalMinor": 249900, "image": null }
    ]
  }
}
```

Displayed to the user this is ₹2,998 + ₹2,499 = ₹5,497 subtotal, ₹99 shipping, ₹5,596 total (matching the design wireframes). The order identifier and timestamp above are placeholders for the shape only.

**Shape objects in contract 4.3** change only in names: `ProductSummary.priceMinor`, `OrderItem.unitPriceMinor` and `OrderItem.lineTotalMinor`, `OrderSummary.totalMinor`, `OrderDetail.subtotalMinor`, `OrderDetail.shippingMinor`, `OrderDetail.totalMinor`. `currency` is always `"INR"`.

### 2.5 Display and the whole-rupee rule

- The browser formats money through one function: `formatMinor(minor)` divides by 100 and uses `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`. ₹1,499 and ₹1,00,000 are the expected styles.
- Because DR-04 guarantees whole rupees, no value is ever rounded for display.
- **Alternative if the owner ever wants paise** (for example ₹1,499.50): drop the `price_minor % 100 = 0` check in a **new** migration, remove the seed and config rule, and change `maximumFractionDigits` to 2 with `minimumFractionDigits` 2 everywhere. No other change is needed. Until then, the whole-rupee rule applies.
- Seed prices in the original contract (USD-scale numbers such as 2800) are **replaced** by the INR table in backend addendum 7.5.
- Fonts must render ₹ (design correction DC-1, test MAN-20).
- No tax lines or GST claims are shown (design UD-06): prices are final amounts in this demo.

### 2.6 Prose corrections

Replace "cents" with "minor units (paise)" in: the brief's architecture notes and glossary ("Money is integers"), the contract's section 1 key-decisions table ("price_cents is the column name; it means minor units"), the contract's section 4.1 convention ("Money fields end in `Cents`"), the contract's environment table, and every example listed above. The sentence to use is: *"Money fields end in `Minor` and are integers in paise. Every response that contains money also contains `currency`, which is always `INR`."*

## 3. Session architecture (and the misattribution)

The backend contract's section 0 says the earlier brief chose a JWT in an HttpOnly cookie and that the contract changes this. The owner reports that the uploaded implementation brief does not contain that decision. The contract's "changes from the brief" row and wording are therefore **withdrawn** and must not be carried into implementation.

**What this package decides, stated without reference to any earlier choice:**

- The selected architecture is **server-side sessions**: a random 32-byte token (base64url) in an HttpOnly cookie; only its SHA-256 digest in the `sessions` table; fixed lifetime of `SESSION_TTL_DAYS` (default 7); logout deletes the row so the token stops working immediately.
- Rationale (recommendations, not CodeAlpha requirements): real logout and revocation, no signing secret to protect or rotate, no token-format pitfalls, simple to test. The cost is one indexed database query per authenticated request, accepted for a demo-scale store.
- Specified in backend addendum 6.1 to 6.3 and tests SECT-01 to SECT-03, API-31, API-36 to API-40.

**If any copy of the brief or contract still mentions** `JWT_SECRET`, `JWT_EXPIRES_IN`, `jsonwebtoken`, "JWT in an HttpOnly cookie", or a decision-table row (D6) recommending JWT, delete or rewrite it to point to this section. The original contract's table row "Session mechanism (D6)" is replaced by: *"Session mechanism: server-side sessions, selected by this specification package (see the reconciliation file, DR-05)."*

## 4. Contradictions and stale references

| ID | Where | Problem | Resolution |
|---|---|---|---|
| X-01 | Brief D2; contract env placeholder `STORE_CURRENCY=XXX`; contract seed table and API examples (USD-scale numbers, `"currency": "USD"`); design wireframe amounts without a currency | Currency left open, examples inconsistent with INR | DR-01 to DR-04; corrected examples in 2.4; seed in addendum 7.5; design amounts use ₹ |
| X-02 | Brief and contract: `price_cents`, `*Cents`, `SHIPPING_FLAT_CENTS` | "cents" is wrong for paise | Rename map 2.2; schema 2.3 |
| X-03 | Contract section 0 (attribution of a JWT decision to the brief) | Not present in the uploaded brief | Section 3 |
| X-04 | Brief section 10 (architecture reference): `jsonwebtoken`, `dotenv`, `nodemon`, `JWT_SECRET` | Conflicts with sessions and the Node 22 flags | DR-05, DR-09; addendum 5 and section 8 of the contract |
| X-05 | Brief architecture: `api/index.js` plus a root `server.js`; contract: `src/app.js` entry and `scripts/dev-server.js` | A root `server.js` is a recognised Vercel entry name and would compete with `src/app.js`; `api/index.js` is unnecessary with Vercel's Express support | DR-08. The Vercel Express behaviour was taken from Vercel's documentation while writing the contract; deployment tests DEP-01 to DEP-06 re-verify it |
| X-06 | Contract tree lacks `src/createApp.js`; `config.js` described as exporting a frozen object | Tests need to build the app with custom config and a log sink | Addendum 0 (tree amendment): `createApp({config, logSink})`, `loadConfig(env)` |
| X-07 | Brief section 10 "Visual direction": `#F6F3EE` and `#C2410C`; design spec section 0 says "section 10 (Visual direction)" of the brief | Palette superseded; the cited name is wrong (section 10 is "Architecture reference", the visual direction is a subsection of it) | Design sections A to D (Pine / Fog / Marigold) are authoritative. Correct reference: "brief section 10, subsection Visual direction" |
| X-08 | Brief data model lists only users, categories, products, orders, order_items with fewer columns | Missing `sessions`, `product_images`, `rate_limits`, `summary`, `specs`, `featured_rank`, `currency`, `request_hash`, `status` | Schema 2.3 is authoritative |
| X-09 | Brief decisions D6 (sessions) and D16 (rate limiting) described as open or as a recommendation | Now resolved | DR-05, DR-15 |
| X-10 | Brief AC-3 ("name and description") vs contract (name, summary, description) | Wording difference | DR-10 (superset; AC-3 still met) |
| X-11 | Design register form has "Confirm password"; contract's strict schema rejects unknown fields | The browser would send a rejected field | DR-11; stated in design E5 and contract 4.1 |
| X-12 | Design E1 hotspots: data source unspecified; CSP forbids inline `style` attributes | Two gaps | DR-13; positions via `data-slot` CSS selectors (design addendum E1) |
| X-13 | Design section E0: only "desktop" and "mobile" header | Tablet undefined | DR-12 |
| X-14 | Design section C: copy only latin WOFF2 | Cannot render ₹ reliably | DR-14 |
| X-15 | Earlier design draft E3 and E8: optional sticky buy bar, related products, copy-order-number button | Extra features not required by the brief | DR-18; excluded unless UD-08 changes |
| X-16 | Contract 7.4 and 4.5: image fallback "(design spec section H)"; design E3: "(see F)" and "(see H)"; contract section 0/2: "section 6", "section 9", "section 11", "section 7 and 8" | Referenced sections were missing from the exported copies | Resolved by the addenda, which use the same numbers. "Section 7 and 8" for scripts is more precisely **7.2** |
| X-17 | Contract section 5 (draft): `.env.example` and variable table | Did not include `PORT`, and had the placeholder currency | Addendum 5.1 and 5.3 are authoritative |
| X-18 | Contract header checks: CSP set only in `vercel.json` for static files; helmet for API | Not a contradiction, but easily missed: static files bypass Express on Vercel | Addendum 6.6 and 9.1 keep both; test DEP-07 verifies what Vercel actually returns |
| X-19 | Store name open (brief D1) but used in the cookie name, `localStorage` key, order prefix, footer, titles | A rename would touch several strings | Section 9.2 |
| X-20 | Brief D18 (deadline and second task) and CodeAlpha rule P6 | Open; the certificate needs 2 or 3 tasks | Still open, owner action (section 9.1) |
| X-21 | The earlier brief draft lists P1 as a "Public GitHub repo"; the CodeAlpha PDF says only to upload the complete source code to a repository with the prescribed name | The PDF does not state visibility | DR-24; section 5 |
| X-22 | Contract 4.9: idempotency lookup, then product locks | Two concurrent duplicates could both miss the lookup; the second could report `STOCK_CONFLICT` instead of replaying | DR-19; addendum 4A.1 replaces 4.9 steps 3 to 5 and 11 |
| X-23 | Addendum 6.5 (revision 1): read the failure count, verify, increment after a failure | Parallel attempts could all pass the read and exceed five failures | DR-20; addendum 6.5 rewritten |
| X-24 | Contract 4.3 and 4.8: `Minor` and count fields are JSON integers; the schema uses `bigint`, `COUNT`, `SUM` | node-postgres returns `int8` and `numeric` as strings | DR-21; addendum 4A.2 |
| X-25 | Dependency allowlist of six packages vs Vercel and Neon guidance to use `attachDatabasePool` | The guidance needs `@vercel/functions` | DR-22; allowlist is now seven |
| X-26 | Design spec section C and design addendum H.5 ("install the font packages through npm") vs the allowlist | Could be read as keeping font packages as dependencies | DR-23; they describe a one-time acquisition, clarified in addendum 7.9; no design regeneration needed |
| X-27 | Addendum 7.2 (revision 1): `npm test` loaded `.env` (`NODE_ENV=development`) and shared the app's variables | The test environment was not explicit, and test safety depended on production variables being absent | DR-25 |
| X-28 | Addendum section 0 cited the session decision as DR-04 | It is DR-05 (DR-04 is the whole-rupee rule) | Corrected in the addendum |
| X-29 | Test inventory and AC mapping after the corrections | New tests had to be wired into phases, AC mapping, STATUS template, and README | Done in addendum 8, 10, 11, 9.6; counts in section 10.4 |

## 5. CodeAlpha's original requirements (preserved, not weakened)

### 5.1 Mandatory (from the CodeAlpha PDF)

| ID | Requirement | Where it is satisfied |
|---|---|---|
| R1 | Basic e-commerce site with product listings | Design E2; API 4.5; tests API-04 to API-18 |
| R2 | Product details page | Design E3; API 4.5 |
| R3 | Shopping cart | Design E4; API 4.6 |
| R4 | Order processing | Design E7, E8; API 4.8, 4.9 |
| R5 | User registration and login | Design E5, E6; API 4.7 |
| R6 | Database storing products, users, and orders | Schema 2.3 |
| R7 | Frontend in HTML, CSS, JavaScript | Constraint section 7 |
| R8 | Backend in Django or Express.js | Express.js (Django is not used) |
| P1 | Upload the **complete source code** to a GitHub repository named `CodeAlpha_ProjectName` (the PDF does not state whether the repository must be public) | `CodeAlpha_EcommerceStore`; visibility per DR-24 |
| P2 | LinkedIn video explaining the project, with the GitHub repository link | Demo plan in the brief section 9; addendum 10 phase 12 |
| P3 | LinkedIn status post tagging @CodeAlpha | Owner action |
| P4 | Submission through the form shared in the WhatsApp group | Owner action |
| P5 | Complete within the assigned time frame | Owner action; confirm the deadline (X-20) |
| P6 | Complete 2 or 3 tasks in total | Owner action; this project is one of them |

### 5.2 What kind of statement is each item?

| Kind | Meaning | Items |
|---|---|---|
| **CA** | Required by CodeAlpha | R1 to R8, P1 to P6 |
| **PC** | Project constraint chosen by the owner | HTML/CSS/vanilla JS only; Node.js and Express; PostgreSQL on Neon; Vercel; npm; parameterised SQL; secrets in environment variables; HttpOnly cookies; server-side price calculation; transaction; INR with integer paise; demo checkout with no payment of any kind; the extra features listed in the brief (search, filter, sort, responsive navigation, persistent cart, order history, validation, states) |
| **REC** | Recommendation (may be changed) | **Public repository visibility (portfolio recommendation, DR-24)**; server-side sessions design; bcryptjs and cost 12; database-backed rate limiting and the reserve-then-settle algorithm; advisory-lock idempotency design; `@vercel/functions` and the pool settings; Express 5; `cleanUrls`; whole-rupee rule; seed catalogue; font file workflow; copy and microcopy; Pine/Fog/Marigold identity and all visual tokens; test IDs, test configuration, and `STATUS.md` format |
| **DR** | Decision recorded in this file | Section 1 |

Nothing in sections 1 to 4 weakens an item marked CA or PC.

**Repository visibility (corrected).** The CodeAlpha PDF requires a GitHub repository with the prescribed name containing the complete source code, and a LinkedIn video that includes the repository link. It does not say the repository must be public, and no other CodeAlpha instruction in this package makes it mandatory. A **public** repository is therefore classified as a **portfolio recommendation (REC)**, because it lets reviewers and employers open the code. The naming requirement `CodeAlpha_ProjectName` (here `CodeAlpha_EcommerceStore`) is unchanged. If the owner keeps the repository private, the owner must make sure the people who review it can open it (follow the submission form's instructions), and the site's footer link to the repository stays hidden, because a link that visitors cannot open is a dead link (design addendum UD-09).

## 6. The demo checkout stays free of payments

**Rule (DR-06):** the checkout creates a real database order and takes no payment of any kind.

Forbidden anywhere in the code, UI, configuration, or documents: payment-gateway SDKs or APIs (for example Razorpay, Stripe, PayPal, PayU, Cashfree, Paytm), UPI intents or QR codes, card/UPI/wallet/net-banking input fields (including fields with `cc-number`, `cc-exp`, `cc-csc` autocomplete tokens), mock or "test mode" payment screens, payment-method selection or icons, "secure payment" or trust badges, payment status or payment ID columns, webhooks, and fake payment confirmations.

Allowed: the demo notices that say no payment is taken (announcement bar, product, cart, checkout panel, confirmation).

**Enforcement.** Add to the static checks a test `STAT-12`: scan `public/`, `src/`, `db/`, and `scripts/` for gateway names, payment SDK URLs, `cc-` autocomplete tokens, and the words `cvv` and `card number`; the only permitted occurrences of the word "payment" are in the specified demo notice strings. This test is added to backend addendum 8.7, and the check applies to AC-40.

## 7. Framework and hosting constraints (unchanged)

| Constraint | Value |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript only. No React, Next.js, Angular, Vue, or any frontend framework |
| Backend | Node.js (22.x) and Express.js (version 5) |
| Database | PostgreSQL on Neon; pooled string at runtime, direct string for migrations and seeding and tests |
| Hosting | Vercel (Express support); static files from `public/`; `express.static` MUST NOT be used |
| Packages | npm; `package-lock.json` committed; production dependencies exactly the seven in DR-09 and section 10.2; no development dependencies; font packages are never retained (DR-23) |
| SQL | Parameterised queries only |
| Secrets | Environment variables only; never in source control, frontend code, logs, or documents |

## 8. Patch list for the original three files

Apply these by section title if the files are used directly instead of the addenda. Where a patch conflicts with the addenda, the addenda and this file win.

**Implementation Brief**
- Section 8, decision table: D2 becomes "INR, integer paise (DR-01 to DR-04)"; D3 becomes "flat ₹99, configurable (DR-16)"; D6 becomes "server-side sessions (DR-05)"; D16 becomes "database-backed (DR-15)".
- Section 10: replace the dependency list with DR-09; remove `JWT_SECRET` and `JWT_EXPIRES_IN`; replace the architecture layout (`api/index.js`, root `server.js`) with DR-08; replace the data model with section 2.3; rename all money names per 2.2; the "Visual direction" subsection defers to the design specification.
- Section 11, rule 7 ("Money is integers"): add "in paise; fields named `...Minor`".
- Requirement table, P1: replace "Public GitHub repo" with "complete source code in a GitHub repository named `CodeAlpha_ProjectName`" and list public visibility as a portfolio recommendation (DR-24).

**Design System and Page Specifications**
- Section 0: the reference to the brief becomes "section 10, subsection Visual direction"; add the four corrections DC-1 to DC-4 from the design addendum.
- Section C: font subsets become latin and latin-ext.
- Section C: replace "install the variable packages through npm and copy the files" with the one-time acquisition workflow in backend addendum 7.9 (packages are removed afterwards; font files, licences, and the rupee-glyph evidence stay in the repository).
- Add the addendum (E to L) after section D.

**Backend Implementation Contract**
- Section 0: delete the "changes from the earlier brief" row about sessions (section 3 above); keep the other rows only as descriptions of this contract's choices, not as changes to something the brief decided.
- Section 1: rename the money wording; `src/createApp.js` added to the tree in section 2.
- Section 3: replace the schema with 2.3.
- Sections 4.3, 4.6, 4.8: money field names per 2.2; replace examples with 2.4; `currency` is `INR`.
- Section 4.9: superseded by backend addendum 4A.1 (advisory-lock idempotency). Sections 4.3 and 4.8: add backend addendum 4A.2 (numbers are JSON numbers, converted at the response boundary).
- Add the addendum (sections 5 to 11).

## 9. Remaining owner decisions

### 9.1 Needed from the owner (no default can replace these)

| Item | Why it matters |
|---|---|
| Deadline and second CodeAlpha task (brief D18, CodeAlpha P5 and P6) | The certificate needs 2 or 3 tasks |
| Final store name (brief D1) | See 9.2; default Deskline |
| GitHub repository URL and visibility | Needed for submission and the LinkedIn video. Public visibility is a recommendation (DR-24); the footer link is shown only when the repository is public and the URL exists |
| Neon projects and branches (`main`, `preview`, `dev`, `test`) and Vercel project | Human setup steps in addendum 7.1 and 9.4 |
| Product and hero imagery | Created or properly licensed (design addendum H); placeholders until supplied |

### 9.2 Strings that depend on the store name

Wordmark and `<title>` suffix; announcement bar and footer text; favicon letter; `SESSION_COOKIE_NAME` default; `localStorage` key `deskline.cart.v1`; `ORDER_NUMBER_PREFIX`; README and credits; design copy that says "Deskline". If the name changes, change all of these together before Phase 7.

### 9.3 Defaults already chosen (owner may override)

Shipping ₹99 (DR-16); no tax wording; generic address and phone validation rather than India-specific rules; owner-made hero artwork; all design unresolved items UD-01 to UD-13 use the defaults in the design addendum, section L.

### 9.4 Facts that must be verified at implementation time (not assumed)

Whether `cleanUrls` serves each page on Vercel; what `req.ip`, `req.protocol`, and `X-Forwarded-For` contain on Vercel; whether Vercel's `headers` block applies to function responses; whether the `attachDatabasePool` call and the configured pool settings behave on the deployment (the recommendation itself is documented by Vercel and Neon and is adopted in DR-22); whether the npm scripts run unchanged on Windows and on a POSIX shell; current versions of every dependency; whether the ₹ glyph exists in the chosen fonts; whether Preview deployments are behind Deployment Protection. Each is a row in `docs/STATUS.md` (backend addendum 11.3), marked `NOT RUN` until checked.

## 10. Revision 2: final correction pass

### 10.1 Decisions in detail

**DR-19: order idempotency (addendum 4A.1).**
- *Problem:* the idempotency lookup ran before the product locks, so concurrent duplicates could both miss it, and the later one could return `STOCK_CONFLICT` after the first had consumed the stock.
- *Decision:* take `pg_advisory_xact_lock` on a hash of (user id, idempotency key) as the first statement after the transaction-local timeouts, at READ COMMITTED; then run the idempotency lookup; only then lock products in ascending id order. A same-key, same-request duplicate gets the original order as a 200 replay; a same-key, different-request duplicate gets `IDEMPOTENCY_KEY_REUSED`; different users never interact. The unique constraint remains as a backstop, with one automatic re-check on `23505`.
- *Guarantees:* at most one order per (user, key); no duplicate stock decrement; deadlock-free lock order.
- *Evidence required:* CON-04, CON-07 to CON-10, DB-12, API-54, API-55, API-56, DEP-18. None has been run.

**DR-20: login-failure limiter (addendum 6.5).**
- *Problem:* read-then-increment let parallel attempts all pass the check.
- *Decision:* reserve a slot with one atomic upsert before any password work. Above five: release and return 429 with no bcrypt. Five or fewer: verify; a wrong password or unknown email keeps the slot; a correct password releases it. No lock or connection is held during bcrypt.
- *Policy preserved:* five failed checks per normalised email and client address per 15-minute window; blocked even with the correct password; dummy bcrypt for unknown emails when permitted; successes are not failures; database-backed; fail closed.
- *Stated refinement:* the counter is failures plus in-flight checks, so more than five simultaneous attempts for one email and address may receive 429 even if correct. Sequential behaviour is exactly the policy.
- *Evidence required:* API-42, API-67, API-68, CON-11 to CON-13, SECT-16, DEP-19. None has been run.

**DR-21: numeric serialisation (addendum 4A.2).**
- *Decision:* no global `setTypeParser` or `parseInt8`. `toSafeMinor` and `toSafeCount` convert `bigint` and aggregate values at the serialiser boundary, require non-negative safe integers, and fail with a generic 500 (field name logged, value never) otherwise. All responses use JSON numbers. Order creation also re-verifies the arithmetic invariants on read-back before commit.
- *Evidence required:* UT-13, DB-13, API-64, API-65, API-66, STAT-13. None has been run.

**DR-22: Vercel pool management (addendum 4A.3).**
- *Decision:* adopt `@vercel/functions`; call `attachDatabasePool(pool)` once, immediately after creating the module-level pool, on Vercel only (via `runtime.onVercel`). Settings (`DB_POOL_MAX` 2 to 10, default 5; idle 5000 ms; connection timeout 5000 ms; statement timeout 10000 ms) are validated variables. The pooled Neon string is used at runtime; the direct string for migrations, seeding, and tests.
- *Evidence required:* UT-14, STAT-13, DEP-17, DEP-18. None has been run.

**DR-23: font assets (addendum 7.9).**
- *Decision:* font packages are used once, in a scratch folder, to obtain latin and latin-ext WOFF2 files and licence texts, then removed. The repository keeps `public/fonts/*.woff2`, the licence files, `public/fonts/README.md` (versions, sources, licence, checksums), `public/css/fonts.css`, the credits line in the README, and the rupee-glyph evidence. The design specification's "install through npm" is read as this one-time step.
- *Evidence required:* STAT-05, STAT-14, MAN-20. None has been run.

**DR-24: GitHub visibility (section 5).** Public visibility is a portfolio recommendation. The naming requirement and the complete source code requirement are unchanged.

**DR-25: test configuration and scripts (addendum 5.3a, 7.2, 7.6).**
- *Decision:* `.env` (`NODE_ENV=development`) is for the app and the database scripts; `.env.test` (`NODE_ENV=test`, `TEST_DATABASE_URL`, `TEST_DB_DISPOSABLE`, no `DATABASE_URL`) is for tests and the reset. `assertSafeTestDatabase()` requires `NODE_ENV=test`, a direct host, `TEST_DB_DISPOSABLE=yes`, a different host and database from `DATABASE_URL` and `DATABASE_URL_UNPOOLED` when present, and no `VERCEL`. Scripts use only `--env-file`, `&&`, and quoted globs. Production-mode integration tests flip behaviour flags through a helper and leave database settings alone.
- *Evidence required:* DB-11, STAT-05, STAT-07, MAN-25. None has been run.

### 10.2 Final production dependency list

| Package | Purpose | Notes |
|---|---|---|
| `express` (version 5) | HTTP application | |
| `pg` | PostgreSQL client | One module-level pool |
| `bcryptjs` | Password hashing | Cost from `BCRYPT_COST` |
| `cookie-parser` | Reads the session cookie | |
| `helmet` | Security headers for API responses | |
| `zod` | Strict input validation | |
| `@vercel/functions` | `attachDatabasePool` on Vercel | Added by DR-22; imported only in `src/db/pool.js` |

There are **no development dependencies**. Used but not dependencies: Node 22 built-ins (`node:test`, `--env-file`, `--watch`, `crypto`, `fetch`). Not used: `jsonwebtoken`, `dotenv`, `nodemon`, `cross-env`, `supertest`, and any font package.

### 10.3 Requirement classification after this pass

| Item | Class |
|---|---|
| Repository named `CodeAlpha_ProjectName` (here `CodeAlpha_EcommerceStore`) | CA |
| Complete source code uploaded to that repository | CA |
| LinkedIn video including the repository link | CA |
| Repository is public | **REC** (portfolio) |
| Express or Django backend; HTML, CSS, JavaScript frontend; products, users, and orders in a database | CA |
| PostgreSQL on Neon, Vercel, npm, no frontend framework, INR in paise, no payments of any kind | PC |
| Server-side sessions, advisory-lock idempotency, reserve-then-settle limiter, boundary numeric helpers, `@vercel/functions` pool attach, font file workflow, `.env.test` workflow | REC (recorded as DR decisions) |

### 10.4 Consistency statements for this revision

- **Schema:** unchanged. The corrections use existing columns (`orders.idempotency_key`, `orders.request_hash`, the unique constraint on `(user_id, idempotency_key)`, `rate_limits(bucket, key_hash, window_start, hits)`, and the `integer` and `bigint` money columns).
- **Environment variables:** addendum 5.1 is the complete list (application variables, the system variable `VERCEL`, and the two test-only variables), with `.env.example` and `.env.test.example` defined in 5.3 and 5.3a.
- **Tests:** the addendum now defines 184 test identifiers (14 unit, 13 database, 68 API, 13 concurrency, 18 security, 14 static, 25 manual, 19 deployment). Every identifier referenced in the phase table or the AC mapping is defined. New or changed identifiers in this revision: UT-13, UT-14, DB-11 to DB-13, API-42, API-46, API-54, API-64 to API-68, CON-03, CON-04, CON-07 to CON-13, SECT-16, STAT-05, STAT-07, STAT-13, STAT-14, MAN-20, MAN-25, DEP-14, DEP-17 to DEP-19.
- **README and `docs/STATUS.md`:** README contents (addendum 9.6) and the STATUS template (addendum 11.3) were updated to name `.env.test`, the font credits, the dependency count, the Windows check, and the new verification rows.
- **Nothing has been run.** No test, deployment check, or security check has been executed or passed. Every status in `docs/STATUS.md` starts as `NOT RUN`.

---
*End of reconciliation. Generated files in this package: `Deskline_Design_Spec_Addendum.md`, `CodeAlpha_Backend_Contract_Addendum.md`, `CodeAlpha_Spec_Reconciliation.md`.*
