/**
 * src/config.js
 *
 * Pure, testable configuration loader.
 * Call loadConfig(env) with an env-variable object (default: process.env).
 * Returns a deeply frozen config object on success.
 * Throws a single Error listing ALL failing variables (never including their values).
 *
 * Only this module reads environment variables.  No other file touches process.env.
 */

/**
 * @param {Record<string, string | undefined>} env  Defaults to process.env.
 * @returns {Readonly<object>} Deeply frozen configuration.
 */
export function loadConfig(env = process.env) {
  const errors = [];

  /** Helper: record a validation failure (never the value). */
  function fail(name, rule) {
    errors.push(`${name}: ${rule}`);
  }

  // ── NODE_ENV ─────────────────────────────────────────────────────────────
  const NODE_ENV = env.NODE_ENV;
  const validNodeEnvs = ['development', 'test', 'production'];
  if (!NODE_ENV || !validNodeEnvs.includes(NODE_ENV)) {
    fail('NODE_ENV', `must be one of: ${validNodeEnvs.join(', ')}`);
  }
  const isProduction = NODE_ENV === 'production';
  const isTest = NODE_ENV === 'test';

  // ── VERCEL (system variable; sets runtime.onVercel) ──────────────────────
  const onVercel = env.VERCEL !== undefined;

  // ── PORT (optional; ignored on Vercel) ───────────────────────────────────
  let port = 3000;
  if (env.PORT !== undefined) {
    const p = Number(env.PORT);
    if (!Number.isInteger(p) || p < 1024 || p > 65535) {
      fail('PORT', 'must be an integer from 1024 to 65535');
    } else {
      port = p;
    }
  }

  // ── DATABASE_URL (required at runtime; not required in test mode where
  //   tests/helpers/config.js supplies it from TEST_DATABASE_URL) ───────────
  const DATABASE_URL = env.DATABASE_URL;
  if (!DATABASE_URL) {
    fail('DATABASE_URL', 'must be set (postgres:// or postgresql:// URL)');
  } else {
    if (!/^postgres(ql)?:\/\//.test(DATABASE_URL)) {
      fail('DATABASE_URL', 'must start with postgres:// or postgresql://');
    } else if (isProduction) {
      // In production the pooled Neon string must contain -pooler in the host.
      let dbHost = '';
      try { dbHost = new URL(DATABASE_URL).hostname; } catch { /* will fail below */ }
      if (!dbHost.includes('-pooler')) {
        fail('DATABASE_URL', 'host must contain -pooler when NODE_ENV=production');
      }
      if (!DATABASE_URL.includes('sslmode=require')) {
        fail('DATABASE_URL', 'must contain sslmode=require');
      }
    } else if (isTest) {
      // In test mode a direct (non-pooled) URL is allowed.
      // HOST containing -pooler is acceptable only if the test helper explicitly
      // sets it; we do not block it here because assertSafeTestDatabase() does
      // the safety check.  We do require sslmode=require.
      if (!DATABASE_URL.includes('sslmode=require')) {
        fail('DATABASE_URL', 'must contain sslmode=require');
      }
    } else {
      // development
      if (!DATABASE_URL.includes('sslmode=require')) {
        fail('DATABASE_URL', 'must contain sslmode=require');
      }
    }
  }

  // ── SESSION_COOKIE_NAME (optional) ───────────────────────────────────────
  const SESSION_COOKIE_NAME = env.SESSION_COOKIE_NAME ?? 'deskline_session';
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(SESSION_COOKIE_NAME)) {
    fail('SESSION_COOKIE_NAME', 'must match ^[A-Za-z0-9_-]{3,64}$');
  } else if (isProduction && !SESSION_COOKIE_NAME.startsWith('__Host-')) {
    fail('SESSION_COOKIE_NAME', 'must start with __Host- when NODE_ENV=production');
  }

  // ── SESSION_TTL_DAYS (optional) ───────────────────────────────────────────
  let sessionTtlDays = 7;
  if (env.SESSION_TTL_DAYS !== undefined) {
    const v = Number(env.SESSION_TTL_DAYS);
    if (!Number.isInteger(v) || v < 1 || v > 30) {
      fail('SESSION_TTL_DAYS', 'must be an integer from 1 to 30');
    } else {
      sessionTtlDays = v;
    }
  }

  // ── BCRYPT_COST (optional) ────────────────────────────────────────────────
  let bcryptCost = 12;
  if (env.BCRYPT_COST !== undefined) {
    const v = Number(env.BCRYPT_COST);
    if (!Number.isInteger(v) || v < 10 || v > 14) {
      fail('BCRYPT_COST', 'must be an integer from 10 to 14');
    } else {
      bcryptCost = v;
    }
  }

  // ── STORE_CURRENCY (required) ─────────────────────────────────────────────
  const STORE_CURRENCY = env.STORE_CURRENCY;
  if (!STORE_CURRENCY) {
    fail('STORE_CURRENCY', 'must be set');
  } else if (STORE_CURRENCY !== 'INR') {
    fail('STORE_CURRENCY', 'must equal INR in this version');
  }

  // ── SHIPPING_FLAT_MINOR (required) ────────────────────────────────────────
  let shippingFlatMinor;
  if (env.SHIPPING_FLAT_MINOR === undefined || env.SHIPPING_FLAT_MINOR === '') {
    fail('SHIPPING_FLAT_MINOR', 'must be set');
  } else {
    const v = Number(env.SHIPPING_FLAT_MINOR);
    if (!Number.isInteger(v) || v < 0 || v > 1000000) {
      fail('SHIPPING_FLAT_MINOR', 'must be an integer from 0 to 1000000');
    } else if (v % 100 !== 0) {
      fail('SHIPPING_FLAT_MINOR', 'must be a multiple of 100 (whole rupees)');
    } else {
      shippingFlatMinor = v;
    }
  }

  // ── ORDER_NUMBER_PREFIX (optional) ────────────────────────────────────────
  const ORDER_NUMBER_PREFIX = env.ORDER_NUMBER_PREFIX ?? 'DL';
  if (!/^[A-Z]{2,4}$/.test(ORDER_NUMBER_PREFIX)) {
    fail('ORDER_NUMBER_PREFIX', 'must be 2 to 4 uppercase letters A-Z');
  }

  // ── DB_POOL_MAX (optional) ────────────────────────────────────────────────
  let dbPoolMax = 5;
  if (env.DB_POOL_MAX !== undefined) {
    const v = Number(env.DB_POOL_MAX);
    if (!Number.isInteger(v) || v < 2 || v > 10) {
      fail('DB_POOL_MAX', 'must be an integer from 2 to 10');
    } else {
      dbPoolMax = v;
    }
  }

  // ── DB_POOL_IDLE_TIMEOUT_MS (optional) ────────────────────────────────────
  let dbIdleTimeoutMs = 5000;
  if (env.DB_POOL_IDLE_TIMEOUT_MS !== undefined) {
    const v = Number(env.DB_POOL_IDLE_TIMEOUT_MS);
    if (!Number.isInteger(v) || v < 1000 || v > 60000) {
      fail('DB_POOL_IDLE_TIMEOUT_MS', 'must be an integer from 1000 to 60000');
    } else {
      dbIdleTimeoutMs = v;
    }
  }

  // ── DB_POOL_CONNECTION_TIMEOUT_MS (optional) ──────────────────────────────
  let dbConnectionTimeoutMs = 5000;
  if (env.DB_POOL_CONNECTION_TIMEOUT_MS !== undefined) {
    const v = Number(env.DB_POOL_CONNECTION_TIMEOUT_MS);
    if (!Number.isInteger(v) || v < 1000 || v > 30000) {
      fail('DB_POOL_CONNECTION_TIMEOUT_MS', 'must be an integer from 1000 to 30000');
    } else {
      dbConnectionTimeoutMs = v;
    }
  }

  // ── DB_STATEMENT_TIMEOUT_MS (optional) ───────────────────────────────────
  let dbStatementTimeoutMs = 10000;
  if (env.DB_STATEMENT_TIMEOUT_MS !== undefined) {
    const v = Number(env.DB_STATEMENT_TIMEOUT_MS);
    if (!Number.isInteger(v) || v < 1000 || v > 60000) {
      fail('DB_STATEMENT_TIMEOUT_MS', 'must be an integer from 1000 to 60000');
    } else {
      dbStatementTimeoutMs = v;
    }
  }

  // ── EXTRA_ALLOWED_ORIGINS (optional) ─────────────────────────────────────
  let extraAllowedOrigins = [];
  if (env.EXTRA_ALLOWED_ORIGINS) {
    const parts = env.EXTRA_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
    for (const origin of parts) {
      if (isProduction) {
        if (!/^https:\/\/[^/]+$/.test(origin)) {
          fail('EXTRA_ALLOWED_ORIGINS', `each entry must be https://host[:port] in production; got an invalid entry`);
          break;
        }
      } else {
        if (!/^(https:\/\/[^/]+|http:\/\/localhost(:\d+)?)$/.test(origin)) {
          fail('EXTRA_ALLOWED_ORIGINS', `each entry must be https://host[:port] or http://localhost[:port] outside production`);
          break;
        }
      }
    }
    if (!errors.some((e) => e.startsWith('EXTRA_ALLOWED_ORIGINS'))) {
      extraAllowedOrigins = parts;
    }
  }

  // ── LOG_LEVEL (optional) ──────────────────────────────────────────────────
  const LOG_LEVEL = env.LOG_LEVEL ?? 'info';
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(LOG_LEVEL)) {
    fail('LOG_LEVEL', `must be one of: ${validLogLevels.join(', ')}`);
  }

  // ── Throw if any validation failed ───────────────────────────────────────
  if (errors.length > 0) {
    throw new Error(
      `Configuration errors (values are intentionally omitted):\n` +
        errors.map((e) => `  - ${e}`).join('\n'),
    );
  }

  // ── Build and deep-freeze the result ─────────────────────────────────────
  const config = {
    nodeEnv: NODE_ENV,
    isProduction,
    isTest,
    port,
    databaseUrl: DATABASE_URL,
    sessionCookieName: SESSION_COOKIE_NAME,
    sessionTtlDays,
    bcryptCost,
    storeCurrency: STORE_CURRENCY,
    shippingFlatMinor,
    orderNumberPrefix: ORDER_NUMBER_PREFIX,
    extraAllowedOrigins,
    logLevel: LOG_LEVEL,
    runtime: {
      onVercel,
    },
    db: {
      poolMax: dbPoolMax,
      idleTimeoutMs: dbIdleTimeoutMs,
      connectionTimeoutMs: dbConnectionTimeoutMs,
      statementTimeoutMs: dbStatementTimeoutMs,
    },
    // Application constants (not env variables)
    maxQuantityPerLine: 10,
    maxCartLines: 50,
    lowStockThreshold: 5,
    bodyLimitBytes: 20480,
  };

  return deepFreeze(config);
}

/** Recursively Object.freeze an object and all its nested objects. */
function deepFreeze(obj) {
  Object.getOwnPropertyNames(obj).forEach((name) => {
    const val = obj[name];
    if (val && typeof val === 'object') {
      deepFreeze(val);
    }
  });
  return Object.freeze(obj);
}