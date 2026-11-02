# CodeAlpha_EcommerceStore: Backend Contract Addendum

Addendum to **CodeAlpha_EcommerceStore Backend Implementation Contract**, which ends after section 4.9. This file supplies the missing sections **5 to 11** under the same numbering, so references in the original contract (for example "section 6", "section 9", "section 11") resolve here. Specifications only; no application code. Nothing in this file has been implemented, run, or deployed.

**Precedence:** `CodeAlpha_Spec_Reconciliation.md` wins over this file. This file wins over the original contract where they differ.

**Revision 2 (final correction pass).** This file now also contains seven targeted corrections: (1) concurrent order idempotency (4A.1); (2) an atomic login-failure limiter (6.5); (3) safe `bigint` serialisation (4A.2); (4) Vercel pool management with `@vercel/functions` (4A.3); (5) a font asset workflow that keeps font packages out of the dependency list (7.9); (6) GitHub visibility is a recommendation, not a requirement (reconciliation file); (7) an explicit, Windows-safe test configuration (5.3a, 7.2, 7.6). New and changed tests are in section 8. No database column or route changed.

## 0. Conventions and amendments carried into this addendum

- **MUST / MUST NOT** are requirements. **[REC]** marks a recommendation where CodeAlpha and the brief are silent.
- **Currency and money names (decided in the reconciliation file).** The store prices in **INR**. All money is an **integer number of paise**. Money fields use the suffix **`Minor`** in the API and **`_minor`** in the database and environment variables (`priceMinor`, `price_minor`, `SHIPPING_FLAT_MINOR`). Wherever the original contract says `cents`, read `minor`. This addendum uses the new names throughout. The corrected schema SQL is in the reconciliation file.
- **Session architecture.** Server-side sessions are the selected architecture (see the reconciliation file, decision DR-05). There is no JWT and no JWT secret.
- **Tree amendment.** The original file tree is amended: add `src/createApp.js` (exports `createApp({ config, logSink })`, which builds and returns the Express app). `src/app.js` stays the only Vercel entry file and does `export default createApp({ config: loadConfig() })`. `src/config.js` exports `loadConfig(env)` (pure, testable), not a frozen module-level object. Tests call `createApp` with a custom config and log sink; production code never does. Further tree additions: `src/lib/numbers.js` (4A.2); `src/db/pool.js` exporting `createPool({ config, attachDatabasePool })` (4A.3); `.env.test.example` (5.3a); `tests/helpers/config.js` (8.1); `public/css/fonts.css`, `public/fonts/README.md`, and the font licence files (7.9); and `docs/evidence/` for test evidence (11.4).
- **Honesty rule.** The implementing agent MUST NOT write PASS for anything it has not run. See section 11.

### Index: where each requested topic is covered

| Topic | Section |
|---|---|
| Environment variables, definitions, validation | 5 |
| Session lifetime, tokens, cookies, cleanup, auth protections | 6.1, 6.2 |
| Origin/CSRF protection and security headers | 6.3, 6.6 |
| Rate-limit rules, thresholds, windows, cleanup | 6.5 |
| Package scripts, local development, migrations, seeding, test-database isolation | 7 |
| Unit, integration, database, API, concurrency, security tests | 8 |
| Exact local setup commands | 7.8 |
| Vercel configuration, static routing, API routing, environment configuration, deployment verification | 9 |
| README and `.env.example` requirements | 5.3, 9.6 |
| Acceptance-test reporting procedure for `docs/STATUS.md` covering AC-1 to AC-55 | 11 |
| Order idempotency serialisation, numeric (`bigint`) serialisation, database pool management | 4A |
| Test configuration, `NODE_ENV` handling, Windows-safe scripts | 5.1, 5.3a, 7.2, 7.6 |
| Font asset workflow | 7.9 |

## 4A. Amendments to contract section 4 (these supersede the original text)

These amendments come from the final correction pass. Where they differ from contract sections 4.3, 4.8, or 4.9, **this section wins**. No database column changes are needed: `orders.idempotency_key`, `orders.request_hash`, the unique constraint on `(user_id, idempotency_key)`, and the existing `integer` and `bigint` columns already support everything below.

### 4A.1 Order creation: idempotency is serialised before any stock check (replaces contract 4.9 steps 3 to 5 and 11)

**The defect being corrected.** Contract 4.9 checked the idempotency key and *then* locked product rows. Two concurrent requests with the same key could both find no order. One would commit and decrement stock while the other waited on the product lock; the second would then see too little stock and answer `STOCK_CONFLICT` instead of replaying the first order.

**The rule.** Requests with the same user and idempotency key are serialised by a transaction-scoped PostgreSQL advisory lock taken **before** the idempotency lookup, the stock check, and every product lock. After the lock is acquired, the idempotency lookup runs as a fresh statement, so it sees any order a competing duplicate has just committed.

**Authoritative algorithm** (implemented in `services/orderService.js`; all SQL parameterised; the user id is `req.user.id` and nothing else):

1. Parse and normalise the body with the strict schema; merge duplicate product ids by summing quantities (reject a merged quantity over 10); build the canonical request (items sorted by product id, normalised shipping fields); `request_hash` = SHA-256 of its JSON.
2. Count the attempt in the `orders_user` rate-limit bucket (6.5), in its own autocommit statement before the transaction, so every attempt counts, including replays and failures.
3. `BEGIN ISOLATION LEVEL READ COMMITTED`. Immediately set the transaction-local timeouts with `SELECT set_config('lock_timeout', '5s', true), set_config('statement_timeout', $1, true)`, where `$1` is the configured `DB_STATEMENT_TIMEOUT_MS` expressed in milliseconds. **READ COMMITTED is mandatory.** Under REPEATABLE READ or SERIALIZABLE a transaction's snapshot is fixed at its first query, so a waiting duplicate would not see the order the first request committed.
4. **Serialise by user and key.** Run `SELECT pg_advisory_xact_lock(hashtextextended('order:' || $1 || ':' || $2, 0))` with `$1` = user id and `$2` = idempotency key. The lock is released automatically at COMMIT or ROLLBACK and works through Neon's pooled (PgBouncer transaction-mode) connections. **Session-level advisory locks MUST NOT be used.** A hash collision between two different (user, key) pairs only causes extra waiting, never a wrong result.
5. **Idempotency lookup**, as its own statement after the lock: select the order for `(user_id, idempotency_key)`.
   - Found and `request_hash` equal: read the order and items, finish the transaction without writing, and return **200** with `Idempotent-Replay: true` and the original order.
   - Found and `request_hash` different: ROLLBACK and return **409 `IDEMPOTENCY_KEY_REUSED`**.
   - Not found: continue.

   This check happens **before** any product lock or stock check, so a replay can never be turned into a `STOCK_CONFLICT`.
6. Lock the products in one statement: select `id, name, slug, price_minor, stock_quantity, is_active` for the requested ids, `ORDER BY id`, `FOR UPDATE`.
7. Verify every line (unknown or inactive: `unavailable`; stock 0: `out_of_stock`; quantity above stock: `insufficient_stock`). On any problem ROLLBACK and return **409 `STOCK_CONFLICT`** listing all problems. Nothing is stored.
8. Compute money in JavaScript from the locked rows using validated safe integers (4A.2): line total = unit price times quantity; subtotal = sum of lines; shipping = `SHIPPING_FLAT_MINOR`; total = subtotal plus shipping.
9. Decrement stock per line with `UPDATE products SET stock_quantity = stock_quantity - $qty WHERE id = $id AND stock_quantity >= $qty`. Any update that affects 0 rows aborts with ROLLBACK and 409.
10. Insert the order (`order_number` = `ORDER_NUMBER_PREFIX`, a hyphen, and `nextval('order_number_seq')`; currency `INR`; the amounts; the normalised shipping fields; the key; the hash), then all `order_items` rows (name, slug, and unit price copied from the locked product rows).
11. Read the order and items back inside the same transaction, convert them with the boundary helpers (4A.2), and assert the invariants: `total = subtotal + shipping`; each `lineTotal = unitPrice * quantity`; the sum of line totals equals `subtotal`; `itemCount` equals the sum of quantities. A violation ROLLBACKs and returns 500 (log code `ORDER_INVARIANT_FAILED`). Nothing inconsistent is ever committed.
12. COMMIT (this releases the advisory lock) and return **201** with the order built from the read-back rows.
13. On any error: ROLLBACK, and release the client in a `finally` block.
    - `23505` on `orders_idempotency_key` (not expected while the advisory lock works): ROLLBACK and re-run steps 3 to 5 once in a fresh transaction; if no order is found, return 500.
    - `55P03` (lock timeout, including the advisory-lock wait) and connection errors: 503 `SERVICE_UNAVAILABLE`. Retrying with the **same** key is safe.
    - `40P01` (deadlock): treated as 503 (it should be impossible; see below).
    - Everything else: 500 with the generic message.

**Lock hierarchy (deadlock freedom).** Every order transaction acquires locks in this one order: (1) the advisory lock for its (user, key); (2) product rows in ascending id; (3) the rows it inserts. No code path takes an advisory lock after a product lock, or locks products in any other order. Two different (user, key) pairs never wait on each other's advisory lock, so the ordered-product-lock argument from contract 4.9 still holds.

**Outcomes for concurrent requests.**

| Situation | First request to take the lock | Other concurrent duplicates |
|---|---|---|
| Same user, same key, same canonical request, order creatable | 201: creates the order and decrements stock once | Each waits for the lock, then finds the order: **200 replay with the same order id**, no stock change |
| Same user, same key, same request, order not creatable (stock conflict) | 409 `STOCK_CONFLICT`, nothing stored | Each then runs the same checks and also gets 409; if stock has become available meanwhile one of them creates the order and the rest replay it |
| Same user, same key, **different** canonical request | Creates its order (if valid) | **409 `IDEMPOTENCY_KEY_REUSED`**; never `STOCK_CONFLICT` and never a second order |
| Different users, same key | Independent | Independent (the advisory lock key and the unique constraint both include the user) |

**Key semantics.** A key is bound permanently to the first order that user creates with it. A request that ends in 400, 409 `STOCK_CONFLICT`, 429, 500, or 503 stores nothing and does not bind the key, so the same key may be retried. The browser generates a new UUID for each new checkout attempt (design E7) and reuses it only to retry the same attempt. A duplicate that waits longer than the 5-second lock timeout receives 503; retrying with the same key is safe and ends in a replay or the original result.

### 4A.2 Numeric serialisation (`bigint`, `COUNT`, `SUM`)

**The defect being corrected.** node-postgres returns `int8` (`bigint`) and `numeric` values as **strings**, because a JavaScript number cannot hold every 64-bit value, while the API defines the `...Minor` and count fields as JSON integers. `int4` (`integer`) values arrive as numbers.

**Rules.**

- The application MUST NOT register global parsers: no `pg.types.setTypeParser` for OID 20 (`int8`) or OID 1700 (`numeric`), and no `parseInt8` setting, anywhere (tests STAT-13 and DB-13). Other `bigint` columns stay strings unless they are explicitly converted.
- Conversion happens only at the **service-to-response boundary**, in serialisers (`serializeOrder`, `serializeOrderSummary`, `serializeProduct`, `serializeCategory`, and the pagination builder). Routes never send raw database rows.
- New file `src/lib/numbers.js` exports two functions:
  - `toSafeMinor(value, fieldName)` accepts a string that matches `^(0|[1-9][0-9]*)$` or a number, converts it with `Number`, requires `Number.isSafeInteger(result)` and `result >= 0`, and otherwise throws an internal error with code `INVALID_MONEY_VALUE`.
  - `toSafeCount(value, fieldName)` applies the same rule with error code `INVALID_COUNT_VALUE`.
  - A thrown error reaches the global error handler: the client receives the generic 500 envelope, and the log line carries the code and the **field name only**, never the value.
- **Fields that go through the helpers.** The `bigint` money columns (`subtotal_minor`, `shipping_minor`, `total_minor`, `line_total_minor`); the `integer` money fields (`price_minor`, `unit_price_minor`) for uniform validation; and every count: `itemCount` (`SUM(quantity)` returns `bigint`), `pagination.total` and `productCount` (`COUNT(*)` returns `bigint`). `totalPages` is computed from the validated total.
- JSON output uses numbers only. No `BigInt` value is ever serialised, and no money or count field is ever a JSON string.
- **Bound check.** The largest possible order is 50 lines times quantity 10 times the largest `integer` price (2,147,483,647), about 1.07 times 10^12, far below 2^53. Valid data can therefore always be converted. A value outside the safe range means corrupted data and is reported as a 500, never silently rounded.
- Order arithmetic is done on validated numbers in JavaScript (4A.1 step 8) and re-verified on read-back (step 11). The database CHECK constraints (`total = subtotal + shipping`, `line_total = unit_price * quantity`) remain the final backstop.

