/**
 * tests/helpers/db.js
 *
 * Database test helpers (§7.6, §8.1).
 *
 * assertSafeTestDatabase() — called by every test file's before hook.
 *   Exits the process with code 1 (without connecting) if any safety condition
 *   is not met. The same six checks as in scripts/test-db-reset.js.
 *
 * getTestClient() — returns a connected pg.Client using TEST_DATABASE_URL.
 *
 * resetTestDb(client) — per-file hygiene: truncates transient tables,
 *   restarts order_number_seq at 100001, and restores seeded stock levels.
 */

import pg from 'pg';
import { products } from '../../db/seeds/catalog.js';

const { Client } = pg;

/**
 * Parse host and dbname from a connection string (no credentials exposed).
 * @param {string} cs
 * @returns {{ host: string, dbname: string } | null}
 */
function parseHostDb(cs) {
  try {
    const u = new URL(cs);
    return { host: u.hostname, dbname: u.pathname.replace(/^\//, '') || '' };
  } catch {
    return null;
  }
}

/**
 * Enforce all six safety conditions from §7.6.
 * Exits the process with code 1 if any condition fails.
 * Does NOT connect to any database.
 */
export function assertSafeTestDatabase() {
  const env = process.env;

  // 1. NODE_ENV must be 'test'.
  if (env.NODE_ENV !== 'test') {
    console.error(
      `assertSafeTestDatabase: NODE_ENV="${env.NODE_ENV}" — must be "test". ` +
        'Ensure the test runner loads only .env.test.',
    );
    process.exit(1);
  }

  // 2. TEST_DATABASE_URL must be set, a valid postgres URL, and non-pooler.
  const testUrl = env.TEST_DATABASE_URL;
  if (!testUrl) {
    console.error(
      'assertSafeTestDatabase: TEST_DATABASE_URL is not set. ' +
        'Fill in .env.test with a direct Neon test-branch URL.',
    );
    process.exit(1);
  }
  if (!/^postgres(ql)?:\/\//.test(testUrl)) {
    console.error(
      'assertSafeTestDatabase: TEST_DATABASE_URL must start with postgres:// or postgresql://.',
    );
    process.exit(1);
  }
  const testParsed = parseHostDb(testUrl);
  if (!testParsed) {
    console.error('assertSafeTestDatabase: TEST_DATABASE_URL cannot be parsed as a URL.');
    process.exit(1);
  }
  if (testParsed.host.includes('-pooler')) {
    console.error(
      `assertSafeTestDatabase: TEST_DATABASE_URL host "${testParsed.host}" contains -pooler. ` +
        'Tests must use a direct (non-pooled) connection.',
    );
    process.exit(1);
  }

  // 3. TEST_DB_DISPOSABLE must equal 'yes'.
  if (env.TEST_DB_DISPOSABLE !== 'yes') {
    console.error(
      'assertSafeTestDatabase: TEST_DB_DISPOSABLE must equal "yes". ' +
        'Set it in .env.test after confirming the target is a disposable Neon branch.',
    );
    process.exit(1);
  }

  // 4. Test target must differ from DATABASE_URL and DATABASE_URL_UNPOOLED (if set).
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
    const devUrl = env[key];
    if (!devUrl) continue;
    const devParsed = parseHostDb(devUrl);
    if (!devParsed) continue;
    if (devParsed.host === testParsed.host && devParsed.dbname === testParsed.dbname) {
      console.error(
        `assertSafeTestDatabase: TEST_DATABASE_URL points at the same host and database ` +
          `as ${key} (${testParsed.host}/${testParsed.dbname}). ` +
          'These must be separate Neon branches.',
      );
      process.exit(1);
    }
  }

  // 5. VERCEL must not be set.
  if (env.VERCEL !== undefined) {
    console.error(
      'assertSafeTestDatabase: VERCEL environment variable is set. ' +
        'Tests must not run on a Vercel deployment.',
    );
    process.exit(1);
  }

  // Print target without credentials.
  console.log(`assertSafeTestDatabase: target ${testParsed.host}/${testParsed.dbname}`);
}

/**
 * Create and connect a new pg.Client using TEST_DATABASE_URL.
 * Call assertSafeTestDatabase() before using this.
 *
 * @returns {Promise<import('pg').Client>}
 */
export async function getTestClient() {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  return client;
}

/**
 * Per-file hygiene (§7.6):
 *  - Truncates users, sessions, orders, order_items, rate_limits with CASCADE.
 *  - Restarts IDENTITY sequences on those tables.
 *  - Restarts order_number_seq at 100001.
 *  - Restores the seeded stock levels for every product in the catalogue.
 *
 * Call this inside the before hook of every database test file.
 *
 * @param {import('pg').Client} client  A connected test client.
 */
export async function resetTestDb(client) {
  // Truncate and restart sequences for transient data.
  await client.query(`
    TRUNCATE users, sessions, orders, order_items, rate_limits RESTART IDENTITY CASCADE
  `);

  // Restart the order-number sequence.
  await client.query(`ALTER SEQUENCE order_number_seq RESTART WITH 100001`);

  // Restore stock levels to the catalogue values.
  // Build a parameterised multi-row update using a VALUES list.
  const stockValues = products
    .map((p) => `('${p.slug}'::text, ${p.stock_quantity}::integer)`)
    .join(', ');

  await client.query(`
    UPDATE products p
       SET stock_quantity = v.qty
      FROM (VALUES ${stockValues}) AS v(slug, qty)
     WHERE p.slug = v.slug
  `);
}

