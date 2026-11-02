/**
 * tests/api/health.test.js
 *
 * API-01 and API-02: health endpoints.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startTestServer } from '../helpers/server.js';
import { assertSafeTestDatabase } from '../helpers/db.js';
import { loadTestConfig } from '../helpers/config.js';

const { Pool } = pg;

assertSafeTestDatabase();

describe('Health Endpoints (API-01, API-02)', () => {
  let testEnv;
  let pool;

  before(async () => {
    const config = loadTestConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    testEnv = await startTestServer({ config, pool });
  });

  after(async () => {
    await testEnv.close();
    await pool.end();
  });

  describe('API-01: GET /api/health (shallow)', () => {
    it('returns 200 with status "ok"', async () => {
      const res = await testEnv.request('/api/health');
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.deepEqual(body, { status: 'ok' });

      // No version, environment, host, or framework details
      assert.equal(body.version, undefined);
      assert.equal(body.node_version, undefined);
      assert.equal(body.environment, undefined);
      assert.equal(body.host, undefined);

      // Cache-Control: no-store (Contract 4.1)
      assert.equal(res.headers.get('cache-control'), 'no-store');

      // Request ID attached
      assert.ok(res.headers.get('x-request-id'));
    });
  });

  describe('API-02: GET /api/health?deep=1 (deep check)', () => {
    it('returns 200 with status "ok" and database "up" when pool is healthy', async () => {
      const res = await testEnv.request('/api/health?deep=1');
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.deepEqual(body, { status: 'ok', database: 'up' });
      assert.equal(res.headers.get('cache-control'), 'no-store');
    });

    it('returns 503 SERVICE_UNAVAILABLE when database pool is unreachable', async () => {
      // Mock an unreachable pool
      const brokenPool = {
        query: async () => {
          throw new Error('Connection refused');
        },
      };

      const brokenEnv = await startTestServer({ pool: brokenPool });
      try {
        const res = await brokenEnv.request('/api/health?deep=1');
        assert.equal(res.status, 503);

        const body = await res.json();
        assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
        assert.equal(body.error.message, 'Service temporarily unavailable. Please try again later.');
        assert.ok(body.error.requestId);
        assert.ok(!JSON.stringify(body).includes('Connection refused'));
      } finally {
        await brokenEnv.close();
      }
    });

    it('rejects duplicated query parameters with 400 VALIDATION_ERROR (Contract 4.1)', async () => {
      const res = await testEnv.request('/api/health?deep=1&deep=1');
      assert.equal(res.status, 400);

      const body = await res.json();
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.ok(body.error.fields.deep);
    });
  });
});