### 4A.3 Database pool creation and Vercel pool management

**Decision: `@vercel/functions` is an approved production dependency.** Vercel's guidance for Fluid compute, and Neon's guide for Vercel Functions, recommend attaching each module-level `pg` pool with `attachDatabasePool`, so that idle connections are released before a function instance is suspended (internal timers such as `idleTimeoutMillis` do not run while an instance is suspended). The production dependency allowlist is therefore **seven** packages (section 6.8, SEC-40): `express`, `pg`, `bcryptjs`, `cookie-parser`, `helmet`, `zod`, `@vercel/functions`. No other package may be added without a recorded decision.

**Module `src/db/pool.js` exports `createPool({ config, attachDatabasePool })`:**

1. Create one `pg.Pool` at module scope (never per request) with `connectionString` = `config.databaseUrl` (the **pooled** Neon string at runtime), `max` = `config.db.poolMax`, `idleTimeoutMillis` = `config.db.idleTimeoutMs`, `connectionTimeoutMillis` = `config.db.connectionTimeoutMs`, and `statement_timeout` = `config.db.statementTimeoutMs`.
2. **Immediately after creating the pool, in the same module and before any query,** call `attachDatabasePool(pool)` exactly once when `config.runtime.onVercel` is true, then log one info line `db_pool_attached`. Locally and in tests (`onVercel` false) it is not called.
3. Register an `error` listener on the pool that logs only the SQLSTATE or error code, so an idle-client error cannot crash the process or leak details.
4. `src/app.js` is the only production caller of `createPool`, passing the real `attachDatabasePool` imported from `@vercel/functions`. Tests inject a spy. `@vercel/functions` is imported nowhere else (STAT-13).
5. `pool.end()` is called only by scripts and tests.

**Configuration.** Pool settings come only from the validated variables in 5.1: `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT_MS`, `DB_POOL_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`. The minimum `DB_POOL_MAX` is 2 (Vercel advises against a pool of size 1 on Fluid compute); the default is 5; the default idle timeout is 5000 ms, as in the Vercel and Neon examples.

**Connection roles are unchanged.** The pooled Neon string is used by the running app. The direct string is used by migrations, seeding, and tests (they use session-level features and are not routed through the pooler).

**Verification.** UT-14 (attach called once, before first use, only when `onVercel` is true, with the configured settings); DEP-17 (the attach path ran on Vercel and no connection exhaustion appears under load); DEP-18 (concurrent duplicate orders against the pooled endpoint). Any later change in Vercel's guidance is recorded in `docs/STATUS.md`.

## 5. Environment variables

There is no JWT secret. The only secrets are the database connection strings.

### 5.1 Definitions

| Variable | Required | Used by | Validation rule | Default |
|---|---|---|---|---|
| `NODE_ENV` | Yes | App, scripts, tests | One of `development`, `test`, `production`. Local app: `development` (from `.env`). Tests: `test` (from `.env.test`); tests refuse to run unless it equals `test`. Vercel sets `production` | none |
| `PORT` | No | `scripts/dev-server.js` only | Integer 1024 to 65535. Ignored on Vercel | 3000 |
| `VERCEL` | System | Set by Vercel | Never set by hand. Its presence means "running on Vercel"; `loadConfig` exposes it as `runtime.onVercel` (boolean). Only `loadConfig` and `test-db-reset.js` read it (the reset refuses to run when it is set) | unset |
| `DATABASE_URL` | Yes (runtime) | App | Starts with `postgres://` or `postgresql://`; host contains `-pooler` when `NODE_ENV=production`; contains `sslmode=require` | none |
| `DATABASE_URL_UNPOOLED` | Local only | `db:migrate`, `db:seed` | Same scheme rule; host MUST NOT contain `-pooler` | none |
| `TEST_DATABASE_URL` | Test only | Tests and `test:db:reset`, from `.env.test` only | Same scheme rule; host MUST NOT contain `-pooler`; MUST NOT point at the same host and database as `DATABASE_URL` or `DATABASE_URL_UNPOOLED` (compared by host and database name, ignoring credentials and parameters) | none |
| `TEST_DB_DISPOSABLE` | Test only | Tests and `test:db:reset`, from `.env.test` only | MUST equal `yes`. The owner's explicit confirmation that the target is a disposable test branch | none |
| `SESSION_COOKIE_NAME` | No | App | Matches `^[A-Za-z0-9_-]{3,64}$`. When `NODE_ENV=production` it MUST start with `__Host-` | `deskline_session` (development and test) |
| `SESSION_TTL_DAYS` | No | App | Integer 1 to 30 | 7 |
| `BCRYPT_COST` | No | App | Integer 10 to 14. (Tests use 10 for speed) | 12 |
| `STORE_CURRENCY` | Yes | App | MUST equal `INR` in this version. Any other value fails startup | none |
| `SHIPPING_FLAT_MINOR` | Yes | App | Integer 0 to 1000000 (paise) and a multiple of 100 (whole rupees) | none |
| `ORDER_NUMBER_PREFIX` | No | App | 2 to 4 uppercase letters `A-Z` | `DL` |
| `DB_POOL_MAX` | No | App | Integer 2 to 10 (Vercel advises against a pool of 1) | 5 |
| `DB_POOL_IDLE_TIMEOUT_MS` | No | App | Integer 1000 to 60000 | 5000 |
| `DB_POOL_CONNECTION_TIMEOUT_MS` | No | App | Integer 1000 to 30000 | 5000 |
| `DB_STATEMENT_TIMEOUT_MS` | No | App | Integer 1000 to 60000 | 10000 |
| `EXTRA_ALLOWED_ORIGINS` | No | App | Comma-separated list. Each entry MUST be `https://host[:port]` (or `http://localhost[:port]` outside production). Empty allowed | empty |
| `LOG_LEVEL` | No | App | One of `debug`, `info`, `warn`, `error` | `info` |

The per-line quantity cap (10), the cart line limit (50), and the low-stock threshold (5) are constants in `src/config.js`, not environment variables.

### 5.2 `loadConfig(env)` behaviour

1. Reads only the variables above, from the object passed in (default `process.env`). No other file reads `process.env`.
2. Validates every rule in 5.1. On any failure it throws one error listing **each** failing variable name and the rule it broke. It MUST NOT include any variable's value in the message, a log line, or a stack trace.
3. Returns a deeply frozen object with parsed types (integers as numbers, origins as an array, `isProduction` and `runtime.onVercel` booleans, and a `db` group with `poolMax`, `idleTimeoutMs`, `connectionTimeoutMs`, `statementTimeoutMs`) and the constants: `maxQuantityPerLine = 10`, `maxCartLines = 50`, `lowStockThreshold = 5`, `bodyLimitBytes = 20480`.
4. On Vercel, a startup failure must be visible in the function logs as a clear message; the app does not start in a half-configured state.
5. The two test-only variables (`TEST_DATABASE_URL`, `TEST_DB_DISPOSABLE`) are **not** part of the application's configuration. Only the test helpers and `scripts/test-db-reset.js` read them (7.6).

### 5.3 `.env.example` (committed; placeholders only)

```
# Copy to .env and fill in. Never commit .env.
NODE_ENV=development
PORT=3000

# Neon: pooled string for the running app (host contains -pooler)
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require
# Neon: direct string for migrations and seeding (host has no -pooler)
DATABASE_URL_UNPOOLED=postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/DBNAME?sslmode=require
SESSION_COOKIE_NAME=deskline_session
SESSION_TTL_DAYS=7
BCRYPT_COST=12

STORE_CURRENCY=INR
SHIPPING_FLAT_MINOR=9900
ORDER_NUMBER_PREFIX=DL

DB_POOL_MAX=5
DB_POOL_IDLE_TIMEOUT_MS=5000
DB_POOL_CONNECTION_TIMEOUT_MS=5000
DB_STATEMENT_TIMEOUT_MS=10000
EXTRA_ALLOWED_ORIGINS=
LOG_LEVEL=info
```

Requirements: it lists every variable in 5.1 except the two test-only variables (`TEST_DATABASE_URL`, `TEST_DB_DISPOSABLE`), which live in `.env.test.example` (5.3a), and the system variable `VERCEL`; it contains no real host, user, password, or key; use Neon's exact strings (including any `channel_binding` parameter Neon provides). Test STAT-07 checks that the file and `loadConfig` stay in sync.

### 5.3a `.env.test.example` (committed; placeholders only)

Tests and `test:db:reset` load **only** `.env.test`, never `.env`.

```
# Copy to .env.test. Never commit .env.test.
NODE_ENV=test
TEST_DATABASE_URL=postgresql://USER:PASSWORD@TESTHOST.REGION.aws.neon.tech/DBNAME?sslmode=require
TEST_DB_DISPOSABLE=
SESSION_COOKIE_NAME=deskline_session_test
SESSION_TTL_DAYS=7
BCRYPT_COST=10
STORE_CURRENCY=INR
SHIPPING_FLAT_MINOR=9900
ORDER_NUMBER_PREFIX=DL
DB_POOL_MAX=5
LOG_LEVEL=error
```

Rules:
- `.env.test` contains **no `DATABASE_URL` and no `DATABASE_URL_UNPOOLED`**, so a test process cannot reach the development or production database by accident.
- `TEST_DB_DISPOSABLE` is left empty in the example. The owner writes `yes` only after confirming that the Neon branch behind `TEST_DATABASE_URL` is disposable.
- `tests/helpers/config.js` builds the test configuration by calling `loadConfig` with `DATABASE_URL` set from `TEST_DATABASE_URL` (a direct string is allowed because `NODE_ENV` is `test`).
- Node's `--env-file` does not override variables that are already set in the shell. A shell that exports `NODE_ENV=production` therefore makes `assertSafeTestDatabase()` stop the run, which is the safe direction.

### 5.4 Where each value lives

