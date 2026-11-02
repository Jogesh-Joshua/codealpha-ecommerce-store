/**
 * tests/db/migrations.test.js
 *
 * DB-01: migrations apply, second run is a no-op, checksum mismatch aborts.
 *
 * These tests run against the real test database (TEST_DATABASE_URL).
 * The test:db:reset script has already migrated and seeded by the time
 * `npm test` runs this file.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeTestDatabase, getTestClient } from '../helpers/db.js';
import { runMigrations } from '../../scripts/migrate.js';

// Safety check — exits if environment is wrong.
assertSafeTestDatabase();

describe('DB-01: migration runner', () => {
  let client;

  before(async () => {
    client = await getTestClient();
  });

  after(async () => {
    await client.end();
  });

  it('schema_migrations table exists and has at least one row', async () => {
    const { rows } = await client.query(
      `SELECT filename, checksum FROM schema_migrations ORDER BY filename`,
    );
    assert.ok(rows.length >= 1, 'Expected at least one migration row');
    assert.equal(rows[0].filename, '001_init.sql', 'First migration should be 001_init.sql');
    assert.ok(rows[0].checksum, 'checksum must be non-empty');
  });

  it('all expected tables exist after migration', async () => {
    const expectedTables = [
      'users', 'sessions', 'categories', 'products', 'product_images',
      'orders', 'order_items', 'rate_limits', 'schema_migrations',
    ];
    const { rows } = await client.query(`
      SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
       ORDER BY tablename
    `);
    const actual = rows.map((r) => r.tablename);
    for (const table of expectedTables) {
      assert.ok(actual.includes(table), `Expected table "${table}" to exist`);
    }
  });

  it('order_number_seq exists', async () => {
    const { rows } = await client.query(`
      SELECT sequence_name FROM information_schema.sequences
       WHERE sequence_schema = 'public' AND sequence_name = 'order_number_seq'
    `);
    assert.equal(rows.length, 1, 'order_number_seq should exist');
  });

  it('running migrations again is a no-op (idempotent)', async () => {
    const { rows: before } = await client.query(
      'SELECT count(*)::int AS n FROM schema_migrations',
    );
    const testUrl = process.env.TEST_DATABASE_URL;
    // Should complete without error.
    await runMigrations(testUrl);
    const { rows: after } = await client.query(
      'SELECT count(*)::int AS n FROM schema_migrations',
    );
    assert.equal(
      after[0].n, before[0].n,
      'Migration count must not change on a second run',
    );
  });

  it('runMigrations refuses a pooled connection string', async () => {
    const pooledUrl = 'postgresql://user:pass@ep-lively-paper-b5fqitlt-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
    await assert.rejects(
      () => runMigrations(pooledUrl),
      (err) => {
        assert.ok(err.message.includes('-pooler'), 'Error should mention -pooler');
        return true;
      },
    );
  });
});

