/**
 * scripts/migrate.js
 *
 * Migration runner.
 *
 * Usage:
 *   node --env-file=.env scripts/migrate.js          (dev/prod: reads DATABASE_URL_UNPOOLED)
 *   import { runMigrations } from './scripts/migrate.js'  (test-db-reset uses this)
 *
 * Rules (§7.3):
 *  - Reads DATABASE_URL_UNPOOLED. Refuses if host contains -pooler.
 *  - Prints target as host/dbname only.
 *  - Creates schema_migrations table if missing.
 *  - Takes a session advisory lock so two runs cannot overlap.
 *  - Applies unapplied db/migrations/*.sql files in filename order.
 *  - Each file runs in its own transaction with its schema_migrations row.
 *  - Aborts if an applied file's checksum differs.
 *  - Running twice is a no-op.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');

/**
 * Compute SHA-256 hex digest of text content.
 * @param {string} content
 * @returns {string}
 */
function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Run all pending migrations against the given connection string.
 * Safe to call from test-db-reset.js (after the schema has been dropped).
 *
 * @param {string} connectionString  Direct (non-pooled) Neon connection string.
 * @returns {Promise<void>}
 */
export async function runMigrations(connectionString) {
  // Safety: refuse to run against a pooler endpoint.
  let host;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    throw new Error('migrate: invalid connection string (cannot parse URL)');
  }
  if (host.includes('-pooler')) {
    throw new Error(
      `migrate: refusing to run against a pooled host (${host}). ` +
        'Use the direct (unpooled) connection string.',
    );
  }

  // Print target without credentials.
  let dbname;
  try {
    dbname = new URL(connectionString).pathname.replace(/^\//, '') || '(default)';
  } catch {
    dbname = '(unknown)';
  }
  console.log(`migrate: target ${host}/${dbname}`);

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // Create the migrations tracking table if it does not exist.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Take a session-level advisory lock (lock id 1) to prevent overlapping runs.
    await client.query('SELECT pg_advisory_lock(1)');

    try {
      // Discover migration files.
      let files;
      try {
        files = await readdir(MIGRATIONS_DIR);
      } catch {
        throw new Error(`migrate: cannot read migrations directory ${MIGRATIONS_DIR}`);
      }
      const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

      if (sqlFiles.length === 0) {
        console.log('migrate: no migration files found');
        return;
      }

      // Load already-applied checksums.
      const { rows: applied } = await client.query(
        'SELECT filename, checksum FROM schema_migrations ORDER BY filename',
      );
      const appliedMap = new Map(applied.map((r) => [r.filename, r.checksum]));

      let appliedCount = 0;
      let skippedCount = 0;

      for (const filename of sqlFiles) {
        const filePath = resolve(MIGRATIONS_DIR, filename);
        const content = await readFile(filePath, 'utf8');
        const checksum = sha256(content);

        if (appliedMap.has(filename)) {
          const storedChecksum = appliedMap.get(filename);
          if (storedChecksum !== checksum) {
            throw new Error(
              `migrate: checksum mismatch for already-applied migration "${filename}". ` +
                'Applied migrations must not be edited. Create a new numbered migration instead.',
            );
          }
          skippedCount++;
          continue;
        }

        // Apply in a transaction together with the schema_migrations row.
        console.log(`migrate: applying ${filename}`);
        await client.query('BEGIN');
        try {
          await client.query(content);
          await client.query(
            'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
            [filename, checksum],
          );
          await client.query('COMMIT');
          appliedCount++;
        } catch (err) {
          await client.query('ROLLBACK');
          throw new Error(`migrate: failed to apply "${filename}": ${err.message}`);
        }
      }

      if (appliedCount === 0 && skippedCount === sqlFiles.length) {
        console.log('migrate: nothing to apply (all migrations already applied)');
      } else {
        console.log(`migrate: applied ${appliedCount} migration(s), skipped ${skippedCount}`);
      }
    } finally {
      // Always release the advisory lock.
      await client.query('SELECT pg_advisory_unlock(1)');
    }
  } finally {
    await client.end();
  }
}

// Run directly when invoked as a script.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    console.error('migrate: DATABASE_URL_UNPOOLED is not set');
    process.exit(1);
  }
  runMigrations(connectionString).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