| Location | Variables |
|---|---|
| Local `.env` (git-ignored) | Every variable in 5.1 except `TEST_DATABASE_URL`, `TEST_DB_DISPOSABLE`, and `VERCEL` |
| Local `.env.test` (git-ignored) | `NODE_ENV=test`, `TEST_DATABASE_URL`, `TEST_DB_DISPOSABLE`, and the test settings in 5.3a. Never `DATABASE_URL` |
| Vercel, Production scope | `DATABASE_URL` (main branch, pooled), `SESSION_COOKIE_NAME=__Host-deskline_session`, `SESSION_TTL_DAYS`, `BCRYPT_COST`, `STORE_CURRENCY=INR`, `SHIPPING_FLAT_MINOR`, `ORDER_NUMBER_PREFIX`, `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT_MS`, `DB_POOL_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, `LOG_LEVEL`. `NODE_ENV` and `VERCEL` are set by Vercel |
| Vercel, Preview scope | Same, with `DATABASE_URL` pointing at the **preview** Neon branch **[REC]** so preview traffic never touches production data |
| Never on Vercel | `DATABASE_URL_UNPOOLED`, `TEST_DATABASE_URL`, `TEST_DB_DISPOSABLE` (unless a CI migration step is added later and recorded as a decision) |

### 5.5 Secret handling

- `.gitignore` MUST contain `.env`, `.env.*`, `!.env.example`, and `!.env.test.example`.
- Before the first push the agent searches the working tree and git history for connection strings with passwords and for the real database host name (STAT-04). If a secret was ever committed, rotate the Neon password; deleting the commit is not enough.
- No secret may appear in `public/`, API responses, logs, test fixtures, screenshots, or the README.

## 6. Security specification

Checklist IDs (SEC-nn) are referenced by tests in section 8. Every item MUST be verified before the project is described as done.

### 6.1 Sessions

**Token generation.** `crypto.randomBytes(32)` encoded as base64url (43 characters). Only the SHA-256 digest is stored in `sessions.token_hash` (`bytea`). The raw token exists only in the cookie. (SEC-01)

**Lifetime.** Fixed absolute lifetime of `SESSION_TTL_DAYS` (default 7 days) from creation. No sliding renewal. `expires_at = now() + interval`. A session past `expires_at` is rejected. (SEC-03)

**Cookie.** (SEC-02)

| Attribute | Value |
|---|---|
| Name | `SESSION_COOKIE_NAME` (production: `__Host-deskline_session`) |
| `HttpOnly` | Always |
| `Secure` | When `NODE_ENV=production` (the `__Host-` prefix requires it) |
| `SameSite` | `Lax` |
| `Path` | `/` |
| `Domain` | Not set (host-only; required by the `__Host-` prefix) |
| `Max-Age` | `SESSION_TTL_DAYS * 86400` seconds |
| Value | The raw token |

**Session loader middleware** (mounted on `/api` only):
1. Read the cookie by name. If absent, `req.user = null` and no database query is made.
2. If the value does not match `^[A-Za-z0-9_-]{43}$`, treat it as invalid: clear the cookie, `req.user = null`.
3. Compute the SHA-256 digest and run one query joining `sessions` and `users` on `token_hash = $1 AND expires_at > now()`, selecting only the session id and the user's `id`, `name`, `email`.
4. If a row exists: `req.user = { id, name, email }`, `req.sessionId = id`. Otherwise clear the cookie and set `req.user = null`.
5. A database error is a 503 (fail closed). `req.user` is set nowhere else.

**`requireAuth`** returns 401 `UNAUTHENTICATED` (with `Cache-Control: no-store`) when `req.user` is null.

**Creation (register and login).**
1. In one transaction: delete the session presented with the request (if any); delete the user's expired sessions (SEC-06); insert the new session; delete the user's oldest sessions beyond 10 **[REC]** so sessions per user stay bounded.
2. Set the cookie with the new raw token (SEC-04: a new token on every login and register, so no session fixation).

**Logout.** Delete the session row matching the cookie (if any) and clear the cookie using the same attributes with `Max-Age=0`. Always respond 204. The old token MUST be rejected afterwards (SEC-05).

**Cleanup.** Expired rows are removed (a) for the user at each login or register, and (b) globally by the seed script (`DELETE FROM sessions WHERE expires_at < now() - interval '1 day'`). No scheduled job is required. (SEC-06)

**Never** put a session token in a URL, a JSON body, a log line, or an error. (SEC-07)

### 6.2 Passwords and authentication protections

| ID | Requirement |
|---|---|
| SEC-08 | Hash with `bcryptjs` at `BCRYPT_COST` using the asynchronous API (library-generated salt). Passwords are never stored, logged, or returned |
| SEC-09 | Reject passwords over 72 UTF-8 bytes (never truncate). Minimum 8 characters. Reject a password equal to the email |
| SEC-10 | When a `login_fail` slot has been granted (6.5), a login with an unknown email still runs one bcrypt comparison against a fixed dummy hash, so timing does not reveal whether an email exists. A blocked attempt (429) runs no bcrypt for known and unknown emails alike, because blocking depends only on the normalised email and the client address, never on whether the account exists |
| SEC-11 | Services select explicit column lists. `password_hash` never appears in any response, log, or error. No `SELECT *` on `users` |
| SEC-12 | Login failure responses are identical for an unknown email and a wrong password (same status, body, headers) |
| SEC-12a | Registration reveals "email already exists" (an accepted, documented trade-off, because the design requires a clear message). It is rate limited (6.5) |

### 6.3 Origin and CSRF protection (exact algorithm)

Mounted on **every** POST, PUT, PATCH, and DELETE under `/api`, before body parsing. (SEC-13)

1. Compute `own` = `${req.protocol}://${req.get('host')}` (`req.protocol` honours `trust proxy`).
2. If an `Origin` header is present: allow only if it equals `own` or is listed in `EXTRA_ALLOWED_ORIGINS`. Otherwise respond 403 `FORBIDDEN_ORIGIN`. The literal value `null` is rejected.
3. If `Origin` is absent: read `Sec-Fetch-Site`. Allow only `same-origin` or `none`. Any other value is rejected with 403.
4. If both headers are absent: reject with 403 when `NODE_ENV=production`; in `development` and `test` allow it. (Tests that exercise production behaviour use a production-mode config and send the headers explicitly.)
5. Requests with a body MUST then pass the content-type check: `application/json` only, otherwise 415 (SEC-14). Cross-site HTML forms cannot send that content type without a preflight, which the API never grants because no CORS headers are sent.

Supporting rules:
- No CORS middleware and no `Access-Control-*` headers on any response (SEC-15). `OPTIONS` requests get 405 or a plain 204 with no CORS headers.
- State-changing routes are never GET. `SameSite=Lax` on the cookie is the second layer.
- `app.disable('x-powered-by')`; `app.set('trust proxy', 1)`. Verify on Vercel what `req.ip` and `req.protocol` contain (DEP-12). (SEC-16)
- Every body and query value passes a `zod` strict schema before reaching a service. Services never receive raw `req.body`. (SEC-17)

### 6.4 SQL and data access

| ID | Requirement |
|---|---|
| SEC-18 | All SQL is parameterised (`$1`...). No string building from request data, including ORDER BY and LIMIT (sort uses an allow-list map; page and limit are validated integers passed as parameters) |
| SEC-19 | LIKE wildcards in search terms (percent, underscore, and the escape character) are escaped, with an explicit `ESCAPE` clause |
| SEC-20 | Only `is_active` products are reachable through product endpoints and order creation |
| SEC-21 | Every order read includes `user_id = <session user>`. A foreign, unknown, or malformed order ID returns the same 404 |
| SEC-22 | Order creation takes the user from the session only, and names, prices, totals, and stock from locked database rows. Request schemas reject `userId`, `priceMinor`, `totalMinor`, `unitPriceMinor`, `subtotalMinor`, `shippingMinor`, and the legacy names ending in `Cents` |
| SEC-23 | Order creation follows 4A.1: one transaction at READ COMMITTED; a transaction-scoped advisory lock on (user, idempotency key) before the idempotency lookup; `SELECT ... FOR UPDATE` on products ordered by id; the `stock_quantity >= qty` guard on every update; rollback on any error |
| SEC-24 | Only the SQLSTATE `code` and the `constraint` name of database errors are read. The `detail`, `parameters`, and `where` properties (which can contain emails and values) are never logged or returned |

### 6.5 Rate limiting (database-backed, fixed windows)

The `rate_limits` table stores `bucket`, `key_hash` (SHA-256 of `bucket:value`), `window_start`, and `hits`. Raw emails and IPs are never stored. (SEC-26)

| Bucket | Key | Limit | Window | Counts |
|---|---|---|---|---|
| `login_fail` | email (normalised) + client IP | 5 | 15 minutes | Failed password checks. A slot is reserved atomically **before** verification and released if the password is correct (see below) |
| `login_ip` | client IP | 30 | 15 minutes | Every login attempt |
| `register_ip` | client IP | 10 | 60 minutes | Every registration attempt |
| `orders_user` | user id | 10 | 60 minutes | Every order-creation attempt |
| `cart_ip` | client IP | 120 | 10 minutes | Every `POST /api/cart/validate` |

**Window behaviour.** `window_start` = the current time rounded down to a multiple of the window length (computed in SQL so all instances agree). One statement increments and reads the counter: `INSERT ... (bucket, key_hash, window_start) VALUES ... ON CONFLICT (bucket, key_hash, window_start) DO UPDATE SET hits = rate_limits.hits + 1 RETURNING hits`. (SEC-25)

**Decision rules.**

Every bucket uses single-statement atomic counters. No bucket ever reads a count and writes it back later.

- **`login_ip`, `register_ip`, `orders_user`, `cart_ip`** (they count every attempt): run the upsert from SEC-25 with `RETURNING hits, window_start`. PostgreSQL serialises concurrent upserts of the same row, so each request gets a distinct `hits` value. If `hits` is above the limit, respond 429. Blocked attempts remain counted, because they are attempts.
- **`login_fail` uses atomic reserve, then settle.** After `login_ip` has allowed the request:
  1. **Reserve.** Run the same atomic upsert for the `login_fail` key (normalised email plus client IP). It returns `hits` and `window_start`.
  2. **Blocked.** If `hits` is above 5, release the reservation at once (`UPDATE rate_limits SET hits = GREATEST(hits - 1, 0)` for exactly that `(bucket, key_hash, window_start)`), respond 429 with `Retry-After`, and run **no password check and no bcrypt**.
  3. **Verify.** If `hits` is 5 or less, this request holds one of at most five slots for this key and window. Look up the user and run bcrypt (against the dummy hash when the email is unknown).
  4. **Wrong password or unknown email.** The slot stays consumed; this is the failed check. Respond 401.
  5. **Correct password.** Release the slot with the same decrement statement (using the `window_start` captured in step 1), then create the session. If the release fails, the login still proceeds and the failure is logged (code `RATE_LIMIT_RELEASE_FAILED`); the counter is then one too high, which is the safe direction.
  6. **Database error at any step before verification:** respond 503 (fail closed).

**Policy, unchanged.** Five failed password checks are allowed for one normalised email and client IP within a window. Further attempts are blocked, even when the password would be correct. An unknown-email attempt performs the dummy bcrypt comparison whenever it is permitted to run. A successful login is not counted as a failure. The limiter is database-backed and fails closed.

**Why it cannot be bypassed in parallel.** A password check can only start after a slot has been reserved, and slots are handed out by an atomic counter. A slot is returned only when the check succeeded. Therefore the number of failed checks in a window can never exceed five, however many requests arrive at the same moment, and at most five bcrypt operations are in flight for one key.

**Explicit concurrency refinement (not a silent policy change).** The counter equals *failed checks plus checks currently in flight*. If more than five attempts for the same email and address arrive in the same instant, the extra ones receive 429 even if their password would have been correct, because five slots are already held by attempts whose outcome is not yet known. Sequential behaviour is exactly the policy above. A person cannot reach this case in practice, and the alternative (letting every parallel attempt verify) would allow the bypass this section exists to prevent.

**Locking strategy.** No explicit transaction and no row lock is held while bcrypt runs. The only lock is the row lock taken inside the single-statement upsert or update; it is held for microseconds and ends with the statement. No pooled connection is occupied during the roughly 100 to 300 ms hash. Alternatives rejected: read-then-increment (racy); `SELECT ... FOR UPDATE` held across the bcrypt call (correct, but it holds a pooled connection and a row lock for the whole hash, so a burst of attempts on one key could exhaust the pool); in-memory counters (not shared across serverless instances).

**Window roll-over.** The release uses the `window_start` captured at reservation. If the window changes while a check runs, the release adjusts the old window's row and the new window starts with a fresh counter.

**Cleanup.** Rows with `window_start` older than 2 days are deleted opportunistically by the limiter, at most once per instance per hour, and by the seed script. (SEC-27)

### 6.6 Security headers (two places, because static files bypass Express on Vercel)

| ID | Requirement |
|---|---|
| SEC-29 | Express: `helmet()` defaults on all API responses, plus the `Cache-Control` rules in contract 4.1 |
| SEC-30 | `vercel.json` `headers` for every static path (exact values in section 9.1): CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security` (no `preload`) |
| SEC-31 | The CSP is `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`. Consequence: **no inline scripts, no inline event handlers, no `style` attributes in HTML, no third-party origins.** JavaScript may style through the CSSOM (`element.style.setProperty`). Fonts, icons, and scripts are self-hosted |
| SEC-32 | Static cache rules: fonts `public, max-age=31536000, immutable`; css, js, images, icons `public, max-age=86400, stale-while-revalidate=604800`; HTML uses Vercel's default revalidating behaviour (verified in DEP-07) |

### 6.7 Frontend rules that protect the backend

| ID | Requirement |
|---|---|
| SEC-33 | API and user-provided text is inserted with `textContent` or `createElement`. `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, and `new Function` are forbidden (STAT-01) |
| SEC-34 | The cart in `localStorage` (key `deskline.cart.v1`) holds only `{productId, quantity}` pairs, is parsed defensively (wrong shape resets to empty), and is never trusted for price or name |
| SEC-35 | No password, session token, or secret is written to `localStorage`, `sessionStorage`, a JavaScript-set cookie, or the DOM. The only storage keys allowed are `deskline.cart.v1` and the one-time confirmation marker |
| SEC-36 | The `next` redirect parameter is accepted only if it is a string that starts with a single `/`, does not start with `//`, contains no backslash and no control character, has no colon before the first slash, and resolves to a known page path. Otherwise go to `/`. One shared function (`public/js/safe-redirect.js`) is used everywhere |
| SEC-37 | Links with `target="_blank"` carry `rel="noopener noreferrer"` |

### 6.8 Errors, logging, dependencies, secrets

