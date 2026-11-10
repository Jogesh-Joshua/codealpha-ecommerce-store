/**
 * src/services/rateLimiter.js
 *
 * Database-backed atomic fixed-window rate limiter (§6.5, SEC-25 to SEC-27, API-42, API-43, API-67, API-68, CON-11 to CON-13, SECT-14, SECT-15).
 *
 * Enforces:
 * - Single-statement atomic counters in PostgreSQL with ON CONFLICT DO UPDATE.
 * - Key hashing via SHA-256 (32-byte bytea); no raw IP or email is stored.
 * - Window start calculation performed inside SQL to prevent server clock skew.
 * - Atomic reservation and settlement for login_fail bucket (at most 5 failed checks per key/window).
 * - Fail-closed: database errors before password verification throw 503 SERVICE_UNAVAILABLE.
 * - Opportunistic cleanup of rows older than 2 days.
 */

import crypto from 'node:crypto';

export const RATE_LIMITS = {
  login_ip: { limit: 30, windowSeconds: 900 },      // 30 / 15m
  register_ip: { limit: 10, windowSeconds: 3600 },   // 10 / 60m
  login_fail: { limit: 5, windowSeconds: 900 },      // 5 / 15m
  orders_user: { limit: 10, windowSeconds: 3600 },   // 10 / 60m
  cart_ip: { limit: 120, windowSeconds: 600 },       // 120 / 10m
};

let lastCleanupMs = 0;

/**
 * Hash a bucket name and value into a 32-byte SHA-256 Buffer (SEC-26, SECT-14).
 *
 * @param {string} bucket
 * @param {string} value
 * @returns {Buffer}
 */
export function hashRateLimitKey(bucket, value) {
  return crypto.createHash('sha256').update(`${bucket}:${value}`).digest();
}

/**
 * Check and increment rate limit for standard attempt-counting buckets (SEC-25).
 *
 * @param {import('pg').Pool} pool
 * @param {'login_ip' | 'register_ip' | 'orders_user' | 'cart_ip'} bucket
 * @param {string} value
 * @returns {Promise<{ allowed: boolean, remaining: number, retryAfter: number }>}
 */
export async function checkRateLimit(pool, bucket, value) {
  const config = RATE_LIMITS[bucket];
  if (!config) {
    throw new Error(`Unknown rate limit bucket: ${bucket}`);
  }

  const keyHash = hashRateLimitKey(bucket, value);
  const { limit, windowSeconds } = config;

  maybeCleanup(pool);

  try {
    const res = await pool.query(
      `
      INSERT INTO rate_limits (bucket, key_hash, window_start, hits)
      VALUES ($1, $2, to_timestamp(floor(extract(epoch from now()) / $3) * $3), 1)
      ON CONFLICT (bucket, key_hash, window_start)
      DO UPDATE SET hits = rate_limits.hits + 1
      RETURNING hits, window_start, ceil(extract(epoch from (window_start + ($3 || ' seconds')::interval - now())))::integer AS retry_after
      `,
      [bucket, keyHash, windowSeconds]
    );

    const row = res.rows[0];
    const hits = Number(row.hits);
    const retryAfter = Math.max(1, Number(row.retry_after) || windowSeconds);

    if (hits > limit) {
      return { allowed: false, remaining: 0, retryAfter };
    }

    return { allowed: true, remaining: limit - hits, retryAfter: 0 };
  } catch (err) {
    // Fail closed: database error maps to 503 (SECT-15)
    const error = new Error('Rate limit check unavailable.');
    error.status = 503;
    error.code = 'SERVICE_UNAVAILABLE';
    error.cause = err;
    throw error;
  }
}

/**
 * Atomically reserve a slot for login_fail before verifying credentials (§6.5, SEC-44).
 *
 * @param {import('pg').Pool} pool
 * @param {string} email
 * @param {string} clientIp
 * @returns {Promise<{
 *   allowed: boolean,
 *   remaining: number,
 *   retryAfter: number,
 *   windowStart: Date,
 *   keyHash: Buffer
 * }>}
 */
export async function reserveLoginFail(pool, email, clientIp) {
  const bucket = 'login_fail';
  const { limit, windowSeconds } = RATE_LIMITS.login_fail;
  const value = `${email.trim().toLowerCase()}:${clientIp}`;
  const keyHash = hashRateLimitKey(bucket, value);

  maybeCleanup(pool);

  try {
    const res = await pool.query(
      `
      INSERT INTO rate_limits (bucket, key_hash, window_start, hits)
      VALUES ($1, $2, to_timestamp(floor(extract(epoch from now()) / $3) * $3), 1)
      ON CONFLICT (bucket, key_hash, window_start)
      DO UPDATE SET hits = rate_limits.hits + 1
      RETURNING hits, window_start, ceil(extract(epoch from (window_start + ($3 || ' seconds')::interval - now())))::integer AS retry_after
      `,
      [bucket, keyHash, windowSeconds]
    );

    const row = res.rows[0];
    const hits = Number(row.hits);
    const retryAfter = Math.max(1, Number(row.retry_after) || windowSeconds);
    const windowStart = row.window_start;

    if (hits > limit) {
      // Release reservation immediately so hits count does not exceed limit (SEC-44, CON-11)
      await pool.query(
        `
        UPDATE rate_limits
        SET hits = GREATEST(hits - 1, 0)
        WHERE bucket = $1 AND key_hash = $2 AND window_start = $3
        `,
        [bucket, keyHash, windowStart]
      );

      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        windowStart,
        keyHash,
      };
    }

    return {
      allowed: true,
      remaining: limit - hits,
      retryAfter: 0,
      windowStart,
      keyHash,
    };
  } catch (err) {
    const error = new Error('Login rate limiter unavailable.');
    error.status = 503;
    error.code = 'SERVICE_UNAVAILABLE';
    error.cause = err;
    throw error;
  }
}

/**
 * Release a reserved login_fail slot upon successful password verification (§6.5 step 5, CON-13).
 *
 * @param {import('pg').Pool} pool
 * @param {Buffer} keyHash
 * @param {Date} windowStart
 * @param {Function} [logSink]
 * @returns {Promise<void>}
 */
export async function releaseLoginFail(pool, keyHash, windowStart, logSink) {
  try {
    await pool.query(
      `
      UPDATE rate_limits
      SET hits = GREATEST(hits - 1, 0)
      WHERE bucket = 'login_fail' AND key_hash = $1 AND window_start = $2
      `,
      [keyHash, windowStart]
    );
  } catch (err) {
    if (typeof logSink === 'function') {
      logSink(
        JSON.stringify({
          level: 'error',
          code: 'RATE_LIMIT_RELEASE_FAILED',
          message: 'Failed to release login rate limit slot on success',
        })
      );
    }
  }
}

/**
 * Opportunistically clean up rate_limits older than 2 days, at most once per hour (§6.5, SEC-27).
 *
 * @param {import('pg').Pool} pool
 */
function maybeCleanup(pool) {
  const now = Date.now();
  if (now - lastCleanupMs > 3600000) {
    lastCleanupMs = now;
    pool
      .query("DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'")
      .catch(() => {});
  }
}

