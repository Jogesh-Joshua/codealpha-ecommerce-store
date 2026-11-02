/**
 * tests/unit/config.test.js  —  UT-11
 *
 * Tests for src/config.js loadConfig(env).
 * Runs without a database: no env-file; we supply env objects directly.
 *
 * Coverage required by UT-11:
 *  - Fails on each missing or invalid variable, lists ALL failures, never prints values
 *  - STORE_CURRENCY other than INR fails
 *  - SHIPPING_FLAT_MINOR of 9950 fails (not a multiple of 100)
 *  - Production requires a __Host- cookie name and a pooled DATABASE_URL
 *  - With NODE_ENV=test a direct URL and the default cookie name are accepted
 *  - Pool variables outside their ranges fail (DB_POOL_MAX 1 fails, 2 passes)
 *  - VERCEL set gives runtime.onVercel true; unset gives false
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';

// ── Minimal valid env objects ─────────────────────────────────────────────

const VALID_DEV_ENV = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@host.region.aws.neon.tech/db?sslmode=require',
  DATABASE_URL_UNPOOLED: 'postgresql://user:pass@host.region.aws.neon.tech/db?sslmode=require',
  STORE_CURRENCY: 'INR',
  SHIPPING_FLAT_MINOR: '9900',
};

const VALID_TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@testhost.region.aws.neon.tech/testdb?sslmode=require',
  STORE_CURRENCY: 'INR',
  SHIPPING_FLAT_MINOR: '9900',
};

const VALID_PROD_ENV = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@host-pooler.region.aws.neon.tech/db?sslmode=require',
  SESSION_COOKIE_NAME: '__Host-deskline_session',
  STORE_CURRENCY: 'INR',
  SHIPPING_FLAT_MINOR: '9900',
};

// ── Helper ─────────────────────────────────────────────────────────────────

function loadFails(env, ...expectedSubstrings) {
  let err;
  try {
    loadConfig(env);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof Error, 'loadConfig should have thrown an Error');
  for (const sub of expectedSubstrings) {
    assert.ok(
      err.message.includes(sub),
      `Error message should include "${sub}" but got:\n${err.message}`,
    );
  }
  return err;
}

function loadSucceeds(env) {
  let cfg;
  assert.doesNotThrow(() => { cfg = loadConfig(env); }, 'loadConfig should not throw');
  return cfg;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('UT-11: loadConfig — basic success cases', () => {
  it('returns frozen config for a minimal valid development env', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.equal(cfg.nodeEnv, 'development');
    assert.equal(cfg.isProduction, false);
    assert.equal(cfg.isTest, false);
    assert.equal(cfg.storeCurrency, 'INR');
    assert.equal(cfg.shippingFlatMinor, 9900);
    assert.equal(Object.isFrozen(cfg), true);
    assert.equal(Object.isFrozen(cfg.db), true);
    assert.equal(Object.isFrozen(cfg.runtime), true);
  });

  it('returns frozen config for a minimal valid test env', () => {
    const cfg = loadSucceeds(VALID_TEST_ENV);
    assert.equal(cfg.nodeEnv, 'test');
    assert.equal(cfg.isTest, true);
  });

  it('returns frozen config for a minimal valid production env', () => {
    const cfg = loadSucceeds(VALID_PROD_ENV);
    assert.equal(cfg.isProduction, true);
  });

  it('exposes application constants (not env vars)', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.equal(cfg.maxQuantityPerLine, 10);
    assert.equal(cfg.maxCartLines, 50);
    assert.equal(cfg.lowStockThreshold, 5);
    assert.equal(cfg.bodyLimitBytes, 20480);
  });
});

describe('UT-11: loadConfig — NODE_ENV validation', () => {
  it('fails when NODE_ENV is missing', () => {
    const env = { ...VALID_DEV_ENV };
    delete env.NODE_ENV;
    loadFails(env, 'NODE_ENV');
  });

  it('fails when NODE_ENV is an unrecognised value', () => {
    loadFails({ ...VALID_DEV_ENV, NODE_ENV: 'staging' }, 'NODE_ENV');
  });

  it('lists all failures in one error (does not stop at first)', () => {
    const err = loadFails(
      { NODE_ENV: 'bad', STORE_CURRENCY: 'USD', SHIPPING_FLAT_MINOR: '9950' },
      'NODE_ENV', 'STORE_CURRENCY', 'SHIPPING_FLAT_MINOR',
    );
    // Must list multiple variables
    const count = (err.message.match(/NODE_ENV|STORE_CURRENCY|SHIPPING_FLAT_MINOR/g) || []).length;
    assert.ok(count >= 3, `Expected at least 3 variable mentions but got: ${err.message}`);
  });
});

describe('UT-11: loadConfig — DATABASE_URL validation', () => {
  it('fails when DATABASE_URL is missing', () => {
    const env = { ...VALID_DEV_ENV };
    delete env.DATABASE_URL;
    loadFails(env, 'DATABASE_URL');
  });

  it('fails when DATABASE_URL has wrong scheme', () => {
    loadFails({ ...VALID_DEV_ENV, DATABASE_URL: 'mysql://host/db' }, 'DATABASE_URL');
  });

  it('fails in production when DATABASE_URL has no -pooler in host', () => {
    loadFails(
      { ...VALID_PROD_ENV, DATABASE_URL: 'postgresql://user:pass@host.region.aws.neon.tech/db?sslmode=require' },
      'DATABASE_URL',
    );
  });

  it('fails in production when DATABASE_URL lacks sslmode=require', () => {
    loadFails(
      { ...VALID_PROD_ENV, DATABASE_URL: 'postgresql://user:pass@host-pooler.region.aws.neon.tech/db' },
      'DATABASE_URL',
    );
  });

  it('accepts a direct (non-pooler) URL in test mode', () => {
    // Direct URL (no -pooler) must be accepted in test mode
    const cfg = loadSucceeds({
      ...VALID_TEST_ENV,
      DATABASE_URL: 'postgresql://user:pass@testhost.region.aws.neon.tech/testdb?sslmode=require',
    });
    assert.ok(cfg.databaseUrl.includes('testhost'));
  });
});

describe('UT-11: loadConfig — STORE_CURRENCY', () => {
  it('fails when STORE_CURRENCY is missing', () => {
    const env = { ...VALID_DEV_ENV };
    delete env.STORE_CURRENCY;
    loadFails(env, 'STORE_CURRENCY');
  });

  it('fails when STORE_CURRENCY is USD', () => {
    loadFails({ ...VALID_DEV_ENV, STORE_CURRENCY: 'USD' }, 'STORE_CURRENCY');
  });

  it('fails when STORE_CURRENCY is EUR', () => {
    loadFails({ ...VALID_DEV_ENV, STORE_CURRENCY: 'EUR' }, 'STORE_CURRENCY');
  });

  it('accepts STORE_CURRENCY=INR', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.equal(cfg.storeCurrency, 'INR');
  });
});

describe('UT-11: loadConfig — SHIPPING_FLAT_MINOR', () => {
  it('fails when SHIPPING_FLAT_MINOR is missing', () => {
    const env = { ...VALID_DEV_ENV };
    delete env.SHIPPING_FLAT_MINOR;
    loadFails(env, 'SHIPPING_FLAT_MINOR');
  });

  it('fails when SHIPPING_FLAT_MINOR is 9950 (not a multiple of 100)', () => {
    loadFails({ ...VALID_DEV_ENV, SHIPPING_FLAT_MINOR: '9950' }, 'SHIPPING_FLAT_MINOR');
  });

  it('fails when SHIPPING_FLAT_MINOR is negative', () => {
    loadFails({ ...VALID_DEV_ENV, SHIPPING_FLAT_MINOR: '-100' }, 'SHIPPING_FLAT_MINOR');
  });

  it('fails when SHIPPING_FLAT_MINOR is a float', () => {
    loadFails({ ...VALID_DEV_ENV, SHIPPING_FLAT_MINOR: '99.5' }, 'SHIPPING_FLAT_MINOR');
  });

  it('accepts SHIPPING_FLAT_MINOR=0 (free shipping)', () => {
    const cfg = loadSucceeds({ ...VALID_DEV_ENV, SHIPPING_FLAT_MINOR: '0' });
    assert.equal(cfg.shippingFlatMinor, 0);
  });

  it('accepts SHIPPING_FLAT_MINOR=9900', () => {
    const cfg = loadSucceeds({ ...VALID_DEV_ENV, SHIPPING_FLAT_MINOR: '9900' });
    assert.equal(cfg.shippingFlatMinor, 9900);
  });
});

describe('UT-11: loadConfig — SESSION_COOKIE_NAME', () => {
  it('uses default deskline_session when unset in development', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.equal(cfg.sessionCookieName, 'deskline_session');
  });

  it('uses default deskline_session when unset in test mode', () => {
    const cfg = loadSucceeds(VALID_TEST_ENV);
    assert.equal(cfg.sessionCookieName, 'deskline_session');
  });

  it('fails when SESSION_COOKIE_NAME does not match pattern', () => {
    loadFails({ ...VALID_DEV_ENV, SESSION_COOKIE_NAME: 'ab' }, 'SESSION_COOKIE_NAME');
  });

  it('fails in production when SESSION_COOKIE_NAME does not start with __Host-', () => {
    loadFails(
      { ...VALID_PROD_ENV, SESSION_COOKIE_NAME: 'deskline_session' },
      'SESSION_COOKIE_NAME',
    );
  });

  it('accepts __Host- cookie name in production', () => {
    const cfg = loadSucceeds({ ...VALID_PROD_ENV, SESSION_COOKIE_NAME: '__Host-deskline_session' });
    assert.equal(cfg.sessionCookieName, '__Host-deskline_session');
  });

  it('accepts default cookie name in test mode (no __Host- required)', () => {
    const cfg = loadSucceeds(VALID_TEST_ENV);
    assert.equal(cfg.sessionCookieName, 'deskline_session');
  });
});

describe('UT-11: loadConfig — pool settings', () => {
  it('fails when DB_POOL_MAX is 1 (below minimum of 2)', () => {
    loadFails({ ...VALID_DEV_ENV, DB_POOL_MAX: '1' }, 'DB_POOL_MAX');
  });

  it('passes when DB_POOL_MAX is 2', () => {
    const cfg = loadSucceeds({ ...VALID_DEV_ENV, DB_POOL_MAX: '2' });
    assert.equal(cfg.db.poolMax, 2);
  });

  it('fails when DB_POOL_MAX is 11 (above maximum of 10)', () => {
    loadFails({ ...VALID_DEV_ENV, DB_POOL_MAX: '11' }, 'DB_POOL_MAX');
  });

  it('defaults DB_POOL_MAX to 5', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.equal(cfg.db.poolMax, 5);
  });

  it('fails when DB_POOL_IDLE_TIMEOUT_MS is 999 (below 1000)', () => {
    loadFails({ ...VALID_DEV_ENV, DB_POOL_IDLE_TIMEOUT_MS: '999' }, 'DB_POOL_IDLE_TIMEOUT_MS');
  });

  it('fails when DB_POOL_CONNECTION_TIMEOUT_MS is 30001 (above 30000)', () => {
    loadFails({ ...VALID_DEV_ENV, DB_POOL_CONNECTION_TIMEOUT_MS: '30001' }, 'DB_POOL_CONNECTION_TIMEOUT_MS');
  });

  it('fails when DB_STATEMENT_TIMEOUT_MS is 60001 (above 60000)', () => {
    loadFails({ ...VALID_DEV_ENV, DB_STATEMENT_TIMEOUT_MS: '60001' }, 'DB_STATEMENT_TIMEOUT_MS');
  });

  it('populates the db group with parsed integers', () => {
    const cfg = loadSucceeds({
      ...VALID_DEV_ENV,
      DB_POOL_MAX: '3',
      DB_POOL_IDLE_TIMEOUT_MS: '2000',
      DB_POOL_CONNECTION_TIMEOUT_MS: '3000',
      DB_STATEMENT_TIMEOUT_MS: '8000',
    });
    assert.equal(cfg.db.poolMax, 3);
    assert.equal(cfg.db.idleTimeoutMs, 2000);
    assert.equal(cfg.db.connectionTimeoutMs, 3000);
    assert.equal(cfg.db.statementTimeoutMs, 8000);
  });
});

describe('UT-11: loadConfig — VERCEL / runtime.onVercel', () => {
  it('sets runtime.onVercel=true when VERCEL is set to any value', () => {
    const cfg = loadSucceeds({ ...VALID_PROD_ENV, VERCEL: '1' });
    assert.equal(cfg.runtime.onVercel, true);
  });

  it('sets runtime.onVercel=false when VERCEL is absent', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.equal(cfg.runtime.onVercel, false);
  });
});

describe('UT-11: loadConfig — error messages never contain values', () => {
  it('error message does not include the bad value string', () => {
    const err = loadFails(
      { ...VALID_DEV_ENV, STORE_CURRENCY: 'SEKRET_VALUE_XYZ' },
      'STORE_CURRENCY',
    );
    assert.ok(
      !err.message.includes('SEKRET_VALUE_XYZ'),
      `Error message must not contain variable value but got:\n${err.message}`,
    );
  });

  it('error message does not include the DATABASE_URL value', () => {
    const err = loadFails(
      { ...VALID_DEV_ENV, DATABASE_URL: 'mysql://SEKRET_HOST/db' },
      'DATABASE_URL',
    );
    assert.ok(
      !err.message.includes('SEKRET_HOST'),
      `Error must not leak DATABASE_URL value but got:\n${err.message}`,
    );
  });
});

describe('UT-11: loadConfig — ORDER_NUMBER_PREFIX', () => {
  it('defaults to DL', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.equal(cfg.orderNumberPrefix, 'DL');
  });

  it('accepts 2-letter prefix', () => {
    const cfg = loadSucceeds({ ...VALID_DEV_ENV, ORDER_NUMBER_PREFIX: 'AB' });
    assert.equal(cfg.orderNumberPrefix, 'AB');
  });

  it('accepts 4-letter prefix', () => {
    const cfg = loadSucceeds({ ...VALID_DEV_ENV, ORDER_NUMBER_PREFIX: 'ABCD' });
    assert.equal(cfg.orderNumberPrefix, 'ABCD');
  });

  it('fails for 1-letter prefix', () => {
    loadFails({ ...VALID_DEV_ENV, ORDER_NUMBER_PREFIX: 'A' }, 'ORDER_NUMBER_PREFIX');
  });

  it('fails for 5-letter prefix', () => {
    loadFails({ ...VALID_DEV_ENV, ORDER_NUMBER_PREFIX: 'ABCDE' }, 'ORDER_NUMBER_PREFIX');
  });

  it('fails for lowercase letters', () => {
    loadFails({ ...VALID_DEV_ENV, ORDER_NUMBER_PREFIX: 'dl' }, 'ORDER_NUMBER_PREFIX');
  });
});

describe('UT-11: loadConfig — SESSION_TTL_DAYS and BCRYPT_COST', () => {
  it('defaults SESSION_TTL_DAYS to 7', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.equal(cfg.sessionTtlDays, 7);
  });

  it('fails when SESSION_TTL_DAYS is 0', () => {
    loadFails({ ...VALID_DEV_ENV, SESSION_TTL_DAYS: '0' }, 'SESSION_TTL_DAYS');
  });

  it('fails when SESSION_TTL_DAYS is 31', () => {
    loadFails({ ...VALID_DEV_ENV, SESSION_TTL_DAYS: '31' }, 'SESSION_TTL_DAYS');
  });

  it('defaults BCRYPT_COST to 12', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.equal(cfg.bcryptCost, 12);
  });

  it('fails when BCRYPT_COST is 9', () => {
    loadFails({ ...VALID_DEV_ENV, BCRYPT_COST: '9' }, 'BCRYPT_COST');
  });

  it('fails when BCRYPT_COST is 15', () => {
    loadFails({ ...VALID_DEV_ENV, BCRYPT_COST: '15' }, 'BCRYPT_COST');
  });
});

describe('UT-11: loadConfig — LOG_LEVEL', () => {
  it('defaults to info', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.equal(cfg.logLevel, 'info');
  });

  it('fails for an unrecognised level', () => {
    loadFails({ ...VALID_DEV_ENV, LOG_LEVEL: 'verbose' }, 'LOG_LEVEL');
  });

  it('accepts each valid level', () => {
    for (const level of ['debug', 'info', 'warn', 'error']) {
      const cfg = loadSucceeds({ ...VALID_DEV_ENV, LOG_LEVEL: level });
      assert.equal(cfg.logLevel, level);
    }
  });
});

describe('UT-11: loadConfig — config is deeply frozen', () => {
  it('top-level object is frozen', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.throws(() => { cfg.nodeEnv = 'hacked'; }, TypeError);
  });

  it('nested db object is frozen', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.throws(() => { cfg.db.poolMax = 99; }, TypeError);
  });

  it('nested runtime object is frozen', () => {
    const cfg = loadSucceeds(VALID_DEV_ENV);
    assert.throws(() => { cfg.runtime.onVercel = true; }, TypeError);
  });
});