| ID | Requirement |
|---|---|
| SEC-38 | A final error handler returns the envelope in contract 4.2 with generic messages for 500 and 503. No stack, SQL, or constraint name leaves the server. Express never renders its own error page |
| SEC-39 | JSON logs contain request id, method, path (no query string), status, duration, user id when known, and error code. They never contain headers, cookies, bodies, passwords, tokens, or connection strings |
| SEC-40 | `npm audit --omit=dev` shows no high or critical findings at submission, or each is documented with a reason. `package-lock.json` is committed. The production dependency allowlist is exactly seven packages: `express`, `pg`, `bcryptjs`, `cookie-parser`, `helmet`, `zod`, `@vercel/functions` (4A.3). There are no development dependencies. Font packages are used only to obtain font files and are not retained (7.9). Versions are checked with `npm view` at implementation time |
| SEC-41 | No secret exists in git history, `public/`, fixtures, the README, or screenshots |
| SEC-42 | Orders store a name, phone, and address. The README and checkout page say to enter fictional data only |
| SEC-43 | `bigint` and `numeric` values are never parsed globally. Money and count fields are converted only at the response boundary with `toSafeMinor` and `toSafeCount`, validated as non-negative safe integers, and sent as JSON numbers (4A.2) |
| SEC-44 | The login-failure limiter reserves a slot atomically before password verification and releases it only on success, so parallel requests cannot exceed five failed checks per key and window (6.5) |
| SEC-45 | Order creation serialises by (user, idempotency key) with a transaction-scoped advisory lock taken before any stock check; the lock order is advisory lock, then products by ascending id (4A.1) |
| SEC-46 | The database pool is created once at module scope with validated settings and attached with `attachDatabasePool` on Vercel; the pooled string is used at runtime, the direct string for migrations and tests (4A.3) |
| SEC-47 | A test run cannot touch the development or production database: tests load only `.env.test` (which has no `DATABASE_URL`), and `assertSafeTestDatabase()` enforces the conditions in 7.6 |

## 7. Database setup, scripts, seeding, and local development

### 7.1 One-time Neon setup (done by the project owner, not the agent)

1. Create a Neon project and database. Create branches `main`, `preview`, `dev`, `test`.
2. For each branch copy two strings from the Connect panel: pooled (host contains `-pooler`) and direct. Keep Neon's TLS parameters.
3. Production `DATABASE_URL` (Vercel, Production scope) = `main`, pooled. Preview scope = `preview`, pooled. Local `.env`: `dev` strings for `DATABASE_URL` and `DATABASE_URL_UNPOOLED`; `TEST_DATABASE_URL` = `test`, direct.
4. Never paste a connection string into chat, an issue, or a commit.

### 7.2 npm scripts (names and commands are part of the contract)

| Script | Command |
|---|---|
| `dev` | `node --env-file=.env --watch scripts/dev-server.js` |
| `db:migrate` | `node --env-file=.env scripts/migrate.js` |
| `db:seed` | `node --env-file=.env scripts/seed.js` |
| `db:setup` | `npm run db:migrate && npm run db:seed` |
| `test:db:reset` | `node --env-file=.env.test scripts/test-db-reset.js` |
| `test:unit` | `node --env-file=.env.test --test --test-reporter=spec "tests/unit/**/*.test.js"` |
| `test` | `npm run test:db:reset && node --env-file=.env.test --test --test-concurrency=1 --test-reporter=spec "tests/**/*.test.js"` |
| `audit` | `npm audit --omit=dev` |

In `package.json` the double quotes around the glob patterns are written as escaped quotes inside the JSON string.

**Cross-platform rules (Windows PowerShell, cmd.exe, and POSIX shells):**
- No inline environment assignment (`NODE_ENV=test node ...` fails on Windows). All environment comes from `--env-file`.
- No POSIX-only commands in scripts (`cp`, `rm`, `export`, `;`, background `&`). The only chaining operator is `&&`, which npm's default shell on Windows and POSIX both support.
- No single-quoted strings. The test globs are double-quoted so the shell leaves them alone and **Node expands them** (the Node 22 test runner expands glob patterns itself). Test MAN-25 verifies this on Windows and on a POSIX shell.
- No extra dependency such as `cross-env` (dependency allowlist, SEC-40).
- `scripts/migrate.js` and `scripts/seed.js` also export `runMigrations(connectionString)` and `runSeed(connectionString, options)` so `test-db-reset.js` can run them against the test database; when executed directly they read `DATABASE_URL_UNPOOLED`.
- `package.json` sets `"type": "module"` and `"engines": { "node": "22.x" }` and has no `devDependencies`.
- There is **no script that resets, drops, or truncates the main database**.

**Which environment each command uses:**

| Commands | File loaded | `NODE_ENV` | Databases reachable |
|---|---|---|---|
| `dev`, `db:migrate`, `db:seed`, `db:setup` | `.env` | `development` | The development database (pooled string for the app, direct string for the scripts) |
| `test`, `test:unit`, `test:db:reset` | `.env.test` | `test` | Only `TEST_DATABASE_URL` |
| Vercel runtime | Platform variables | `production` (set by Vercel) | The pooled `DATABASE_URL` for that scope |

### 7.3 Migration runner (`scripts/migrate.js`)

- Reads `DATABASE_URL_UNPOOLED`. Refuses to run (exit 1, clear message) if the host contains `-pooler`.
- Prints the target as `host/dbname` only, never user or password.
- Creates `schema_migrations(filename text primary key, checksum text not null, applied_at timestamptz not null default now())` if missing, then takes a session advisory lock so two runs cannot overlap.
- Applies unapplied `db/migrations/*.sql` files in filename order. Each file runs in its own transaction together with its `schema_migrations` row.
- If an applied file's checksum differs from the file on disk it aborts with an error. Applied migrations are never edited; changes go in a new numbered file.
- Running it twice is a no-op.

### 7.4 Seed script (`scripts/seed.js`, data in `db/seeds/catalog.js`)

- Reads `DATABASE_URL_UNPOOLED`, prints the target, and works in one transaction.
- Upserts categories by `slug`. Upserts products by `slug`, updating name, summary, description, specs, `price_minor`, category, `is_active`, and `featured_rank`. **On first insert it sets `stock_quantity`; on later runs it does not overwrite stock** unless run with `--reset-stock --yes`.
- Replaces the `product_images` rows of the seeded products (delete, then insert, inside the transaction).
- Validates every product before writing: `price_minor` is a positive integer and a multiple of 100; slugs match the slug pattern; image URLs are paths under `/images/`. Any violation aborts the whole seed.
- Never touches `users`, `sessions`, `orders`, `order_items`, or `rate_limits`. Never deletes products missing from the file (retire a product by setting `is_active` to false).
- Ends by deleting sessions expired more than a day ago and rate-limit windows older than 2 days, then printing counts (categories, active products, out-of-stock products).
- Copy rules: names, summaries, descriptions, and specs are original, plausible, and fictional. No real brand names and no unverifiable claims (no certifications, no measured-sounding performance numbers). Each product has a `summary` of 160 characters or fewer, a `description` of two or three plain sentences, and three to five specs (`{label, value}`).
- Each product references `/images/products/<slug>-1.webp` at 800 by 1000 with specific alt text (featured products also get `-2` and `-3`). The seed does not create image files; the frontend falls back to the category placeholder.

### 7.5 Seed catalogue (INR; `price_minor` is paise, always a multiple of 100)

| Category slug | Category name |
|---|---|
| `desk-mats` | Desk mats |
| `charging-cables` | Charging & cables |
| `stands-risers` | Stands & risers |
| `lighting` | Lighting |
| `organizers` | Organizers |

| # | Slug | Name | Category | Price (₹) | `price_minor` | Stock | Featured | Purpose |
|---|---|---|---|---|---|---|---|---|
| 1 | `felt-desk-mat-charcoal` | Felt desk mat, charcoal | desk-mats | 1,499 | 149900 | 40 | 1 | Featured |
| 2 | `felt-desk-mat-moss` | Felt desk mat, moss | desk-mats | 1,499 | 149900 | 3 | | Low stock |
| 3 | `leather-look-desk-pad` | Leather-look desk pad | desk-mats | 1,999 | 199900 | 25 | | |
| 4 | `wireless-charging-desk-mat` | Wireless charging desk mat | desk-mats | 2,999 | 299900 | 0 | | Out of stock |
| 5 | `braided-usb-c-cable-1m` | Braided USB-C cable, 1 m | charging-cables | 499 | 49900 | 120 | | |
| 6 | `braided-usb-c-cable-2m` | Braided USB-C cable, 2 m | charging-cables | 649 | 64900 | 80 | | |
| 7 | `gan-charger-65w` | 65 W GaN charger, 3 ports | charging-cables | 1,899 | 189900 | 30 | | |
| 8 | `cable-clips-set-of-6` | Cable clips, set of 6 | charging-cables | 249 | 24900 | 200 | | |
| 9 | `aluminium-laptop-stand` | Aluminium laptop stand | stands-risers | 2,499 | 249900 | 35 | 2 | Featured |
| 10 | `monitor-riser-with-drawer` | Monitor riser with drawer | stands-risers | 2,799 | 279900 | 18 | | |
| 11 | `vertical-laptop-dock` | Vertical laptop dock | stands-risers | 1,799 | 179900 | 22 | | |
| 12 | `adjustable-phone-stand` | Adjustable phone stand | stands-risers | 699 | 69900 | 60 | | |
| 13 | `led-desk-lamp-dimmable` | LED desk lamp, dimmable | lighting | 2,299 | 229900 | 28 | 3 | Featured |
| 14 | `monitor-light-bar` | Monitor light bar | lighting | 2,999 | 299900 | 15 | | Homepage spotlight |
| 15 | `clip-on-reading-lamp` | Clip-on reading lamp | lighting | 1,299 | 129900 | 5 | | Low-stock boundary |
| 16 | `ultra-slim-monitor-light-bar-with-asymmetric-glare-free-optics-and-wireless-dial` | Ultra-slim monitor light bar with asymmetric glare-free optics and wireless dial | lighting | 3,999 | 399900 | 12 | | Long name |
| 17 | `walnut-desk-tray` | Walnut desk tray | organizers | 1,999 | 199900 | 20 | 4 | Featured |
| 18 | `stackable-drawer-organizer` | Stackable drawer organizer | organizers | 1,599 | 159900 | 26 | | |
| 19 | `steel-pen-and-tool-cup` | Pen and tool cup, powder-coated steel | organizers | 799 | 79900 | 70 | | |
| 20 | `large-cable-box` | Cable box, large | organizers | 999 | 99900 | 45 | | |
| 21 | `archived-basic-mouse-pad` | Basic mouse pad | desk-mats | 399 | 39900 | 10 | | **Inactive** (`is_active = false`) |

