# Status log

Environment: Node 26.8.2 | npm 11.19.1 | OS Windows 11 Home Single Language (26H2) | Shell PowerShell
Test config: NODE_ENV=test from .env.test | Test DB target: ep-lively-paper-b5fqitlt.c-7.us-east-2.aws.neon.tech/neondb | TEST_DB_DISPOSABLE confirmed by owner: yes (set in .env.test)
Dependencies (7): express, pg, bcryptjs, cookie-parser, helmet, zod, @vercel/functions | Font packages in package.json: none
Commit: <pending first commit> | Date: 2026-11-02 | Test DB branch: test | Deployed URL: <not deployed yet>

## Summary
Tests: PASS 26 | FAIL 0 | BLOCKED 0 | N/A 0 | NOT RUN 158 | STALE 0
Test runner: 224 tests across 44 suites | pass 224 | fail 0 | skipped 0
Acceptance criteria: PASS 0 of 55 | not yet passing: all (all ACs remain NOT RUN until full feature verification)

## Phase 0 gate tests (actually run on 2026-11-01)

| ID | Command | Status | Date | Evidence |
|---|---|---|---|---|
| UT-11 | `node --env-file=.env.test --test --test-reporter=spec "tests/unit/**/*.test.js"` | **PASS** (58/58) | 2026-11-01 | 58 tests pass, exit 0 |
| STAT-05 | `node --env-file=.env.test --test --test-reporter=spec "tests/static/**/*.test.js"` | **PASS** (17/17) | 2026-11-01 | 17 tests pass, exit 0 |
| STAT-07 | `node --env-file=.env.test --test --test-reporter=spec "tests/static/**/*.test.js"` | **PASS** (11/11) | 2026-11-01 | 11 tests pass, exit 0 |

## Phase 1 gate tests (actually run on 2026-11-02)

| ID | Command | Status | Date | Evidence |
|---|---|---|---|---|
| DB-01 | `npm test` | **PASS** (5/5) | 2026-11-02 | schema_migrations table, all 9 expected tables present, order_number_seq exists, migration idempotence verified, pooler refusal verified |
| DB-02 | `npm test` | **PASS** (17/17) | 2026-11-02 | Email lowercase & unique, price_minor > 0 and multiple of 100, non-negative stock, slug lowercase kebab, featured_rank bounds, order totals match sum, currency INR, shipping phone digits, order item math & 1..100 qty, unique (order_id, product_id), unique (user_id, idempotency_key), image path /images/ |
| DB-03 | `npm test` | **PASS** (4/4) | 2026-11-02 | Product with order items deletion blocked (RESTRICT, SQLSTATE 23001), user with orders deletion blocked (RESTRICT, SQLSTATE 23001), user deletion cascades to sessions, order deletion cascades to order_items |
| DB-04 | `npm test` | **PASS** (9/9) | 2026-11-02 | All 9 named indexes verified in pg_indexes: users_email_key, sessions_token_hash_key, products_category_idx, products_newest_idx, products_price_idx, products_featured_idx, orders_user_created_idx, order_items_product_idx, rate_limits_window_idx |
| DB-05 | `npm test` | **PASS** (8/8) | 2026-11-02 | Exactly 5 categories, 21 products (20 active, 1 inactive), 4 desk-mats, 1 stock=0, 2 low-stock (1..5), featured ranks 1..4 unique, long-name product present, inactive product inactive |
| DB-06 | `npm test` | **PASS** (3/3) | 2026-11-02 | Seed idempotence: identical counts on repeat run, stock preserved across runs without --reset-stock, stock restored to catalog values with --reset-stock |
| DB-07 | `npm test` | **PASS** (1/1) | 2026-11-02 | All 21 seeded price_minor values are positive integer multiples of 100 (paise) |
| DB-08 | `npm test` | **PASS** (2/2) | 2026-11-02 | set_updated_at trigger advances updated_at timestamp on users and products |
| DB-11 | `npm test` | **PASS** (1/1) | 2026-11-02 | assertSafeTestDatabase / test-db-reset exits 1 without connecting when NODE_ENV is not 'test' |
| DB-12 | `npm test` | **PASS** (3/3) | 2026-11-02 | orders_idempotency_key unique constraint raises 23505 on duplicate (user_id, idempotency_key); different users with same key succeed; advisory xact lock functions verified |
| DB-13 | `npm test` | **PASS** (3/3) | 2026-11-02 | No global type parser overrides: bigint returns string "1", numeric returns string, integer returns number 1 |
| MAN-25 | manual | **NOT RUN** | | Windows PowerShell verified; POSIX shell portability not yet manually verified |

