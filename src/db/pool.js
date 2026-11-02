/**
 * src/db/pool.js
 *
 * PostgreSQL connection pool factory (§4A.3, DR-22).
 *
 * Adopts @vercel/functions for Fluid compute pool attachment.
 * Attaches the pool with attachDatabasePool() on Vercel only (via config.runtime.onVercel).
 * Global type parser overrides are strictly prohibited.
 */

import pg from 'pg';
import { attachDatabasePool as defaultAttachDatabasePool } from '@vercel/functions';

const { Pool } = pg;

/**
 * Create and configure a pg.Pool instance according to application configuration.
 *
 * @param {object} options
 * @param {import('../config.js').AppConfig} options.config
 * @param {Function} [options.attachDatabasePool]  Optional injected attachment function (used for testing).
 * @param {Function} [options.logSink]            Optional injected log sink.
 * @returns {import('pg').Pool}
 */
export function createPool({
  config,
  attachDatabasePool = defaultAttachDatabasePool,
  logSink,
} = {}) {
  if (!config) {
    throw new Error('createPool: config parameter is required');
  }

  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.db.poolMax,
    idleTimeoutMillis: config.db.idleTimeoutMs,
    connectionTimeoutMillis: config.db.connectionTimeoutMs,
    statement_timeout: config.db.statementTimeoutMs,
  });

  // Attach database pool on Vercel before any query or connection.
  if (config.runtime && config.runtime.onVercel) {
    if (typeof attachDatabasePool === 'function') {
      attachDatabasePool(pool);
    }
    const logMsg = { level: 'info', message: 'db_pool_attached' };
    if (typeof logSink === 'function') {
      logSink(logMsg);
    } else {
      console.log(JSON.stringify(logMsg));
    }
  }

  // Register error listener so idle-client errors do not crash process or leak secrets.
  pool.on('error', (err) => {
    const errCode = err ? err.code || err.name || 'UNKNOWN' : 'UNKNOWN';
    const logMsg = { level: 'error', message: 'db_pool_client_error', code: errCode };
    if (typeof logSink === 'function') {
      logSink(logMsg);
    } else {
      console.error(JSON.stringify(logMsg));
    }
  });

  return pool;
}