Expected after seeding: 5 categories; 21 products, of which 20 active; `desk-mats` `productCount` 4 (the inactive product is not counted); exactly one active product with stock 0; exactly two active products with stock from 1 to 5 (#2 and #15); the four featured ranks 1 to 4.

### 7.6 Test configuration and test-database isolation

**Test configuration.** `npm test`, `npm run test:unit`, and `npm run test:db:reset` load only `.env.test` (5.3a). That gives `NODE_ENV=test`, bcrypt cost 10, quiet logs, and exactly one database variable, `TEST_DATABASE_URL`. `tests/helpers/config.js` builds the test configuration with `loadConfig`, setting `DATABASE_URL` from `TEST_DATABASE_URL`. Production-mode integration tests use `withProductionBehaviour(config)`, which flips only `isProduction`, the cookie name, and `Secure`, and leaves the database settings alone.

**`assertSafeTestDatabase()`** (in `tests/helpers/db.js`, with the same checks at the top of `scripts/test-db-reset.js`). Every condition MUST hold, otherwise the process exits with code 1 **before connecting**:

1. `NODE_ENV` equals `test`.
2. `TEST_DATABASE_URL` is set, uses the `postgres://` or `postgresql://` scheme, and its host does not contain `-pooler`.
3. `TEST_DB_DISPOSABLE` equals `yes`.
4. If `DATABASE_URL` or `DATABASE_URL_UNPOOLED` exist in the process environment (for example exported globally in the shell), the test target's **host and database name** differ from both. The comparison ignores user, password, and query parameters.
5. The `VERCEL` environment variable is not set.
6. It prints the target as `host/dbname` (never credentials).

**`scripts/test-db-reset.js`** runs those checks, then drops and recreates the `public` schema, runs all migrations (`runMigrations`), and runs the seed (`runSeed`) against `TEST_DATABASE_URL`. It never reads `DATABASE_URL` for any purpose other than the comparison in condition 4.

**Per-file hygiene.** Every test file's `before` hook calls `assertSafeTestDatabase()`, then truncates `users, sessions, orders, order_items, rate_limits` with `RESTART IDENTITY CASCADE`, restarts `order_number_seq` at 100001, and restores the seeded stock levels. No test depends on rows left by another test. Tests connect directly (not pooled) because they use session-level features.

### 7.7 Safe workflow

1. `npm run db:setup` against `dev`; confirm the expected counts in 7.5.
2. `npm test` against the `test` branch.
3. Only after both succeed, the owner runs `db:migrate` and `db:seed` against `main` from a trusted machine. Both are additive and non-destructive, so repeating them is safe.
4. To undo a bad change to `main`, use Neon branch restore in the Neon console. The application contains no destructive command for production.

### 7.8 Exact local setup instructions

```
git clone <REPO_URL> CodeAlpha_EcommerceStore
cd CodeAlpha_EcommerceStore
node --version            # expect v22.x
npm ci
cp .env.example .env              # PowerShell: Copy-Item .env.example .env
cp .env.test.example .env.test    # PowerShell: Copy-Item .env.test.example .env.test
# Edit .env: DATABASE_URL (pooled), DATABASE_URL_UNPOOLED (direct), keep STORE_CURRENCY=INR.
# Edit .env.test: TEST_DATABASE_URL (direct, test branch). Write TEST_DB_DISPOSABLE=yes
#                 only after confirming that branch is disposable.
npm run db:setup
npm run dev               # open http://localhost:3000
npm test
npm run audit
```

(In cmd.exe use `copy` instead of `cp`.)

**Expected results (to be observed, not assumed):**
- `npm ci` finishes without errors and creates `node_modules`.
- `npm run db:setup` prints the target as `host/dbname`, reports `001_init.sql` applied (or "nothing to apply" on a repeat), and prints the seed counts from 7.5.
- `npm run dev` prints the listening port. `GET http://localhost:3000/api/health?deep=1` returns `{"status":"ok","database":"up"}`. `GET http://localhost:3000/shop` serves the shop page.
- `npm test` first prints the test target, then ends with every test reported as passing and exit code 0. A refusal from `assertSafeTestDatabase()` is a configuration problem to fix, not something to bypass. Anything else is a failure to be fixed and recorded, not skipped.

### 7.9 Font asset workflow (fonts are files in the repository, not dependencies)

The design specification says to obtain Bricolage Grotesque and Geist through npm. That is a **one-time acquisition step**. The font packages are **not** application dependencies and MUST NOT remain in `package.json` or `package-lock.json`. What stays in the repository is the self-hosted font files, their licences and credits, and the verification evidence.

1. **Acquire in a scratch folder outside the repository** (preferred), for example: `mkdir font-tmp`, `cd font-tmp`, `npm init -y`, `npm install @fontsource-variable/bricolage-grotesque @fontsource-variable/geist`. (Inside the repository, `npm install --no-save ...` also leaves `package.json` untouched; the scratch folder is cleaner.) Note the exact installed versions.
2. **Copy** the latin and latin-ext `wght` WOFF2 files of each family into `public/fonts/`. File names are whatever the packages ship (verify them; do not guess). Do not copy other subsets or axes.
3. **Copy each package's licence text** (SIL Open Font License 1.1 in both packages, to be confirmed from the package's own licence file) into `public/fonts/`, for example `OFL-bricolage-grotesque.txt` and `OFL-geist.txt`. Do not write licence text from memory.
4. **Write `public/fonts/README.md`:** for each family the source package name, exact version, source URL, licence name and licence file, subsets kept, axes kept, the file names, the date acquired, and the SHA-256 of each file.
5. **Write `public/css/fonts.css`** with `@font-face` rules that use only `/fonts/...` URLs, `font-display: swap`, and the right `unicode-range` for each subset.
6. **Verify the rupee sign** (U+20B9) in both families at every weight in use (test MAN-20). Save `docs/evidence/MAN-20-<date>.png` and record which file (latin or latin-ext) supplies the glyph. If a family lacks it, apply design decision UD-04.
7. **Remove the scratch folder** (`rmdir /s /q font-tmp` in cmd.exe, `Remove-Item -Recurse -Force font-tmp` in PowerShell, `rm -r font-tmp` on POSIX) and, if you installed inside the repository, run `npm ci` to restore a clean `node_modules`. Confirm that neither `package.json` nor `package-lock.json` mentions a font package (STAT-05, STAT-14).

**Retained in the repository:** the `.woff2` files, the licence files, `public/fonts/README.md`, `public/css/fonts.css`, the font credits line in the main `README.md`, and the MAN-20 evidence. **Not retained:** any font package. If the owner ever decides to keep a font package as a real dependency, that is a recorded decision in the reconciliation file and a change to the allowlist in SEC-40 and STAT-05; the default is not to.

## 8. Testing plan

### 8.1 Framework and layout

- Node's built-in `node:test` and `assert/strict`, with `fetch` against an in-process server (`createApp({ config, logSink })` served on port 0). No extra test dependency.
- A tiny cookie-jar helper in `tests/helpers/server.js` keeps `Set-Cookie` values between requests and lets a test send explicit `Origin` and `X-Forwarded-For` headers.
- Test files run one at a time (`--test-concurrency=1`) because they share a database. Parallelism inside a file is used only where the test is about concurrency (CON-xx).
- Fault injection uses a temporary database trigger (created and dropped by the test) that raises on a chosen table, so the test proves real rollback behaviour. Log assertions use the injected `logSink`.
- Time-dependent behaviour (session expiry, rate-limit windows) is tested by editing timestamps in the database, never by sleeping.
- **Test configuration:** `tests/helpers/config.js` exports `loadTestConfig()` and `withProductionBehaviour(config)` as described in 7.6. The application's own production rules (pooled host, `__Host-` cookie name) are proved by UT-11; integration tests that need production behaviour use `withProductionBehaviour`.
- **Concurrency tests are probabilistic detectors, not proofs.** Each one repeats its scenario for several rounds (10 where stated) with fresh users and fresh email and IP keys per round. The guarantees come from the locking designs in 4A.1 and 6.5; a failure in any round fails the test.
- **Rate limits stay on in tests.** Tests avoid interference by creating a fresh user and a unique `X-Forwarded-For` value per scenario. The `orders_user` bucket allows 10 attempts per user per hour, so a scenario that needs more attempts uses more users.

### 8.2 Unit tests (`tests/unit/`, no database)

| ID | Subject | Must verify |
|---|---|---|
| UT-01 | `lib/money.js` | Integer-only arithmetic; rejects floats, negatives, NaN, unsafe integers; line total, subtotal, shipping, total for known inputs; whole-rupee check for config |
| UT-02 | `lib/passwords.js` | Hash differs from input and from a second hash of the same input; verify true/false; cost taken from config; 73-byte (including multi-byte) password rejected; dummy-hash path exists |
| UT-03 | `lib/tokens.js` | 43-character base64url tokens; 1,000 tokens all unique; digest is deterministic SHA-256 of the token |
| UT-04 | `validators/auth.js` | Email trimmed and lower-cased; invalid emails rejected; name rules; password rules (7 characters fails, 8 passes, 72 bytes passes, 73 fails, equals email fails); unknown fields rejected |
| UT-05 | `validators/products.js` | Defaults; bounds (`limit` 1 to 48, `page` 1 to 10000); enum for `sort`; slug pattern; repeated query parameter rejected; empty search treated as absent; search over 80 characters rejected |
| UT-06 | `validators/orders.js` | Strict schema rejects `priceMinor`, `totalMinor`, `userId`, `confirmPassword` and legacy `*Cents`; duplicate product lines merged then re-capped at 10; quantity 0, -1, 11, 1.5, "2", null rejected; phone normalisation and 10 to 15 digit rule; postal code rule; empty `addressLine2` becomes null; 51 lines rejected |
| UT-07 | `lib/escapeLike.js` | Percent, underscore, and the escape character escaped; normal text unchanged |
| UT-08 | `lib/orderNumber.js` | Output matches `^[A-Z]{2,4}-[0-9]{6,}$` |
| UT-09 | Request hash | Same logical request gives the same hash regardless of item order or key order; any quantity or address change changes it |
| UT-10 | `public/js/safe-redirect.js` | Accepts `/cart`, `/checkout`; rejects `//evil.com`, `https://evil.com`, `/\evil`, `javascript:alert(1)`, paths with control characters, unknown paths, non-strings |
| UT-11 | `config.loadConfig` | Fails on each missing or invalid variable, lists all failures, never prints values; `STORE_CURRENCY` other than `INR` fails; `SHIPPING_FLAT_MINOR` of 9950 fails; production requires a `__Host-` cookie name and a pooled `DATABASE_URL`; with `NODE_ENV=test` a direct URL and the default cookie name are accepted; pool variables outside their ranges fail (`DB_POOL_MAX` 1 fails, 2 passes); `VERCEL` set gives `runtime.onVercel` true and unset gives false |
| UT-12 | `public/js/cart-store.js` (with injected storage) | Corrupt JSON gives an empty cart; wrong shapes and non-integer values dropped; quantities clamped to 1 to 10; adding the same product increments; at most 50 lines; only the key `deskline.cart.v1` is used |
| UT-13 | `lib/numbers.js` | `toSafeMinor` and `toSafeCount` accept `0`, the string `0`, `549700`, the string `549700`, and the string `9007199254740991`; reject negative numbers and strings, `1.5`, the strings `1.5`, `1e3`, ` 12`, `012`, the empty string, `null`, `undefined`, `NaN`, `Infinity`, the string and number `9007199254740992`, booleans, and objects; thrown errors carry the codes `INVALID_MONEY_VALUE` and `INVALID_COUNT_VALUE`, and the message names the field but never contains the offending value |
| UT-14 | `db/pool.js` | With `onVercel: true` and an injected spy, `attachDatabasePool` is called exactly once, with the created pool, after construction and before any query or `connect` call, and one `db_pool_attached` info line is logged; with `onVercel: false` it is never called; the pool receives `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, and `statement_timeout` equal to the config values; an `error` event on the pool is logged with a code only and does not throw |

### 8.3 Database tests (`tests/db/`, real PostgreSQL)

| ID | Must verify |
|---|---|
| DB-01 | Migrations apply to an empty database; a second run is a no-op; changing an applied file's checksum makes the runner abort |
| DB-02 | Constraint behaviour (each as an attempted bad insert that must fail): email not lower-case; duplicate email; product `price_minor` of 0, negative, or 150 (not a multiple of 100); negative stock; bad slug; `featured_rank` 0; order whose total differs from subtotal plus shipping; `currency` other than `INR`; bad phone; order item whose line total differs from price times quantity; quantity 0 or 101; duplicate `(order_id, product_id)`; duplicate `(user_id, idempotency_key)`; image URL outside `/images/` |
| DB-03 | Foreign keys: deleting a product that has order items fails; deleting a user that has orders fails; deleting a user cascades to sessions; deleting an order cascades to its items |
| DB-04 | The named indexes from the schema exist (`users_email_key`, `sessions_token_hash_key`, `products_category_idx`, `products_newest_idx`, `products_price_idx`, `products_featured_idx`, `orders_user_created_idx`, `order_items_product_idx`, `rate_limits_window_idx`) |
| DB-05 | After seeding: counts match 7.5 (5, 21, 20 active), one out-of-stock, two low-stock, long-name product present, inactive product present, featured ranks 1 to 4 |
| DB-06 | Running the seed twice gives identical counts; stock changed between runs is not overwritten; `--reset-stock` without `--yes` refuses |
| DB-07 | Every seeded `price_minor` is an integer, greater than 0, and a multiple of 100 |
| DB-08 | `updated_at` changes when a user or product row is updated |
| DB-09 | Persistence: after order creation, a **separate** database connection reads the order and its items; a forced failure leaves no order and no stock change |
| DB-10 | Order numbers from the sequence are unique under 20 parallel calls |
| DB-11 | `assertSafeTestDatabase()` and `test-db-reset.js` exit 1 without connecting or changing anything when: `NODE_ENV` is not `test`; `TEST_DATABASE_URL` is missing; its host contains `-pooler`; `TEST_DB_DISPOSABLE` is missing or not `yes`; the target has the same host and database name as `DATABASE_URL` or as `DATABASE_URL_UNPOOLED` (including when only credentials or query parameters differ); or `VERCEL` is set |
| DB-12 | Idempotency backstop: two direct inserts of orders with the same `(user_id, idempotency_key)` make the second fail with SQLSTATE `23505` on `orders_idempotency_key`; the same key for two different users succeeds; `SELECT hashtextextended('x', 0)` and a transaction-scoped `pg_advisory_xact_lock` call run successfully on the target PostgreSQL version |
| DB-13 | No global parser changes: through the application pool, `SELECT 1::bigint AS n` returns the **string** `1`, `SELECT 1::numeric AS n` returns a **string**, and `SELECT 1::integer AS n` returns the **number** 1 (proves that `bigint` and `numeric` are not parsed globally) |

### 8.4 API tests (`tests/api/`)

**Health, categories, products**

| ID | Must verify |
|---|---|
| API-01 | `GET /api/health` returns 200 `{status: 'ok'}` with no version or environment data |
| API-02 | `?deep=1` returns database `up`; with an unreachable database URL it returns 503 `SERVICE_UNAVAILABLE` |
| API-03 | `GET /api/categories` returns 5 items in `sort_order`, with `productCount` counting only active products |
| API-04 | `GET /api/products` returns 12 items, `pagination.total` 20, `totalPages` 2, default sort `featured` (featured ranks 1 to 4 first) |
| API-05 | `page=2` returns the remaining 8; pages do not overlap |
| API-06 | `limit=1` and `limit=48` work; `limit=0`, `49`, `abc` return 400 `VALIDATION_ERROR` with a `fields` entry |
| API-07 | Search matches names case-insensitively (for example `STAND`) |
| API-08 | Search matches words that appear only in `summary` or `description` |
| API-09 | A search of `%` or `_` matches nothing unless a product literally contains it (wildcards are escaped) |
| API-10 | SQL-injection strings in `search` (for example a quote followed by `; DROP TABLE users; --`) return 200 with no error, and all tables still exist afterwards |
| API-11 | `category=lighting` returns only lighting products; an unknown well-formed slug returns 200 with `items: []`; a malformed slug returns 400 |
| API-12 | Each of the five sorts returns the documented order, with `id` as a stable tie-breaker; prices are compared as integers |
| API-13 | An invalid `sort` and a repeated parameter (`sort=a&sort=b`) return 400 |
| API-14 | The inactive product never appears in lists or counts |
| API-15 | `stockStatus` is `out_of_stock` at 0, `low_stock` from 1 to 5 with `lowStockRemaining`, otherwise `in_stock` with `lowStockRemaining` null; `maxPurchasableQuantity` is min(stock, 10); no exact stock above 5 appears anywhere in the response |
| API-16 | Product and category responses contain only documented fields (no internal columns) |
| API-17 | A page beyond the last returns 200 with empty `items` and the requested `page` |
| API-18 | Product and category responses carry `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`; auth, cart, and order responses carry `no-store` |
| API-19 | `GET /api/products/felt-desk-mat-charcoal` returns `ProductDetail` with description, specs array, and images ordered by `sort_order` |
| API-20 | Unknown slug, malformed slug, and the inactive product's slug all return 404 `PRODUCT_NOT_FOUND` |

**Cart validation**

| ID | Must verify |
|---|---|
| API-21 | Valid lines return `status: 'ok'` and `summary.subtotalMinor`, `shippingMinor` (from config), `totalMinor` equal to hand-computed paise values; `currency` is `INR` |
| API-22 | Duplicate `productId` lines are merged by summing |
| API-23 | Quantity above stock returns `quantity_reduced` with `allowedQuantity`, an `INSUFFICIENT_STOCK` issue, and `hasBlockingIssues: true` |
| API-24 | Stock 0 returns `out_of_stock` |
| API-25 | Unknown and inactive product IDs return `unavailable` |
| API-26 | Quantity 11 for a well-stocked product returns `quantity_reduced` with `QUANTITY_CAPPED` and `allowedQuantity` 10 |
| API-27 | The summary counts only `ok` lines; with no `ok` lines `shippingMinor` is 0 |
| API-28 | 51 lines, non-integer values, negative values, and a non-array `items` return 400; an empty array returns 200 with an empty summary |
| API-29 | Works without a session cookie |
| API-30 | The 121st request from one IP inside 10 minutes returns 429 with `Retry-After` |

**Authentication**

| ID | Must verify |
|---|---|
| API-31 | `POST /api/auth/register` returns 201 `{user}` without any password field, and sets the cookie with `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, and `Max-Age` equal to the TTL |
| API-32 | The stored `password_hash` starts with a bcrypt prefix and differs from the password |
| API-33 | Each registration rule returns the exact field message from contract 4.7 |
| API-34 | Registering the same email in different casing returns 409 `EMAIL_TAKEN` with the specified message |
| API-35 | Unknown fields (`role`, `isAdmin`, `confirmPassword`) return 400 |
| API-36 | Login returns 200 and a **different** token than any previous session; a session cookie sent with the login request is deleted from the database |
| API-37 | Wrong password and unknown email return identical status, body, and headers (apart from `requestId`) |
| API-38 | Login with a missing or non-string field returns 400 |
| API-39 | `GET /api/auth/me` returns the user with a valid cookie, 401 without, and 401 plus a clearing `Set-Cookie` when the session's `expires_at` is in the past |
| API-40 | Logout returns 204, deletes the session row, clears the cookie, and replaying the old cookie returns 401; logout with no cookie still returns 204 |
| API-41 | A 73-byte password (including a case using multi-byte characters) returns 400 |
| API-42 | After 5 sequential failed logins for one email and IP in one window (each returns 401 `INVALID_CREDENTIALS`), the 6th attempt returns 429 with `Retry-After`, **even with the correct password**; the blocked attempt ran no bcrypt (spy count stays 5) and left `rate_limits.hits` at 5; the same sequence with an **unknown** email behaves identically (five 401s, then 429), with the dummy comparison running on the 5 permitted attempts |
| API-43 | The 11th registration from one IP in one hour returns 429 |
| API-67 | Successful logins are not counted as failures: after 3 failed logins a correct login returns 200 and `hits` is 3 afterwards; 2 more failures return 401 (`hits` 5); the next attempt returns 429 |
| API-68 | Window roll-over: after a lockout, moving the `login_fail` row's `window_start` back by one window length (or deleting the row) lets a correct login return 200 again; the blocked attempts during the lockout did not extend it |

