/**
 * scripts/test-db-reset.js
 *
 * Resets the test database: drops and recreates the public schema,
 * runs all migrations, then runs the seed.
 *
 * Loaded via: node --env-file=.env.test scripts/test-db-reset.js
 *
 * The same safety checks as assertSafeTestDatabase() (tests/helpers/db.js)
 * are applied here, independently, before any database connection is made.
 *
 * Rules (§7.6):
 *  - Reads TEST_DATABASE_URL (not DATABASE_URL).
 *  - Checks all six safety conditions before connecting.
 *  - Drops and recreates the public schema.
 *  - Runs runMigrations() then runSeed() against TEST_DATABASE_URL.
 *  - Never reads DATABASE_URL for anything other than the host/dbname comparison.
 *  - Exits 1 without connecting if any check fails.
 */

import pg from 'pg';
import { runMigrations } from './migrate.js';
import { runSeed } from './seed.js';

const { Client } = pg;

/**
 * Parse host and dbname from a connection string without credentials.
 * Returns null if parsing fails.
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

function runSafetyChecks() {
  const env = process.env;

  // 1. NODE_ENV must be 'test'.
  if (env.NODE_ENV !== 'test') {
    console.error(
      `test-db-reset: refusing to run — NODE_ENV is "${env.NODE_ENV}", expected "test". ` +
        'Load only .env.test and ensure NODE_ENV=test.',
    );
    process.exit(1);
  }

  // 2. TEST_DATABASE_URL must be set, valid, and non-pooler.
  const testUrl = env.TEST_DATABASE_URL;
  if (!testUrl) {
    console.error(
      'test-db-reset: refusing to run — TEST_DATABASE_URL is not set in .env.test.',
    );
    process.exit(1);
  }
  if (!/^postgres(ql)?:\/\//.test(testUrl)) {
    console.error(
      'test-db-reset: refusing to run — TEST_DATABASE_URL must start with postgres:// or postgresql://.',
    );
    process.exit(1);
  }
  const testParsed = parseHostDb(testUrl);
  if (!testParsed) {
    console.error('test-db-reset: refusing to run — TEST_DATABASE_URL cannot be parsed.');
    process.exit(1);
  }
  if (testParsed.host.includes('-pooler')) {
    console.error(
      `test-db-reset: refusing to run — TEST_DATABASE_URL host "${testParsed.host}" contains -pooler. ` +
        'Use a direct (non-pooled) connection string for the test database.',
    );
    process.exit(1);
  }

  // 3. TEST_DB_DISPOSABLE must equal 'yes'.
  if (env.TEST_DB_DISPOSABLE !== 'yes') {
    console.error(
      'test-db-reset: refusing to run — TEST_DB_DISPOSABLE must equal "yes". ' +
        'Set it in .env.test only after confirming that the Neon branch is a disposable test branch.',
    );
    process.exit(1);
  }

  // 4. If DATABASE_URL or DATABASE_URL_UNPOOLED are set in the environment,
  //    the test target's host AND dbname must differ from both.
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
    const devUrl = env[key];
    if (!devUrl) continue;
    const devParsed = parseHostDb(devUrl);
    if (!devParsed) continue;
    if (
      devParsed.host === testParsed.host &&
      devParsed.dbname === testParsed.dbname
    ) {
      console.error(
        `test-db-reset: refusing to run — TEST_DATABASE_URL points at the same host and ` +
          `database as ${key} (${testParsed.host}/${testParsed.dbname}). ` +
          'The test database must be a separate Neon branch.',
      );
      process.exit(1);
    }
  }

  // 5. VERCEL must not be set.
  if (env.VERCEL !== undefined) {
    console.error(
      'test-db-reset: refusing to run — VERCEL environment variable is set. ' +
        'The test database reset must not run on a Vercel deployment.',
    );
    process.exit(1);
  }

  // Print target (no credentials).
  console.log(`test-db-reset: target ${testParsed.host}/${testParsed.dbname}`);

  return testUrl;
}

async function main() {
  const testUrl = runSafetyChecks();

  // Drop and recreate the public schema to start from a clean slate.
  console.log('test-db-reset: dropping public schema and recreating it...');
  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    console.log('test-db-reset: schema reset done');
  } finally {
    await client.end();
  }

  // Run migrations against the fresh schema.
  await runMigrations(testUrl);

  // Seed the fresh database.
  await runSeed(testUrl, { resetStock: true });

  console.log('test-db-reset: complete');
}

main().catch((err) => {
  console.error('test-db-reset:', err.message);
  process.exit(1);
});

