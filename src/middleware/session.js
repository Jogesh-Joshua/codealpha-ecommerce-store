/**
 * src/middleware/session.js
 *
 * Session loading and authentication guard middleware (§6.1, SEC-01 to SEC-03, API-39, API-40, SECT-01, SECT-02).
 *
 * Enforces:
 * - Cookie read by configured sessionCookieName (e.g. __Host-deskline_session in production).
 * - Exact 43-character token format validation.
 * - SHA-256 digest lookup in sessions table with active expiration check (expires_at > now()).
 * - Cookie clearance when session is absent, expired, or invalid.
 * - Fail-closed on database error (503 SERVICE_UNAVAILABLE).
 * - requireAuth returning 401 UNAUTHENTICATED with Cache-Control: no-store.
 */

import { isValidTokenFormat, hashSessionToken } from '../lib/tokens.js';

/**
 * Build the session loader middleware to mount on /api.
 *
 * @param {object} options
 * @param {import('../config.js').AppConfig} options.config
 * @param {import('pg').Pool} options.pool
 * @returns {import('express').RequestHandler}
 */
export function sessionLoaderMiddleware({ config, pool }) {
  if (!config) throw new Error('sessionLoaderMiddleware: config is required');
  if (!pool) throw new Error('sessionLoaderMiddleware: pool is required');

  const cookieName = config.sessionCookieName || 'deskline_session';
  const isSecure = Boolean(config.isProduction || config.nodeEnv === 'production');

  return async function sessionLoader(req, res, next) {
    req.user = null;
    req.sessionId = null;

    const rawToken = req.cookies?.[cookieName];

    // 1. If cookie is absent, do not query the database
    if (!rawToken) {
      return next();
    }

    // 2. If cookie does not match the token format, clear it
    if (!isValidTokenFormat(rawToken)) {
      res.cookie(cookieName, '', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isSecure,
        maxAge: 0,
      });
      return next();
    }

    // 3. Query active session joined with user
    try {
      const tokenHash = hashSessionToken(rawToken);
      const result = await pool.query(
        `
        SELECT s.id AS session_id, u.id, u.name, u.email
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token_hash = $1 AND s.expires_at > now()
        `,
        [tokenHash]
      );

      if (result.rows.length === 1) {
        const row = result.rows[0];
        req.user = {
          id: row.id,
          name: row.name,
          email: row.email,
        };
        req.sessionId = row.session_id;
        return next();
      }

      // Session missing or expired: clear cookie
      res.cookie(cookieName, '', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isSecure,
        maxAge: 0,
      });
      return next();
    } catch (err) {
      const error = new Error('Session lookup failed.');
      error.status = 503;
      error.code = 'SERVICE_UNAVAILABLE';
      error.cause = err;
      return next(error);
    }
  };
}

/**
 * Require an authenticated user session.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    res.setHeader('Cache-Control', 'no-store');
    res.locals.errorCode = 'UNAUTHENTICATED';
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Sign in to continue.',
        requestId: req.id,
      },
    });
  }
  next();
}