**Order creation and reading**

| ID | Must verify |
|---|---|
| API-44 | `POST /api/orders`, `GET /api/orders`, and `GET /api/orders/:id` without a session return 401 `UNAUTHENTICATED` |
| API-45 | Missing, malformed, or non-UUID `Idempotency-Key` returns 400 `MISSING_IDEMPOTENCY_KEY` |
| API-46 | A valid order returns 201 with `OrderDetail`; `subtotalMinor`, `shippingMinor`, and `totalMinor` equal hand-computed paise values from database prices; all money, `quantity`, and count fields are JSON numbers (API-64); stock is decremented by exactly the ordered quantities; the database holds one order and the right items; the response equals the stored rows |
| API-47 | A body containing `priceMinor`, `totalMinor`, `userId`, or a legacy `priceCents` field returns 400 and writes nothing |
| API-48 | If a product's price is changed in the database after the client "saw" the old price, the order uses the new database price |
| API-49 | Invalid `productId` and `quantity` values (0, -1, 1.5, "2", null, 11, enormous numbers) return 400 or the specified 409 and write nothing |
| API-50 | Empty `items` returns 400; 51 lines returns 400; duplicate lines merge and respect the cap of 10 |
| API-51 | An inactive or unknown product returns 409 `STOCK_CONFLICT` with reason `unavailable`; nothing written |
| API-52 | An out-of-stock or insufficient-stock line returns 409 listing **all** problem lines; no order row; stock unchanged |
| API-53 | Every shipping rule returns its field message; the phone is stored as digits only; empty `addressLine2` is stored as null |
| API-54 | Replaying the same key and body (sequentially) returns 200 with the same order id and `Idempotent-Replay: true`; one order row; stock decremented once; the replay still succeeds after the product's stock has dropped to 0 (a replay never re-checks stock) |
| API-55 | The same key with a different body returns 409 `IDEMPOTENCY_KEY_REUSED` |
| API-56 | The same key used by two different users creates two independent orders |
| API-57 | The 11th order attempt by one user in one hour returns 429 |
| API-58 | `totalMinor` equals `subtotalMinor` plus the configured `SHIPPING_FLAT_MINOR` |
| API-59 | With a trigger forcing a failure while inserting `order_items`, the response is 500 or 503 with a generic message; no `orders` row exists; stock is unchanged |
| API-60 | `GET /api/orders` returns only the caller's orders, newest first, with correct `itemCount`, at most 3 thumbnails, and working `page`/`limit` |
| API-61 | Another user's order ID, a random UUID, and a malformed ID all return identical 404 `ORDER_NOT_FOUND` responses |
| API-62 | An order's detail does not change after the product is renamed or repriced (snapshot fields) |
| API-63 | List and detail return 401 when logged out |
| API-64 | Output types: for every endpoint that returns numbers (categories, product list and detail, cart validate, order create, list, and detail), every documented numeric field (`id` values, `priceMinor`, `unitPriceMinor`, `lineTotalMinor`, `subtotalMinor`, `shippingMinor`, `totalMinor`, `quantity`, `itemCount`, `productCount`, `maxPurchasableQuantity`, `lowStockRemaining` when present, `pagination.page`, `limit`, `total`, `totalPages`) is a JSON **number** for which `Number.isSafeInteger` is true; none is a string; money fields are non-negative |
| API-65 | Arithmetic invariants for created, listed, and detailed orders: `totalMinor = subtotalMinor + shippingMinor`; each `lineTotalMinor = unitPriceMinor * quantity`; the sum of `lineTotalMinor` equals `subtotalMinor`; `itemCount` (list) equals the sum of item quantities (detail); `shippingMinor` equals `SHIPPING_FLAT_MINOR`; every value is a safe integer and matches the database row |
| API-66 | Corrupt values: a test inserts an order whose `subtotal_minor` and `total_minor` are `9007199254740993` (valid for the CHECK constraints, unsafe for JavaScript). Reading it through `GET /api/orders/:id` and `GET /api/orders` returns the generic 500 envelope (no number and no field value in the body); the captured log line has code `INVALID_MONEY_VALUE` and the field name only |

### 8.5 Concurrency tests (`tests/api/concurrency.test.js`)

| ID | Must verify |
|---|---|
| CON-01 | Product with stock 1; two users send an order for it at the same moment: exactly one 201 and one 409; final stock 0; exactly one order |
| CON-02 | Product with stock 5; ten users each order 1 in parallel: exactly 5 succeed and 5 receive 409; final stock 0; five orders exist |
| CON-03 | Lock ordering: in each of 10 rounds, two fresh users order products A and B in opposite item order at the same time: no deadlock, and every request completes with 201 or the specified 409 |
| CON-04 | Same user, same key, same body, ample stock: 5 parallel requests return **exactly one 201 and four 200 replays** (each with `Idempotent-Replay: true`); all five carry the same order id; one `orders` row and one set of `order_items`; stock decremented exactly once; 10 rounds with fresh users |
| CON-05 | Twenty parallel orders produce unique order numbers |
| CON-06 | Two parallel registrations of the same email: one 201 and one 409 |
| CON-07 | The race that 4A.1 exists to prevent: a product with stock **1**; one user sends 5 parallel requests with the same key and the same body for quantity 1: exactly one 201 and four 200 replays, **zero** `STOCK_CONFLICT` responses, all with the same order id; final stock 0; exactly one order; 10 rounds |
| CON-08 | Same user and key with two **different** bodies in parallel (ample stock): exactly one 201 and one 409 `IDEMPOTENCY_KEY_REUSED` (never `STOCK_CONFLICT`, never 500); exactly one order exists and its items match the winning request; stock decreased only by the winner's quantities; 10 rounds |
| CON-09 | Two different users send the same key and the same body in parallel (ample stock): both receive 201 with different order ids; two orders exist; stock decreased twice |
| CON-10 | Mixed load: 8 users and 3 products with limited stock; some users send 3 parallel duplicates; items are listed in varying order. No response is 500 or 503; every duplicate group shares one order id; for each product, initial stock minus final stock equals the sum of `order_items.quantity` over created orders, and final stock is never negative |
| CON-11 | Login limiter, parallel failures: 20 parallel wrong-password logins for one email and IP in a fresh window: exactly 5 return 401 and 15 return 429; `rate_limits.hits` is 5; the bcrypt spy count is 5 |
| CON-12 | Login limiter near the limit: after 4 sequential failures, 10 parallel wrong-password logins: exactly 1 returns 401 and 9 return 429; final `hits` is 5 |
| CON-13 | Login limiter success handling: after 3 failures, one correct and one wrong login in parallel: the correct one returns 200, the wrong one returns 401, and final `hits` is 4 (the success released its slot); 5 parallel correct logins on a fresh key all return 200 and leave `hits` at 0 |