## Phase 2 gate tests (actually run on 2026-11-02)

| ID | Command | Status | Date | Evidence |
|---|---|---|---|---|
| UT-13 | `node --env-file=.env.test --test --test-reporter=spec tests/unit/numbers.test.js` | **PASS** (54/54) | 2026-11-02 | toSafeMinor & toSafeCount accept integers & non-negative digit strings; reject floats, negatives, unsafe integers, empty strings, objects, booleans with INVALID_MONEY_VALUE and INVALID_COUNT_VALUE without revealing bad values |
| UT-14 | `node --env-file=.env.test --test --test-reporter=spec tests/unit/pool.test.js` | **PASS** (4/4) | 2026-11-02 | attachDatabasePool called once on Vercel and logs db_pool_attached; not called when onVercel is false; pool options propagated; pool error listener handles errors without crash |
| API-01 | `node --env-file=.env.test --test --test-reporter=spec tests/api/health.test.js` | **PASS** (1/1) | 2026-11-02 | GET /api/health returns 200 { status: 'ok' }, Cache-Control: no-store, X-Request-Id, no version or environment details |
| API-02 | `node --env-file=.env.test --test --test-reporter=spec tests/api/health.test.js` | **PASS** (3/3) | 2026-11-02 | GET /api/health?deep=1 returns { status: 'ok', database: 'up' }; returns 503 SERVICE_UNAVAILABLE when pool unreachable; rejects duplicated query params with 400 VALIDATION_ERROR |
| SECT-04 | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** (7/7) | 2026-11-02 | Rejects evil origin, Origin: null, Sec-Fetch-Site: cross-site, missing headers in production with 403 FORBIDDEN_ORIGIN; same-origin passes; non-JSON content-type on body returns 415 UNSUPPORTED_MEDIA_TYPE |
| SECT-05 | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** (2/2) | 2026-11-02 | Payload > 20 kB returns 413 PAYLOAD_TOO_LARGE; malformed JSON body returns 400 INVALID_JSON |
| SECT-06 | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** (1/1) | 2026-11-02 | Unknown body fields rejected with 400 VALIDATION_ERROR on strict schemas |
| SECT-07 | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** (1/1) | 2026-11-02 | Zero Access-Control-* headers emitted on any response, including OPTIONS and cross-origin requests |
| SECT-08 | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** (2/2) | 2026-11-02 | X-Powered-By header absent; helmet security headers (X-Content-Type-Options: nosniff, etc.) present on API responses |
| SECT-10 | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** (1/1) | 2026-11-02 | Forced internal 500 error returns generic envelope; no stack trace, SQL statement, table name, or constraint text leaked |
| STAT-08 | `node --env-file=.env.test --test --test-reporter=spec tests/static/code-rules.test.js` | **PASS** (1/1) | 2026-11-02 | express.static does not appear in any file in src/ |
| STAT-13 | `node --env-file=.env.test --test --test-reporter=spec tests/static/db-rules.test.js` | **PASS** (3/3) | 2026-11-02 | No setTypeParser or parseInt8 in src/, scripts/, or tests/helpers/; @vercel/functions imported only in src/db/pool.js; new Pool( appears only in allowed modules |

### Test Database Reset Verification (run on 2026-11-02)
- Command: `npm run test:db:reset` (`node --env-file=.env.test scripts/test-db-reset.js`)
- Safety check: All 6 safety checks verified against target `ep-lively-paper-b5fqitlt.c-7.us-east-2.aws.neon.tech/neondb`
- Schema reset: Public schema dropped with CASCADE and recreated cleanly
- Migrations: `001_init.sql` applied cleanly via `runMigrations` (1 applied, 0 skipped)
- Seed: 5 categories and 21 products seeded (`active=20, out_of_stock=1, low_stock=2`) via `runSeed`

## npm audit note (STAT-06)

`npm audit --omit=dev` reports 4 high-severity findings. All are in the dependency chain:
`@vercel/functions` → `@vercel/oidc` → `@vercel/cli-config` → `zod < 4.6.6`

**Assessment:** These vulnerabilities are in `@vercel/functions`'s own sub-dependencies (its internal `zod` 4.x). Our application uses `zod` 3.24.4 directly, which is unaffected. The vulnerable `zod` 4.x is never imported by application code. The `audit fix --force` would install zod 4.x which is a **breaking API change** for our use of zod 3.x schemas. Decision: accept and document; re-check at each phase.

## Verified-on-Vercel facts (section 0 and 9)
| Item | Result | Evidence |
|---|---|---|
| cleanUrls serves /shop | NOT RUN | |
| req.ip / req.protocol on Vercel | NOT RUN | |
| attachDatabasePool runs on Vercel and the pool settings behave (DEP-17) | NOT RUN | |
| Scripts run on Windows and on a POSIX shell (MAN-25) | Windows verified; POSIX pending | PowerShell runs test:db:reset and npm test cleanly |
| Rupee glyph present in both fonts (MAN-20) | NOT RUN | |
| Latest dependency versions (verified at install) | express 5.3.0, pg 8.23.1, bcryptjs 3.0.3, cookie-parser 1.4.7, helmet 8.3.0, zod 3.24.4, @vercel/functions 3.10.5 | 2026-11-01 |

## Tests
| ID | Area | Procedure / command | Status | Date | Commit | Evidence |
|---|---|---|---|---|---|---|
| UT-01 | money | npm run test:unit | NOT RUN | | | |
| UT-02 | passwords | npm run test:unit | NOT RUN | | | |
| UT-03 | tokens | npm run test:unit | NOT RUN | | | |
| UT-04 | validators/auth | npm run test:unit | NOT RUN | | | |
| UT-05 | validators/products | npm run test:unit | NOT RUN | | | |
| UT-06 | validators/orders | npm run test:unit | NOT RUN | | | |
| UT-07 | escapeLike | npm run test:unit | NOT RUN | | | |
| UT-08 | orderNumber | npm run test:unit | NOT RUN | | | |
| UT-09 | request hash | npm run test:unit | NOT RUN | | | |
| UT-10 | safe-redirect | npm run test:unit | NOT RUN | | | |
| UT-11 | config.loadConfig | `node --env-file=.env.test --test --test-reporter=spec "tests/unit/**/*.test.js"` | **PASS** | 2026-11-01 | pending | 58/58 tests pass |
| UT-12 | cart-store | npm run test:unit | NOT RUN | | | |
| UT-13 | lib/numbers | `node --env-file=.env.test --test --test-reporter=spec tests/unit/numbers.test.js` | **PASS** | 2026-11-02 | pending | 54/54 pass: toSafeMinor & toSafeCount accept valid values; reject bad values with error codes |
| UT-14 | db/pool | `node --env-file=.env.test --test --test-reporter=spec tests/unit/pool.test.js` | **PASS** | 2026-11-02 | pending | 4/4 pass: attachDatabasePool called once on Vercel; error event logged without crash |
| DB-01 | migrations | `npm test` | **PASS** | 2026-11-02 | pending | 5/5 pass: schema_migrations, 9 tables, order_number_seq, idempotent, pooler refusal |
| DB-02 | constraints | `npm test` | **PASS** | 2026-11-02 | pending | 17/17 pass: email, price, whole rupee, stock, slug, ranks, order totals, item math |
| DB-03 | foreign keys | `npm test` | **PASS** | 2026-11-02 | pending | 4/4 pass: product delete RESTRICT (23001), user delete RESTRICT (23001), cascades |
| DB-04 | indexes | `npm test` | **PASS** | 2026-11-02 | pending | 9/9 pass: users_email_key, sessions, products (4), orders, order_items, rate_limits |
| DB-05 | seeded counts | `npm test` | **PASS** | 2026-11-02 | pending | 8/8 pass: 5 categories, 21 products, stock distribution, featured ranks |
| DB-06 | seed idempotence | `npm test` | **PASS** | 2026-11-02 | pending | 3/3 pass: repeat run counts match, stock preserved, --reset-stock restores |
| DB-07 | price_minor values | `npm test` | **PASS** | 2026-11-02 | pending | 1/1 pass: all 21 products multiple of 100 paise |
| DB-08 | updated_at trigger | `npm test` | **PASS** | 2026-11-02 | pending | 2/2 pass: updated_at advances on user and product update |
| DB-09 | order persistence | npm test | NOT RUN | | | |
| DB-10 | unique order numbers | npm test | NOT RUN | | | |
| DB-11 | assertSafeTestDatabase | `npm test` | **PASS** | 2026-11-02 | pending | 1/1 pass: refusing to run when NODE_ENV != 'test' |
| DB-12 | idempotency backstop | `npm test` | **PASS** | 2026-11-02 | pending | 3/3 pass: 23505 on duplicate, cross-user ok, advisory lock ok |
| DB-13 | no global parser | `npm test` | **PASS** | 2026-11-02 | pending | 3/3 pass: bigint string, numeric string, integer number |
| API-01 | GET /api/health | `node --env-file=.env.test --test --test-reporter=spec tests/api/health.test.js` | **PASS** | 2026-11-02 | pending | 1/1 pass: GET /api/health returns 200 {status: 'ok'} without metadata |
| API-02 | GET /api/health?deep=1 | `node --env-file=.env.test --test --test-reporter=spec tests/api/health.test.js` | **PASS** | 2026-11-02 | pending | 3/3 pass: deep health returns {database: 'up'}; unreachable pool returns 503; duplicated params reject |
| API-03 | GET /api/categories | npm test | NOT RUN | | | |
| API-04 | GET /api/products | npm test | NOT RUN | | | |
| API-05 | products page=2 | npm test | NOT RUN | | | |
| API-06 | products limit bounds | npm test | NOT RUN | | | |
| API-07 | search case insensitive | npm test | NOT RUN | | | |
| API-08 | search in summary/desc | npm test | NOT RUN | | | |
| API-09 | search wildcards escaped | npm test | NOT RUN | | | |
| API-10 | SQL injection safe | npm test | NOT RUN | | | |
| API-11 | category filter | npm test | NOT RUN | | | |
| API-12 | sort orders | npm test | NOT RUN | | | |
| API-13 | invalid sort | npm test | NOT RUN | | | |
| API-14 | inactive hidden | npm test | NOT RUN | | | |
| API-15 | stockStatus | npm test | NOT RUN | | | |
| API-16 | response fields only | npm test | NOT RUN | | | |
| API-17 | page beyond last | npm test | NOT RUN | | | |
| API-18 | cache-control headers | npm test | NOT RUN | | | |
| API-19 | product detail | npm test | NOT RUN | | | |
| API-20 | product not found | npm test | NOT RUN | | | |
| API-21 | cart validate ok | npm test | NOT RUN | | | |
| API-22 | cart merge dupes | npm test | NOT RUN | | | |
| API-23 | cart quantity reduced | npm test | NOT RUN | | | |
| API-24 | cart out of stock | npm test | NOT RUN | | | |
| API-25 | cart unavailable | npm test | NOT RUN | | | |
| API-26 | cart quantity cap | npm test | NOT RUN | | | |
| API-27 | cart summary ok-only | npm test | NOT RUN | | | |
| API-28 | cart invalid body | npm test | NOT RUN | | | |
| API-29 | cart without session | npm test | NOT RUN | | | |
| API-30 | cart rate limit | npm test | NOT RUN | | | |
| API-31 | register 201 | npm test | NOT RUN | | | |
| API-32 | password hash | npm test | NOT RUN | | | |
| API-33 | register field messages | npm test | NOT RUN | | | |
| API-34 | email taken | npm test | NOT RUN | | | |
| API-35 | unknown fields | npm test | NOT RUN | | | |
| API-36 | login new token | npm test | NOT RUN | | | |
| API-37 | identical login failures | npm test | NOT RUN | | | |
| API-38 | login missing field | npm test | NOT RUN | | | |
| API-39 | GET /api/auth/me | npm test | NOT RUN | | | |
| API-40 | logout 204 | npm test | NOT RUN | | | |
| API-41 | 73-byte password | npm test | NOT RUN | | | |
| API-42 | login rate limit | npm test | NOT RUN | | | |
| API-43 | register rate limit | npm test | NOT RUN | | | |
| API-44 | orders unauthenticated | npm test | NOT RUN | | | |
| API-45 | idempotency-key missing | npm test | NOT RUN | | | |
| API-46 | order 201 | npm test | NOT RUN | | | |
| API-47 | order rejects price fields | npm test | NOT RUN | | | |
| API-48 | order uses db price | npm test | NOT RUN | | | |
| API-49 | order invalid product/qty | npm test | NOT RUN | | | |
| API-50 | order empty/over items | npm test | NOT RUN | | | |
| API-51 | order inactive product | npm test | NOT RUN | | | |
| API-52 | order out-of-stock | npm test | NOT RUN | | | |
| API-53 | order shipping rules | npm test | NOT RUN | | | |
| API-54 | idempotent replay | npm test | NOT RUN | | | |
| API-55 | key reused different body | npm test | NOT RUN | | | |
| API-56 | same key diff users | npm test | NOT RUN | | | |
| API-57 | orders rate limit | npm test | NOT RUN | | | |
| API-58 | total = subtotal + shipping | npm test | NOT RUN | | | |
| API-59 | forced failure rollback | npm test | NOT RUN | | | |
| API-60 | GET /api/orders list | npm test | NOT RUN | | | |
| API-61 | order IDOR | npm test | NOT RUN | | | |
| API-62 | snapshot unchanged | npm test | NOT RUN | | | |
| API-63 | orders list logged out | npm test | NOT RUN | | | |
| API-64 | output types | npm test | NOT RUN | | | |
| API-65 | arithmetic invariants | npm test | NOT RUN | | | |
| API-66 | unsafe bigint -> 500 | npm test | NOT RUN | | | |
| API-67 | success not failure | npm test | NOT RUN | | | |
| API-68 | window rollover | npm test | NOT RUN | | | |
| CON-01 | concurrent stock 1 | npm test | NOT RUN | | | |
| CON-02 | concurrent stock 5 | npm test | NOT RUN | | | |
| CON-03 | lock ordering no deadlock | npm test | NOT RUN | | | |
| CON-04 | idempotent parallel | npm test | NOT RUN | | | |
| CON-05 | unique order numbers parallel | npm test | NOT RUN | | | |
| CON-06 | parallel register same email | npm test | NOT RUN | | | |
| CON-07 | advisory lock replay | npm test | NOT RUN | | | |
| CON-08 | diff bodies parallel | npm test | NOT RUN | | | |
| CON-09 | diff users same key | npm test | NOT RUN | | | |
| CON-10 | mixed load | npm test | NOT RUN | | | |
| CON-11 | login limiter parallel | npm test | NOT RUN | | | |
| CON-12 | login limiter near limit | npm test | NOT RUN | | | |
| CON-13 | login limiter success | npm test | NOT RUN | | | |
| SECT-01 | cookie attributes | npm test | NOT RUN | | | |
| SECT-02 | replay after logout | npm test | NOT RUN | | | |
| SECT-03 | session fixation | npm test | NOT RUN | | | |
| SECT-04 | origin guard | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** | 2026-11-02 | pending | 7/7 pass: rejects evil origin, null, cross-site, missing headers in prod, form types |
| SECT-05 | body size limit | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** | 2026-11-02 | pending | 2/2 pass: payload > 20 kB returns 413; malformed JSON returns 400 |
| SECT-06 | unknown fields rejected | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** | 2026-11-02 | pending | 1/1 pass: unknown body fields rejected with 400 VALIDATION_ERROR on strict schemas |
| SECT-07 | no CORS headers | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** | 2026-11-02 | pending | 1/1 pass: zero Access-Control-* headers emitted on any response |
| SECT-08 | no X-Powered-By; helmet | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** | 2026-11-02 | pending | 2/2 pass: X-Powered-By absent; helmet security headers present |
| SECT-09 | injection strings safe | npm test | NOT RUN | | | |
| SECT-10 | no stack in 500 | `node --env-file=.env.test --test --test-reporter=spec tests/api/security.test.js` | **PASS** | 2026-11-02 | pending | 1/1 pass: 500 internal error returns generic envelope without stack or SQL text |
| SECT-11 | nothing sensitive logged | npm test | NOT RUN | | | |
| SECT-12 | no password_hash in response | npm test | NOT RUN | | | |
| SECT-13 | order IDOR (see API-61) | npm test | NOT RUN | | | |
| SECT-14 | key_hash is digest | npm test | NOT RUN | | | |
| SECT-15 | limiter db fail -> 503 | npm test | NOT RUN | | | |
| SECT-16 | dummy bcrypt on unknown email | npm test | NOT RUN | | | |
| SECT-17 | token not in body/URL | npm test | NOT RUN | | | |
| SECT-18 | login deletes expired sessions | npm test | NOT RUN | | | |
| STAT-01 | no innerHTML in public/js | `node --env-file=.env.test --test --test-reporter=spec "tests/static/**/*.test.js"` | NOT RUN | | | Phase 7 |
| STAT-02 | no inline script in HTML | same | NOT RUN | | | Phase 7 |
| STAT-03 | no external URLs | same | NOT RUN | | | Phase 7 |
| STAT-04 | secret scan | same | NOT RUN | | | Phase 10 |
| STAT-05 | package.json structure | `node --env-file=.env.test --test --test-reporter=spec "tests/static/**/*.test.js"` | **PASS** | 2026-11-01 | pending | 17/17 tests pass |
| STAT-06 | npm audit | `npm audit --omit=dev` | NOT RUN (documented risk) | 2026-11-01 | | 4 high findings in @vercel/functions sub-dep chain accepted (see KI-01); not a clean pass |
| STAT-07 | .env.example sync | `node --env-file=.env.test --test --test-reporter=spec "tests/static/**/*.test.js"` | **PASS** | 2026-11-01 | pending | 11/11 tests pass |
| STAT-08 | no express.static in src | `node --env-file=.env.test --test --test-reporter=spec tests/static/code-rules.test.js` | **PASS** | 2026-11-02 | pending | 1/1 pass: express.static does not appear in any file in src/ |
| STAT-09 | localStorage keys | same | NOT RUN | | | Phase 7 |
| STAT-10 | target=_blank rel | same | NOT RUN | | | Phase 7 |
| STAT-11 | HTML structure | same | NOT RUN | | | Phase 7 |
| STAT-12 | no payment keywords | same | NOT RUN | | | Phase 7 |
| STAT-13 | DB access rules | `node --env-file=.env.test --test --test-reporter=spec tests/static/db-rules.test.js` | **PASS** | 2026-11-02 | pending | 3/3 pass: no setTypeParser or parseInt8; @vercel/functions imported only in src/db/pool.js; new Pool( only in allowed modules |
| STAT-14 | font assets | same | NOT RUN | | | Phase 7 |
| MAN-01 | full purchase desktop | manual | NOT RUN | | | |
| MAN-02 | purchase 360px | manual | NOT RUN | | | |
| MAN-03 | purchase 768px | manual | NOT RUN | | | |
| MAN-04 | search/category/sort | manual | NOT RUN | | | |
| MAN-05 | cart persistence | manual | NOT RUN | | | |
| MAN-06 | two tabs cart badge | manual | NOT RUN | | | |
| MAN-07 | stock display | manual | NOT RUN | | | |
| MAN-08 | empty states | manual | NOT RUN | | | |
| MAN-09 | form validation messages | manual | NOT RUN | | | |
| MAN-10 | loading states | manual | NOT RUN | | | |
| MAN-11 | error states offline | manual | NOT RUN | | | |
| MAN-12 | keyboard navigation | manual | NOT RUN | | | |
| MAN-13 | screen reader | manual | NOT RUN | | | |
| MAN-14 | 200% zoom reflow | manual | NOT RUN | | | |
| MAN-15 | reduced motion | manual | NOT RUN | | | |
| MAN-16 | contrast tokens | manual | NOT RUN | | | |
| MAN-17 | touch targets | manual | NOT RUN | | | |
| MAN-18 | Lighthouse mobile | manual | NOT RUN | | | |
| MAN-19 | fresh-clone run | manual | NOT RUN | | | |
| MAN-20 | rupee glyph in fonts | manual | NOT RUN | | | Phase 7 |
| MAN-21 | hero hotspots | manual | NOT RUN | | | |
| MAN-22 | demo notice visible | manual | NOT RUN | | | |
| MAN-23 | order in Neon console | manual | NOT RUN | | | |
| MAN-24 | guest/protected redirect | manual | NOT RUN | | | |
| MAN-25 | Windows+POSIX portability | manual | NOT RUN | | | Phase 1+ (Windows verified; POSIX pending) |
| DEP-01 | deploy without error | manual+Vercel | NOT RUN | | | |
| DEP-02 | static cache headers | manual+curl | NOT RUN | | | |
| DEP-03 | cleanUrls pages | manual+curl | NOT RUN | | | |
| DEP-04 | /api/products | manual+curl | NOT RUN | | | |
| DEP-05 | /api/health?deep=1 | manual+curl | NOT RUN | | | |
| DEP-06 | 404 pages | manual+curl | NOT RUN | | | |
| DEP-07 | security headers | manual+curl | NOT RUN | | | |
| DEP-08 | __Host- cookie on Vercel | manual+browser | NOT RUN | | | |
| DEP-09 | order placed on deployed | manual | NOT RUN | | | |
| DEP-10 | env vars no secrets in code | manual | NOT RUN | | | |
| DEP-11 | preview writes preview branch | manual+Neon | NOT RUN | | | |
| DEP-12 | req.ip on Vercel | manual+log | NOT RUN | | | |
| DEP-13 | function logs no secrets | manual+log | NOT RUN | | | |
| DEP-14 | first-request latency | manual+log | NOT RUN | | | |
| DEP-15 | no CSP violation | manual+browser | NOT RUN | | | |
| DEP-16 | Lighthouse deployed | manual | NOT RUN | | | |
| DEP-17 | db_pool_attached logged | manual+log | NOT RUN | | | |
| DEP-18 | idempotency on pooled | manual+script | NOT RUN | | | |
| DEP-19 | login limiter on deployment | manual+script | NOT RUN | | | |

## Acceptance criteria (derived)
| AC | Requirement (short) | Mapped tests | Status |
|---|---|---|---|
| AC-1 | Shop lists seeded products | API-04, DB-05, MAN-04 | NOT RUN |
| AC-2 | Pagination works | API-04, API-05, API-17, MAN-04 | NOT RUN |
| AC-3 | Search works | API-07, API-08, API-09, API-10, MAN-04 | NOT RUN |
| AC-4 | Category filter | API-11, MAN-04 | NOT RUN |
| AC-5 | Sort options | API-12, API-13, MAN-04 | NOT RUN |
| AC-6 | URL reflects filters | MAN-04 | NOT RUN |
| AC-7 | Empty states | MAN-08 | NOT RUN |
| AC-8 | Stock status display | API-15, API-24, MAN-07 | NOT RUN |
| AC-9 | Product detail | API-19, MAN-01 | NOT RUN |
| AC-10 | Product not found | API-20, MAN-08 | NOT RUN |
| AC-11 | Max qty from stock | API-15, API-26, MAN-01 | NOT RUN |
| AC-12 | Cart persists | MAN-01, MAN-06 | NOT RUN |
| AC-13 | Low-stock warning | API-15, MAN-07 | NOT RUN |
| AC-14 | Cart local storage | UT-12, STAT-09, MAN-05 | NOT RUN |
| AC-15 | Cart tab sync | MAN-05 | NOT RUN |
| AC-16 | Cart corrupt reset | UT-12, MAN-05 | NOT RUN |
| AC-17 | Merge duplicate lines | API-22, MAN-01 | NOT RUN |
| AC-18 | Cart totals in INR | API-21, API-64, MAN-01 | NOT RUN |
| AC-19 | Cart issue messages | API-23, API-24, API-25, MAN-07 | NOT RUN |
| AC-20 | Cart qty capped | UT-12, MAN-05 | NOT RUN |
| AC-21 | Cart empty state | MAN-08 | NOT RUN |
| AC-22 | Register validation | UT-04, API-33, API-41, MAN-09 | NOT RUN |
| AC-23 | Email unique | API-34, CON-06 | NOT RUN |
| AC-24 | Password hashed | API-32, SECT-12 | NOT RUN |
| AC-25 | Session cookie | API-31, SECT-01, DEP-08 | NOT RUN |
| AC-26 | Identical login errors | API-37 | NOT RUN |
| AC-27 | Auth state restored | API-39, MAN-01 | NOT RUN |
| AC-28 | Logout works | API-40, SECT-02 | NOT RUN |
| AC-29 | Protected redirect | MAN-24 | NOT RUN |
| AC-30 | Orders need auth | UT-10, API-44, API-63, MAN-24 | NOT RUN |
| AC-31 | Order validates cart | API-44, API-50, MAN-24 | NOT RUN |
| AC-32 | Order uses DB prices | API-46, API-47, API-48, API-65 | NOT RUN |
| AC-33 | Shipping validation | UT-06, API-53, MAN-09 | NOT RUN |
| AC-34 | Order transactional | API-46, API-65, DB-09, API-59 | NOT RUN |
| AC-35 | Price snapshot | API-62, DB-02 | NOT RUN |
| AC-36 | Stock decrements | API-46, API-52, CON-01, CON-02, CON-10 | NOT RUN |
| AC-37 | Idempotent order | API-54, CON-04, CON-07, CON-08, MAN-01 | NOT RUN |
| AC-38 | Confirmation page | MAN-01 | NOT RUN |
| AC-39 | Order error handling | API-59, MAN-11 | NOT RUN |
| AC-40 | Demo notice | MAN-22, STAT-12 | NOT RUN |
| AC-41 | Order history | API-60, MAN-01 | NOT RUN |
| AC-42 | Order IDOR | API-61, SECT-13 | NOT RUN |
| AC-43 | Order not found | MAN-08 | NOT RUN |
| AC-44 | Responsive design | MAN-01, MAN-02, MAN-03 | NOT RUN |
| AC-45 | Mobile accessibility | MAN-02, MAN-12 | NOT RUN |
| AC-46 | Touch targets | MAN-12, MAN-17 | NOT RUN |
| AC-47 | Form accessibility | MAN-09, MAN-12, STAT-11 | NOT RUN |
| AC-48 | Colour contrast | MAN-13, MAN-16, STAT-11 | NOT RUN |
| AC-49 | Reduced motion | MAN-15 | NOT RUN |
| AC-50 | Loading and error states | MAN-10, MAN-11 | NOT RUN |
| AC-51 | Deployed on Vercel | DEP-01, DEP-09, DEP-17, DEP-18 | NOT RUN |
| AC-52 | Reproducible setup | MAN-19, MAN-25 | NOT RUN |
| AC-53 | No secrets in code | STAT-04, DEP-10 | NOT RUN |
| AC-54 | Seed data correct | DB-06, DB-07 | NOT RUN |
| AC-55 | Lighthouse score | MAN-18, DEP-16 | NOT RUN |

## Known issues
| ID | Description | Impact | Decision |
|---|---|---|---|
| KI-01 | `npm audit --omit=dev` shows 4 high findings in `@vercel/functions` sub-dependency chain (zod <4.6.6). Our own zod 3.x is not affected. | Low — no application code path reaches the vulnerable zod 4.x code. | Accept; revisit if @vercel/functions releases a fix. |
| KI-02 | `engines.node` specifies 22.x but local Node is 26.8.2. npm warns EBADENGINE. | None — Node 26 is fully compatible; the requirement is for the Vercel deployment target. | Accept; Vercel deployment will use Node 22. |
| KI-03 | PostgreSQL SSL-mode compatibility warning emitted by `pg` on connect (`SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'`). | None — known upstream pg warning preparing for pg v9 / pg-connection-string v3; SSL connections succeed and tests pass. | Accept as known warning; not a test failure. |

## Decisions and deviations
| Date | Decision | Reason |
|---|---|---|
| 2026-11-01 | Phase 0 implemented: scaffold, package.json, config, env examples, STATUS.md, UT-11, STAT-05, STAT-07 | Per implementation order section 10 |
| 2026-11-01 | zod ^3.24.4 chosen (not 4.x) | Application schema API is zod 3.x; 4.x is a breaking change. @vercel/functions uses zod 4.x internally; documented in KI-01 |
| 2026-11-02 | Fixed .env.test BOM encoding and direct endpoint URL; updated DB-03 assertions to accept PostgreSQL 23001 (restrict_violation) alongside 23503 for ON DELETE RESTRICT | Corrected configuration and standard PostgreSQL RESTRICT error code; all Phase 1 DB gate tests DB-01..DB-08, DB-11..DB-13 pass |
| 2026-11-02 | Phase 2 implemented: createApp, src/lib/numbers.js, src/db/pool.js, requestId, logging, errorHandler, originGuard, health routes, vercel.json, scripts/dev-server.js | Per implementation order §10 Phase 2. Local gate tests UT-13, UT-14, API-01, API-02, SECT-04..SECT-08, SECT-10, STAT-08, STAT-13 all PASS (224/224 tests in full runner) |
