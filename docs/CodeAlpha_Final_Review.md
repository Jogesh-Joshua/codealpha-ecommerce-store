# CodeAlpha_EcommerceStore: Final Review (revision 2)

Review of the final targeted correction pass. Specifications only. **No test, deployment check, or security check has been run or passed**; every status in `docs/STATUS.md` starts as `NOT RUN`.

Files updated in place (nothing regenerated): `CodeAlpha_Backend_Contract_Addendum.md`, `CodeAlpha_Spec_Reconciliation.md`. File created: this one.

## 1. Decisions changed

| # | Correction | Decision now in force | Where |
|---|---|---|---|
| 1 | Concurrent idempotency | Order creation is serialised per (user, idempotency key) by a transaction-scoped advisory lock taken **before** the idempotency lookup and before any stock check, at READ COMMITTED. Duplicates replay the original order (200) instead of returning `STOCK_CONFLICT`. Lock order: advisory lock, then products by ascending id. The unique constraint remains the backstop (one automatic re-check on `23505`) | Addendum 4A.1 (replaces contract 4.9 steps 3 to 5 and 11); DR-19 |
| 2 | Concurrent login limiting | Reserve a slot with one atomic upsert before any password work; above five: release and return 429 with no bcrypt; wrong password or unknown email keeps the slot; correct password releases it. Policy unchanged; the effect on simultaneous attempts is stated openly. No connection or lock is held during bcrypt | Addendum 6.5; DR-20 |
| 3 | `bigint` serialisation | No global type parsers. `toSafeMinor` and `toSafeCount` convert at the serialiser boundary, require non-negative safe integers, and fail as a generic 500 otherwise. Counts (`COUNT`, `SUM`) included. Order creation re-checks the arithmetic invariants before commit | Addendum 4A.2; DR-21 |
| 4 | Vercel pool management | `@vercel/functions` is an approved dependency, used only to call `attachDatabasePool` right after the module-level pool is created, on Vercel only. Pool settings are validated variables (`DB_POOL_MAX` 2 to 10, idle, connection, statement timeouts) | Addendum 4A.3, 5.1; DR-22 |
| 5 | Fonts | Font packages are a one-time acquisition tool, then removed. The repository keeps the WOFF2 files, licence texts, `public/fonts/README.md`, `fonts.css`, credits, and the ₹ glyph evidence | Addendum 7.9; DR-23 |
| 6 | GitHub visibility | The CodeAlpha PDF requires the prescribed repository name and the complete source code; it does not require public visibility. **Public is a portfolio recommendation.** Name requirement unchanged | Reconciliation section 5; DR-24 |
| 7 | Test configuration | Tests load only `.env.test` (`NODE_ENV=test`, no `DATABASE_URL`). `assertSafeTestDatabase()` requires `NODE_ENV=test`, a direct host, `TEST_DB_DISPOSABLE=yes`, a different host and database from the app's URLs, and no `VERCEL`. Scripts use only `--env-file`, `&&`, and quoted globs (Windows-safe) | Addendum 5.3a, 7.2, 7.6; DR-25 |

**Also fixed during review:** the addendum cited the session decision as DR-04 (it is DR-05); two tests that were defined but not wired into any phase gate (UT-08, SECT-10) are now in the phase table.

## 2. Final production dependency list (seven)

`express` (v5), `pg`, `bcryptjs`, `cookie-parser`, `helmet`, `zod`, `@vercel/functions`. No development dependencies. Font packages are never retained. Removed earlier: `jsonwebtoken`, `dotenv`, `nodemon`.

## 3. Tests added or changed

Total defined: **184** (14 unit, 13 database, 68 API, 13 concurrency, 18 security, 14 static, 25 manual, 19 deployment).

- **New:** UT-13, UT-14, DB-12, DB-13, API-64 to API-68, CON-07 to CON-13, STAT-13, STAT-14, MAN-25, DEP-17 to DEP-19.
- **Revised:** UT-11, DB-11, API-42, API-46, API-54, CON-03, CON-04, SECT-16, STAT-05, STAT-07, MAN-20, DEP-14.
- **Key proofs:** CON-07 (stock 1, five identical parallel requests: one 201, four 200 replays, zero `STOCK_CONFLICT`); CON-11 (20 parallel wrong logins: exactly five 401, fifteen 429, five bcrypt runs); API-64 to API-66 (numbers are JSON numbers; invariants hold; corrupt values give a generic 500); DB-13 (the pool really returns `bigint` as a string, so no global parser exists).

## 4. Consistency checks made on the documents

These are checks of the written specifications, not of any running software.

- All 184 test identifiers are defined once, with no gaps; every identifier used in the phase table or the AC mapping exists; every defined identifier appears in a phase or the AC mapping.
- The AC mapping still has 55 rows (AC-1 to AC-55) in order; AC-18, 32, 34, 36, 37, 51, 52 gained tests.
- Markdown tables in all three spec files have consistent column counts.
- The database schema (reconciliation 2.3) is **unchanged** and consistent with the corrections. The API field names, environment variables (5.1, 5.3, 5.3a), README contents (9.6), and the STATUS template (11.3) all name the same things.
- The word `cents` survives only in deliberate "reject the legacy field" statements.

## 5. Does the design addendum need regenerating?

**No.** Nothing in the seven corrections changes a page, component, token, route, or interaction in `Deskline_Design_Spec_Addendum.md`. Specifically:

- E7 already says one idempotency key per attempt, reused for retries; that matches the new lock-based behaviour (a retry after a 503 is safe).
- E6's 429 copy ("Too many sign-in attempts…") still fits the limiter.
- H.5 says to get the fonts through npm and copy the files into `public/fonts/`; that is the one-time acquisition in addendum 7.9 and does not say to keep the packages. The reconciliation precedence rule (DR-23) settles it.
- UD-09 hides the footer repository link until a URL exists; DR-24 is stricter (shown only when the repository is public), which is compatible.
- The design checklist and MAN-20 already cover the ₹ glyph.

Optional, not applied (two sentences if the owner wants the design file to say it itself): in H.5 add "The font packages are used once and are not kept as dependencies (backend addendum 7.9)"; in UD-09 add "and the repository is public".

## 6. Still open (unchanged by this pass)

Owner decisions: deadline and second CodeAlpha task, final store name, GitHub URL and visibility choice, imagery. Facts to verify on Vercel, each a `NOT RUN` row in `docs/STATUS.md`: `cleanUrls` page serving, `req.ip` and `X-Forwarded-For` contents, whether `vercel.json` headers reach API responses, the `attachDatabasePool` behaviour under load (DEP-17), and the ₹ glyph in both fonts.