### 8.6 Security tests (`tests/api/security.test.js`)

| ID | SEC items | Must verify |
|---|---|---|
| SECT-01 | 02 | Cookie attributes in development mode; in a production-mode config the cookie has `Secure` and the `__Host-` name |
| SECT-02 | 05 | A session token replayed after logout is rejected |
| SECT-03 | 04 | A login or register request carrying an old cookie invalidates it and issues a different token |
| SECT-04 | 13, 14 | Origin guard: a POST to login, register, logout, orders, and cart validate with `Origin: https://evil.example` returns 403; same-origin passes; absent `Origin` with `Sec-Fetch-Site: cross-site` returns 403; in production mode absent both headers returns 403; `Origin: null` returns 403; a form content type returns 415 |
| SECT-05 | 14 | A body over 20 kB returns 413 |
| SECT-06 | 22 | Unknown fields are rejected on every body endpoint |
| SECT-07 | 15 | No response (including to an `OPTIONS` request and one with an `Origin` header) carries any `Access-Control-*` header |
| SECT-08 | 16, 29 | No `X-Powered-By`; helmet headers present on API responses |
| SECT-09 | 18 | Injection strings in search, category, sort, slug, order id, auth fields, and order fields never cause a 500 or a side effect, and all tables remain |
| SECT-10 | 38 | With a forced internal error, the response is the generic envelope and contains no stack, SQL, table, or constraint text |
| SECT-11 | 39 | Using a capturing `logSink`, after register, login, logout, and order creation no captured line contains the password, the cookie value, the token, the request body, or a connection string |
| SECT-12 | 11 | No response from any endpoint contains `password_hash` or a bcrypt hash |
| SECT-13 | 21 | Order IDOR is covered by API-61 and API-60 |
| SECT-14 | 26 | `rate_limits.key_hash` holds 32-byte digests; no raw email or IP appears in the table |
| SECT-15 | 26 | When the limiter's database call fails, login and register return 503, not success |
| SECT-16 | 10 | A login with an unknown email performs the dummy bcrypt comparison when a slot was granted (verified by a counter or spy on the password module) and performs none when blocked; the 401 and 429 responses for known and unknown emails are identical in status and body |
| SECT-17 | 07 | The session token does not appear in any response body or URL |
| SECT-18 | 06 | Logging in deletes that user's expired sessions |

### 8.7 Static checks (`npm test` includes a static-check file, or a script run in CI)

