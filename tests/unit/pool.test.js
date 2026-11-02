/**
 * tests/unit/pool.test.js
 *
 * UT-14: database pool creation and Vercel pool management (src/db/pool.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../../src/db/pool.js';
import { loadConfig } from '../../src/config.js';

function baseValidEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    TEST_DATABASE_URL: 'postgresql://neondb_owner:pass@ep-lively-paper-b5fqitlt.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require',
    DATABASE_URL: 'postgresql://user:pass@ep-dev-test.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require',
    STORE_CURRENCY: 'INR',
    SHIPPING_FLAT_MINOR: '9900',
    DB_POOL_MAX: '4',
    DB_POOL_IDLE_TIMEOUT_MS: '4000',
    DB_POOL_CONNECTION_TIMEOUT_MS: '6000',
    DB_STATEMENT_TIMEOUT_MS: '12000',
    ...overrides,
  };
}

describe('UT-14: createPool', () => {
  it('calls attachDatabasePool exactly once when onVercel is true and logs db_pool_attached', () => {
    const config = loadConfig(baseValidEnv({ VERCEL: '1' }));
    assert.equal(config.runtime.onVercel, true);

    let attachCalls = 0;
    let attachedPool = null;
    const logs = [];

    const pool = createPool({
      config,
      attachDatabasePool: (p) => {
        attachCalls++;
        attachedPool = p;
      },
      logSink: (msg) => logs.push(msg),
    });

    try {
      assert.equal(attachCalls, 1, 'attachDatabasePool must be called exactly once');
      assert.equal(attachedPool, pool, 'attachDatabasePool must receive the created pool');
      assert.ok(
        logs.some((l) => l.message === 'db_pool_attached'),
        'Must log db_pool_attached',
      );
    } finally {
      pool.end();
    }
  });

  it('does NOT call attachDatabasePool when onVercel is false', () => {
    const config = loadConfig(baseValidEnv({ VERCEL: undefined }));
    assert.equal(config.runtime.onVercel, false);

    let attachCalls = 0;
    const logs = [];

    const pool = createPool({
      config,
      attachDatabasePool: () => {
        attachCalls++;
      },
      logSink: (msg) => logs.push(msg),
    });

    try {
      assert.equal(attachCalls, 0, 'attachDatabasePool must not be called when onVercel is false');
      assert.ok(
        !logs.some((l) => l.message === 'db_pool_attached'),
        'Must not log db_pool_attached',
      );
    } finally {
      pool.end();
    }
  });

  it('passes configured pool options (max, idleTimeoutMillis, connectionTimeoutMillis, statement_timeout)', () => {
    const config = loadConfig(baseValidEnv());
    const pool = createPool({ config, logSink: () => {} });

    try {
      assert.equal(pool.options.max, 4);
      assert.equal(pool.options.idleTimeoutMillis, 4000);
      assert.equal(pool.options.connectionTimeoutMillis, 6000);
      assert.equal(pool.options.statement_timeout, 12000);
    } finally {
      pool.end();
    }
  });

  it('handles error event on the pool without throwing and logs code only', () => {
    const config = loadConfig(baseValidEnv());
    const logs = [];
    const pool = createPool({ config, logSink: (msg) => logs.push(msg) });

    try {
      const dummyErr = new Error('simulated idle error');
      dummyErr.code = '57P01';

      assert.doesNotThrow(() => {
        pool.emit('error', dummyErr);
      });

      const errLog = logs.find((l) => l.message === 'db_pool_client_error');
      assert.ok(errLog, 'Error listener must log an entry');
      assert.equal(errLog.code, '57P01');
      assert.ok(!JSON.stringify(errLog).includes('simulated idle error'));
    } finally {
      pool.end();
    }
  });
});

