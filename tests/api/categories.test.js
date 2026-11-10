/**
 * tests/api/categories.test.js
 *
 * API-03, API-14, API-16, API-18, API-64: Categories endpoint tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startTestServer } from '../helpers/server.js';
import { assertSafeTestDatabase, getTestClient, resetTestDb } from '../helpers/db.js';
import { loadTestConfig } from '../helpers/config.js';

const { Pool } = pg;

assertSafeTestDatabase();

describe('Categories API (API-03, API-14, API-16, API-18, API-64)', () => {
  let testEnv;
  let pool;
  let client;

  before(async () => {
    client = await getTestClient();
    await resetTestDb(client);

    const config = loadTestConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    testEnv = await startTestServer({ config, pool });
  });

  after(async () => {
    await testEnv.close();
    await pool.end();
    await client.end();
  });

  it('API-03 & API-14: returns 5 categories in sort order with active product counts only', async () => {
    const res = await testEnv.request('/api/categories');
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.items));
    assert.equal(data.items.length, 5);

    // Verify sort order and category slugs
    const expectedSlugs = [
      'desk-mats',
      'charging-cables',
      'stands-risers',
      'lighting',
      'organizers',
    ];
    const actualSlugs = data.items.map((c) => c.slug);
    assert.deepEqual(actualSlugs, expectedSlugs);

    // desk-mats has 5 total products, but 1 is inactive -> productCount must be 4
    const deskMats = data.items.find((c) => c.slug === 'desk-mats');
    assert.equal(deskMats.productCount, 4);

    // Other categories each have 4 active products
    for (const cat of data.items) {
      assert.equal(cat.productCount, 4);
    }
  });

  it('API-16: returns only documented public fields (no internal database columns)', async () => {
    const res = await testEnv.request('/api/categories');
    const data = await res.json();

    const allowedFields = new Set(['id', 'slug', 'name', 'productCount', 'image']);

    for (const cat of data.items) {
      const keys = Object.keys(cat);
      for (const k of keys) {
        assert.ok(
          allowedFields.has(k),
          `Category DTO contains forbidden or undocumented internal field "${k}"`,
        );
      }

      // Explicitly check internal columns are absent
      assert.equal(cat.sort_order, undefined);
      assert.equal(cat.created_at, undefined);
      assert.equal(cat.updated_at, undefined);
      assert.equal(cat.image_url, undefined);
    }
  });

  it('API-18: Cache-Control is public, s-maxage=30, stale-while-revalidate=60', async () => {
    const res = await testEnv.request('/api/categories');
    assert.equal(
      res.headers.get('cache-control'),
      'public, s-maxage=30, stale-while-revalidate=60',
    );
  });

  it('API-64: all numeric fields are JSON numbers for which Number.isSafeInteger is true', async () => {
    const res = await testEnv.request('/api/categories');
    const data = await res.json();

    for (const cat of data.items) {
      assert.equal(typeof cat.id, 'number');
      assert.ok(Number.isSafeInteger(cat.id));
      assert.ok(cat.id > 0);

      assert.equal(typeof cat.productCount, 'number');
      assert.ok(Number.isSafeInteger(cat.productCount));
      assert.ok(cat.productCount >= 0);
    }
  });

  it('rejects repeated query parameters with 400 VALIDATION_ERROR (Contract 4.1)', async () => {
    const res = await testEnv.request('/api/categories?foo=1&foo=2');
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.fields.foo);
    assert.ok(body.error.requestId);
  });
});