| ID | Must verify |
|---|---|
| STAT-01 | No `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, or `new Function` in `public/js` |
| STAT-02 | No inline `<script>` bodies, no `on*=` attributes, and no `style=` attributes in `public/*.html` |
| STAT-03 | No `http://` or `https://` URLs in `public/` HTML, CSS, or JS except the SVG namespace and the footer repository link |
| STAT-04 | Secret scan: no database connection string with a password and no real database host in the working tree or git history; `.env` is not tracked |
| STAT-05 | `package.json` lists exactly the seven production dependencies (`express`, `pg`, `bcryptjs`, `cookie-parser`, `helmet`, `zod`, `@vercel/functions`), has no `devDependencies` and no font package, sets `engines.node` to `22.x` and `type` to `module`; `package-lock.json` is present; the scripts match 7.2 exactly (no inline environment assignments, no POSIX-only commands, no `cross-env`) |
| STAT-06 | `npm audit --omit=dev` output is recorded; high or critical findings are fixed or documented |
| STAT-07 | `.env.example` and `.env.test.example` together list exactly the variables validated by `loadConfig` and the test helpers (no `TEST_*` variable in `.env.example`, no `DATABASE_URL` in `.env.test.example`), contain only placeholders, and `.env.test.example` leaves `TEST_DB_DISPOSABLE` empty |
| STAT-08 | `express.static` does not appear in `src/` |
| STAT-09 | Browser storage use in `public/js` is limited to the allowed keys in SEC-35; nothing writes a token |
| STAT-10 | Every `target="_blank"` link has `rel="noopener noreferrer"` |
| STAT-11 | Every HTML page has `lang`, a unique `<title>`, exactly one `h1`, a viewport tag without `user-scalable=no`, unique element ids, and images with `alt`, `width`, and `height` |
| STAT-12 | No payment of any kind (reconciliation section 6): scanning `public/`, `src/`, `db/`, and `scripts/` finds no payment-gateway names or SDK URLs, no `cc-` autocomplete tokens, and no `cvv` or `card number` text; the word "payment" appears only in the specified demo-notice strings |
| STAT-13 | Database access rules: no `setTypeParser` and no `parseInt8` in `src/`, `scripts/`, or `tests/helpers/`; `@vercel/functions` is imported only in `src/db/pool.js`; `new Pool(` appears only in `src/db/pool.js`, the scripts, and the test helpers; every JSON money or count field is produced by a serialiser that calls `toSafeMinor` or `toSafeCount` (no route sends a raw database row) |
| STAT-14 | Font assets: `public/fonts/` contains the latin and latin-ext WOFF2 files for both families, the licence files, and `README.md` (family, source package and exact version, licence, subsets, files, date, SHA-256 of each file); `public/css/fonts.css` references only `/fonts/...` paths; the main README credits both families; `package.json` and the lock file contain no font package |

### 8.8 Manual and browser tests (record who ran them, where, and when)

| ID | Procedure |
|---|---|
| MAN-01 | Full purchase on desktop (home, shop, product, add, cart, register, checkout, place, confirmation, orders). Includes double-clicking Place demo order. Screenshots saved |
| MAN-02 | The same journey at 360 px width |
| MAN-03 | The same journey at 768 px width |
| MAN-04 | Search, category, sort, and pagination, including URL state, reload, and Back/Forward |
| MAN-05 | Cart persistence across reload, closing the tab, login, and logout; the cart ignores a hand-edited `localStorage` value (corrupt JSON, negative quantity, unknown product) |
| MAN-06 | Two tabs: the cart badge stays in sync |
| MAN-07 | Out-of-stock and low-stock products display and block correctly on cards, the product page, and the cart |
| MAN-08 | Empty states: cart, search with no results, empty category, no orders, product not found |
| MAN-09 | Form validation messages on register, login, and checkout match the specified text exactly |
| MAN-10 | Loading states with throttled network: skeletons appear after 200 ms and stay at least 400 ms |
| MAN-11 | Error states with the network offline: error panels and retry buttons work |
| MAN-12 | Keyboard-only pass over every page: focus visible, drawer focus trap and Escape, disclosure menus, chips, stepper, pagination |
| MAN-13 | Screen-reader spot check on home, shop, product, cart, checkout, confirmation; record the software and version |
| MAN-14 | 200% zoom and 320 px reflow on every page |
| MAN-15 | Reduced-motion setting on: no hero entrance, no pulse, no transforms |
| MAN-16 | Contrast measured for every token pair in design section B; results recorded |
| MAN-17 | Touch target sizes at least 44 by 44 px on mobile |
| MAN-18 | Lighthouse mobile run on the local build and on the deployed site; scores recorded (accessibility at least 90, performance at least 85) |
| MAN-19 | Fresh-clone run from the README only, on a machine or folder that has never had the project |
| MAN-20 | The ₹ glyph renders in Bricolage Grotesque and Geist at every used weight; evidence saved as `docs/evidence/MAN-20-<date>.png` with a note naming the font file (latin or latin-ext) that supplies the glyph |
| MAN-21 | Hero hotspots work with keyboard and touch |
| MAN-22 | The demo notice is visible on every page where design section E requires it |
| MAN-23 | Neon console shows the placed order, its items, and the decremented stock (for the demo) |
| MAN-24 | Guest-only pages redirect logged-in users; protected pages redirect logged-out users to login and return afterwards; a malicious `next` value is ignored |
| MAN-25 | Portability: `npm ci`, `npm run db:setup`, `npm run test:unit`, `npm test`, and `npm run dev` run from Windows PowerShell or cmd.exe **without editing the scripts**, and the same commands run on a POSIX shell; record both environments and any difference |

### 8.9 Deployment tests

Defined in section 9.5 (DEP-01 to DEP-19).

## 9. Deployment plan

### 9.1 `vercel.json` (exact contents)

```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" }
      ]
    },
    {
      "source": "/fonts/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/(css|js|images|icons)/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=86400, stale-while-revalidate=604800" }]
    }
  ]
}
```

There is no `functions` block, no `builds`, and no rewrites unless the fallback in 9.3 is needed. Whether Vercel applies the `headers` block to function (API) responses is **not assumed**: helmet sets the API's security headers in Express (SEC-29), and DEP-07 checks both kinds of response.

### 9.2 Routing model

| Request | Served by |
|---|---|
| `/`, `/shop`, `/product`, `/cart`, `/login`, `/register`, `/checkout`, `/order`, `/orders` | Static files `public/*.html`, through `cleanUrls` |
| `/css/*`, `/js/*`, `/fonts/*`, `/images/*`, `/icons/*`, `/favicon.svg` | Static files from `public/` (Vercel serves `public/**`; `express.static` is ignored on Vercel and MUST NOT be used) |
| `/api/*` | The Express function (`src/app.js`) |
| Unknown non-API paths | Reach Express, which returns the in-code 404 HTML page (`src/views/notFoundPage.js`) |
| Unknown `/api/*` paths | Express JSON 404 `ROUTE_NOT_FOUND` |

### 9.3 Fallback if `cleanUrls` does not serve pages (test DEP-03 decides)

Add explicit rewrites (static destinations only) and re-run DEP-03:

```json
"rewrites": [
  { "source": "/shop", "destination": "/shop.html" },
  { "source": "/product", "destination": "/product.html" },
  { "source": "/cart", "destination": "/cart.html" },
  { "source": "/login", "destination": "/login.html" },
  { "source": "/register", "destination": "/register.html" },
  { "source": "/checkout", "destination": "/checkout.html" },
  { "source": "/order", "destination": "/order.html" },
  { "source": "/orders", "destination": "/orders.html" }
]
```

Record in `docs/STATUS.md` which variant is in use and why.

### 9.4 Project settings and steps (human steps are marked)

1. (Human) Push the repository to GitHub as `CodeAlpha_EcommerceStore` and import it in Vercel.
2. Settings: Framework Preset auto-detected as Express (or "Other" if not); Root Directory `./`; Install Command `npm ci`; no build command is required (there is no build step); Node.js version 22.x (also set by `engines`).
3. (Human) Add the environment variables per 5.4 for the Production and Preview scopes. `SESSION_COOKIE_NAME` in Production MUST start with `__Host-`.
4. (Human) Run `db:migrate` and `db:seed` against the target branch from a trusted machine (7.7).
5. Deploy a Preview first; run the verification tests in 9.5 on it; then deploy Production and run them again.
6. Note: Vercel Deployment Protection may put a login in front of Preview URLs. If so, run the tests with the owner's access or on Production, and record which.

### 9.5 Deployment verification tests (each must be run on the real deployment)

| ID | Procedure and expectation |
|---|---|
| DEP-01 | Deployment completes without errors; build and function logs show no startup configuration failure |
| DEP-02 | `/`, `/css/...`, `/js/...`, `/images/...`, `/fonts/...` return 200 with the cache headers from 9.1 |
| DEP-03 | Each page path (`/shop`, `/cart`, `/login`, `/register`, `/checkout`, `/order`, `/orders`) returns 200 HTML without `.html` in the URL; `/product?slug=felt-desk-mat-charcoal` renders with its query string intact |
| DEP-04 | `/api/products?limit=3` returns JSON 200 with three products |
| DEP-05 | `/api/health?deep=1` returns database `up` |
| DEP-06 | `/no-such-page` returns 404 with HTML; `/api/no-such` returns 404 with the JSON envelope |
| DEP-07 | `curl -I` on an HTML page, a CSS file, and an API response each show `X-Content-Type-Options`, `Referrer-Policy`, and a CSP (static) or helmet headers (API); record what Vercel actually returns for each |
| DEP-08 | After registering on the deployed site, the cookie in the browser tools is named `__Host-...`, has `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and no `Domain` |
| DEP-09 | A complete order is placed on the deployed site; the order and items appear in the Neon console; stock decremented |
| DEP-10 | Every environment variable exists in the right scope; downloading all HTML, CSS, and JS from the deployed site and searching for connection strings, host names, and `password` finds nothing sensitive |
| DEP-11 | A Preview deployment writes to the preview branch and **not** to `main` (compare row counts) |
| DEP-12 | Record what `req.ip`, `req.protocol`, and `X-Forwarded-For` actually contain on Vercel (a temporary debug log or a rate-limit probe), and confirm that the rate limits key on the client address, not on a shared proxy address |
| DEP-13 | Function logs contain request ids and no secrets, bodies, cookies, or passwords |
| DEP-14 | Note first-request latency after idle (informational) and confirm that no connection-exhaustion or connection-limit errors appear in the function logs or the Neon console after 30 rapid requests |
| DEP-15 | No Content-Security-Policy violation appears in the browser console on any page |
| DEP-16 | Lighthouse (mobile) on the deployed home, shop, and product pages; scores recorded |
| DEP-17 | Pool management: the function logs show the `db_pool_attached` info line (once per instance) on Vercel, and it does not appear in local runs; under the load in DEP-14 no connection errors appear |
| DEP-18 | Idempotency on the pooled Neon endpoint: send 5 parallel `POST /api/orders` requests with one user, one key, and one body from a small script; exactly one 201 and four 200 replays with the same order id; one order and its items in the Neon console; stock decremented once |
| DEP-19 | Login limiter on the deployment: 20 parallel wrong-password logins for a throwaway email: exactly 5 responses are 401 and 15 are 429 (assumes the client address is what Vercel supplies; see DEP-12) |

### 9.6 README requirements (`README.md`)

The README MUST contain: project summary and the demo notice ("no real payments, fictional data only"); CodeAlpha internship context (task, repository name); feature list matching the delivered scope; tech stack; prerequisites (Node 22, npm, Neon account); the exact local setup commands from 7.8; the environment-variable table (names and meanings only, covering both `.env.example` and `.env.test.example`); the npm script table; folder structure; API summary with a link to the contract; database schema summary; how to seed the database and how the test database is isolated (`.env.test`, `TEST_DB_DISPOSABLE`); how to run tests (`npm test`, `npm run test:unit`) and what they cover; Windows and POSIX notes; deployment steps from section 9; security notes; known limitations (no payments, flat shipping, no email or password reset, per-instance connection limits, rate-limit behaviour); credits for fonts (link to `public/fonts/README.md` and the licence files), icons, and every image (link to `public/images/CREDITS.md`); screenshots **taken from the running application only**; the live URL **only after DEP tests pass**; and the LinkedIn video link once it exists. It MUST NOT contain secrets, real connection strings, or claims of passing tests that are not backed by `docs/STATUS.md`.

## 10. Implementation order (phases)

Each phase ends only when its listed tests have been run and recorded in `docs/STATUS.md`. A phase is not "done" on the strength of code being written.

| Phase | Deliverable | Tests that must pass before moving on |
|---|---|---|
| 0 | Repository, `package.json` (seven dependencies, scripts exactly as 7.2), `.gitignore`, `.env.example`, `.env.test.example`, `docs/STATUS.md` skeleton, `loadConfig`, folder tree | UT-11, STAT-05, STAT-07 |
| 1 | `001_init.sql` (corrected schema from the reconciliation file), migration runner, test-database reset and `assertSafeTestDatabase`, seed script and catalogue | DB-01 to DB-08, DB-11 to DB-13, MAN-25 (for the scripts that exist) |
| 2 | `createApp`, `src/lib/numbers.js`, `src/db/pool.js` with `attachDatabasePool`, request id, logging, error handler, 404 handlers, helmet, origin guard, body limits, health endpoint; local dev server; first deploy of the skeleton to Vercel | UT-13, UT-14, API-01, API-02, SECT-04 to SECT-08, SECT-10, STAT-08, STAT-13, DEP-01, DEP-05, DEP-06, DEP-17 |
| 3 | Categories and products endpoints | API-03 to API-20, API-64 (for these endpoints), UT-05, UT-07, SECT-09 (for these endpoints) |
| 4 | Sessions, register, login, logout, me, password hashing, rate limiting (atomic login-failure limiter) | UT-02, UT-03, UT-04, API-31 to API-43, API-67, API-68, CON-11 to CON-13, SECT-01 to SECT-03, SECT-11 to SECT-18 |
| 5 | Cart validation endpoint | API-21 to API-30 |
| 6 | Order creation and reading, serialised idempotency, transactions, numeric serialisers | UT-01, UT-06, UT-08, UT-09, API-44 to API-66, CON-01 to CON-10, DB-09, DB-10 |
| 7 | Frontend foundations: tokens, base CSS, components, self-hosted fonts (7.9), icons, header, drawer, footer, toast, `formatMinor`, `cart-store`, `safe-redirect`, API client | UT-10, UT-12, STAT-01 to STAT-03, STAT-09 to STAT-12, STAT-14, MAN-20 |
| 8 | Frontend pages: home, shop, product, cart, auth, checkout, confirmation, orders, 404 | MAN-01 to MAN-11, MAN-21, MAN-22, MAN-24 |
| 9 | Accessibility, responsive, and visual pass | MAN-12 to MAN-17 |
| 10 | Hardening: `npm audit`, secret scan, README, credits | STAT-04, STAT-06, MAN-19 |
| 11 | Production deploy and verification | DEP-01 to DEP-19, MAN-18, MAN-23 |
| 12 | Final `docs/STATUS.md` review, demo script rehearsal, LinkedIn video, submission | Every row in section 11 is PASS, or has a documented, accepted reason |

If time runs short, cut in this order: optional design items (design addendum UD-08), pagination polish, then hero hotspot refinement. Never cut transactional order creation, validation, the order-ownership check, or the rate limits.

## 11. Acceptance tests and `docs/STATUS.md` reporting procedure

### 11.1 Purpose

`docs/STATUS.md` is the only place that states whether anything works. It is written by the implementing agent and reviewed by the owner. It contains a row for every test ID in section 8 and 9, and a derived row for every acceptance criterion AC-1 to AC-55 from the implementation brief.

### 11.2 Rules

1. A test status is one of `NOT RUN`, `PASS`, `FAIL`, `BLOCKED` (cannot run; reason required), or `N/A` (does not apply; reason required). Every row starts as `NOT RUN`.
2. `PASS` requires that the agent actually ran the test and saw it pass **in this working tree**. Writing "should pass" or reasoning that it would pass is not evidence.
3. Each non-`NOT RUN` row records: the command or procedure, the date, the commit SHA, the result summary, and an evidence pointer (see 11.4).
4. A code change after a `PASS` marks every test in the affected area as `STALE` until re-run. Before the final submission nothing may be `STALE`.
5. The agent never edits a failing test to make it pass unless the test itself is wrong, and then records why.
6. Manual tests record the person, device or browser and version, screen size, and date. Screenshots go in `docs/evidence/` with the test ID in the file name.
7. Deployment tests record the exact URL and deployment ID tested.
8. Known issues are listed separately with an ID, impact, and decision (fix, accept, or defer with reason). An AC with an open known issue is not `PASS`.

### 11.3 `docs/STATUS.md` template

```
# Status log

Environment: Node <version> | npm <version> | OS <name> | Shell <PowerShell / cmd / bash>
Test config: NODE_ENV=test from .env.test | Test DB target: <host/dbname, no credentials> | TEST_DB_DISPOSABLE confirmed by owner: <yes/no>
Dependencies (7): express, pg, bcryptjs, cookie-parser, helmet, zod, @vercel/functions | Font packages in package.json: none
Commit: <SHA> | Date: <YYYY-MM-DD> | Test DB branch: test | Deployed URL: <not deployed yet>

## Summary
Tests: PASS <n> | FAIL <n> | BLOCKED <n> | N/A <n> | NOT RUN <n> | STALE <n>
Acceptance criteria: PASS <n> of 55 | not yet passing: <list>

## Verified-on-Vercel facts (section 0 and 9)
| Item | Result | Evidence |
| cleanUrls serves /shop | NOT RUN | |
| req.ip / req.protocol on Vercel | NOT RUN | |
| attachDatabasePool runs on Vercel and the pool settings behave (DEP-17) | NOT RUN | |
| Scripts run on Windows and on a POSIX shell (MAN-25) | NOT RUN | |
| Rupee glyph present in both fonts (MAN-20) | NOT RUN | |
| Latest dependency versions | NOT RUN | |

## Tests
| ID | Area | Procedure / command | Status | Date | Commit | Evidence |
| UT-01 | money | npm run test:unit | NOT RUN | | | |
| ... one row for every ID in sections 8 and 9 ... |

## Acceptance criteria (derived)
| AC | Requirement (short) | Mapped tests | Status |
| AC-1 | Shop lists seeded products | API-04, DB-05, MAN-04 | NOT RUN |
| ... AC-1 to AC-55 ... |

## Known issues
| ID | Description | Impact | Decision |

## Decisions and deviations
| Date | Decision | Reason |
```

### 11.4 Evidence

| Test kind | Evidence |
|---|---|
| Automated | Full runner output saved with `npm test 2>&1 | tee docs/evidence/test-run-<date>.txt`; the status row cites the file and the line with the test name |
| Static | Command and its output, saved the same way |
| Manual | Screenshot or short note in `docs/evidence/<ID>-<date>.png` or `.md` |
| Deployment | `curl -I` outputs, screenshots of the browser tools, Neon console screenshots, Lighthouse report JSON or screenshot |

### 11.5 Derived AC status

An acceptance criterion is `PASS` only if **every** mapped test is `PASS`; `FAIL` if any mapped test is `FAIL`; `BLOCKED` if any is `BLOCKED` and none `FAIL`; otherwise `NOT RUN`.

### 11.6 AC to test mapping (the original AC-1 to AC-55)

| AC | Mapped tests |
|---|---|
| 1 | API-04, DB-05, MAN-04 |
| 2 | API-04, API-05, API-17, MAN-04 |
| 3 | API-07, API-08, API-09, API-10, MAN-04 |
| 4 | API-11, MAN-04 |
| 5 | API-12, API-13, MAN-04 |
| 6 | MAN-04 |
| 7 | MAN-08 |
| 8 | API-15, API-24, MAN-07 |
| 9 | API-19, MAN-01 |
| 10 | API-20, MAN-08 |
| 11 | API-15, API-26, MAN-01 |
| 12 | MAN-01, MAN-06 |
| 13 | API-15, MAN-07 |
| 14 | UT-12, STAT-09, MAN-05 |
| 15 | MAN-05 |
| 16 | UT-12, MAN-05 |
| 17 | API-22, MAN-01 |
| 18 | API-21, API-64, MAN-01 |
| 19 | API-23, API-24, API-25, MAN-07 |
| 20 | UT-12, MAN-05 |
| 21 | MAN-08 |
| 22 | UT-04, API-33, API-41, MAN-09 |
| 23 | API-34, CON-06 |
| 24 | API-32, SECT-12 |
| 25 | API-31, SECT-01, DEP-08 |
| 26 | API-37 |
| 27 | API-39, MAN-01 |
| 28 | API-40, SECT-02 |
| 29 | MAN-24 |
| 30 | UT-10, API-44, API-63, MAN-24 |
| 31 | API-44, API-50, MAN-24 |
| 32 | API-46, API-47, API-48, API-65 |
| 33 | UT-06, API-53, MAN-09 |
| 34 | API-46, API-65, DB-09, API-59 |
| 35 | API-62, DB-02 |
| 36 | API-46, API-52, CON-01, CON-02, CON-10 |
| 37 | API-54, CON-04, CON-07, CON-08, MAN-01 |
| 38 | MAN-01 |
| 39 | API-59, MAN-11 |
| 40 | MAN-22, STAT-12 |
| 41 | API-60, MAN-01 |
| 42 | API-61, SECT-13 |
| 43 | MAN-08 |
| 44 | MAN-01, MAN-02, MAN-03 |
| 45 | MAN-02, MAN-12 |
| 46 | MAN-12, MAN-17 |
| 47 | MAN-09, MAN-12, STAT-11 |
| 48 | MAN-13, MAN-16, STAT-11 |
| 49 | MAN-15 |
| 50 | MAN-10, MAN-11 |
| 51 | DEP-01, DEP-09, DEP-17, DEP-18 |
| 52 | MAN-19, MAN-25 |
| 53 | STAT-04, DEP-10 |
| 54 | DB-06, DB-07 |
| 55 | MAN-18, DEP-16 |

### 11.7 Definition of done

The project is done only when: every test row in sections 8 and 9 is `PASS` or `N/A` with an accepted reason; every AC row is `PASS`; no row is `STALE`; known issues have decisions; `npm audit` is recorded; the README matches reality; and the deployed URL in the README was verified by the DEP tests. Until then the agent describes the project as "in progress" and states exactly which tests have and have not been run.

---
*End of Backend Contract Addendum.*
