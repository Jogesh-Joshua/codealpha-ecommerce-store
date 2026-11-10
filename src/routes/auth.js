/**
 * src/routes/auth.js
 *
 * Authentication routes (§4.7, §6.1, §6.2, §6.5, API-31 to API-43, API-67, API-68, SECT-01 to SECT-03, SECT-11 to SECT-18).
 *
 * Endpoints:
 * - POST /api/auth/register  Register new user, create session, set cookie.
 * - POST /api/auth/login     Authenticate user, create session, set cookie.
 * - POST /api/auth/logout    Invalidate session, clear cookie.
 * - GET  /api/auth/me        Retrieve current authenticated user session.
 */

import { Router } from 'express';
import { validateRegister, validateLogin } from '../validators/auth.js';
import { hashPassword, comparePassword, compareDummyPassword } from '../lib/passwords.js';
import { generateSessionToken, hashSessionToken, isValidTokenFormat } from '../lib/tokens.js';
import { checkRateLimit, reserveLoginFail, releaseLoginFail } from '../services/rateLimiter.js';

/**
 * Factory for auth routes.
 *
 * @param {object} options
 * @param {import('../config.js').AppConfig} options.config
 * @param {import('pg').Pool} options.pool
 * @param {Function} [options.logSink]
 * @returns {Router}
 */
export function createAuthRouter({ config, pool, logSink }) {
  if (!config) throw new Error('createAuthRouter: config is required');
  if (!pool) throw new Error('createAuthRouter: pool is required');

  const router = Router();
  const cookieName = config.sessionCookieName || 'deskline_session';
  const isSecure = Boolean(config.isProduction || config.nodeEnv === 'production');
  const sessionMaxAgeMs = (config.sessionTtlDays || 7) * 86400 * 1000;

  /**
   * Helper to set the session cookie.
   */
  function setSessionCookie(res, rawToken) {
    res.cookie(cookieName, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isSecure,
      maxAge: sessionMaxAgeMs,
    });
  }

  /**
   * Helper to clear the session cookie.
   */
  function clearSessionCookie(res) {
    res.cookie(cookieName, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isSecure,
      maxAge: 0,
    });
  }

  // ── POST /auth/register ───────────────────────────────────────────────────
  router.post('/auth/register', async (req, res, next) => {
    try {
      // 1. IP rate limiting (10 attempts per hour, §6.5)
      const ipLimit = await checkRateLimit(pool, 'register_ip', req.ip);
      if (!ipLimit.allowed) {
        res.setHeader('Retry-After', String(ipLimit.retryAfter));
        res.locals.errorCode = 'RATE_LIMITED';
        return res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many registration attempts. Wait a few minutes and try again.',
            requestId: req.id,
          },
        });
      }

      // 2. Validate input
      const { name, email, password } = validateRegister(req.body);

      // 3. Hash password
      const passwordHash = await hashPassword(password, config.bcryptCost);

      // 4. Persistence in transaction
      const client = await pool.connect();
      let createdUser;
      let sessionToken;

      try {
        await client.query('BEGIN');

        // Insert user
        let userResult;
        try {
          userResult = await client.query(
            `
            INSERT INTO users (name, email, password_hash)
            VALUES ($1, $2, $3)
            RETURNING id, name, email
            `,
            [name, email, passwordHash]
          );
        } catch (dbErr) {
          if (dbErr.code === '23505') {
            // Duplicate email (Contract §4.7)
            await client.query('ROLLBACK');
            res.locals.errorCode = 'EMAIL_TAKEN';
            return res.status(409).json({
              error: {
                code: 'EMAIL_TAKEN',
                message: 'An account with this email already exists. Sign in instead.',
                fields: {
                  email: 'An account with this email already exists. Sign in instead.',
                },
                requestId: req.id,
              },
            });
          }
          throw dbErr;
        }

        createdUser = userResult.rows[0];

        // Invalidate any session presented with the request (SEC-04)
        const oldCookieToken = req.cookies?.[cookieName];
        if (oldCookieToken && isValidTokenFormat(oldCookieToken)) {
          const oldTokenHash = hashSessionToken(oldCookieToken);
          await client.query('DELETE FROM sessions WHERE token_hash = $1', [oldTokenHash]);
        }

        // Create new session
        sessionToken = generateSessionToken();
        const tokenHash = hashSessionToken(sessionToken);

        await client.query(
          `
          INSERT INTO sessions (user_id, token_hash, expires_at)
          VALUES ($1, $2, now() + ($3 || ' days')::interval)
          `,
          [createdUser.id, tokenHash, config.sessionTtlDays || 7]
        );

        // Keep sessions bounded to 10 per user
        await client.query(
          `
          DELETE FROM sessions
          WHERE user_id = $1
            AND id NOT IN (
              SELECT id FROM sessions
              WHERE user_id = $1
              ORDER BY created_at DESC
              LIMIT 10
            )
          `,
          [createdUser.id]
        );

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      // 5. Set session cookie and respond 201
      setSessionCookie(res, sessionToken);

      return res.status(201).json({
        user: {
          id: createdUser.id,
          name: createdUser.name,
          email: createdUser.email,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /auth/login ──────────────────────────────────────────────────────
  router.post('/auth/login', async (req, res, next) => {
    try {
      // 1. IP rate limiting (30 attempts per 15 min, §6.5)
      const ipLimit = await checkRateLimit(pool, 'login_ip', req.ip);
      if (!ipLimit.allowed) {
        res.setHeader('Retry-After', String(ipLimit.retryAfter));
        res.locals.errorCode = 'RATE_LIMITED';
        return res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many sign-in attempts. Wait a few minutes and try again.',
            requestId: req.id,
          },
        });
      }

      // 2. Validate input
      const { email, password } = validateLogin(req.body);

      // 3. Atomically reserve slot for login_fail (§6.5, SEC-44)
      const reservation = await reserveLoginFail(pool, email, req.ip);
      if (!reservation.allowed) {
        res.setHeader('Retry-After', String(reservation.retryAfter));
        res.locals.errorCode = 'RATE_LIMITED';
        return res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many sign-in attempts. Wait a few minutes and try again.',
            requestId: req.id,
          },
        });
      }

      // 4. Query user
      const userResult = await pool.query(
        `
        SELECT id, name, email, password_hash
        FROM users
        WHERE email = $1
        `,
        [email]
      );

      const user = userResult.rows[0];

      if (!user) {
        // Unknown email: timing defense dummy bcrypt comparison (SEC-10, SECT-16)
        await compareDummyPassword(password, config.bcryptCost);
        res.locals.errorCode = 'INVALID_CREDENTIALS';
        return res.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Email or password is incorrect. Check both and try again.',
            requestId: req.id,
          },
        });
      }

      // 5. Compare password
      const passwordValid = await comparePassword(password, user.password_hash);
      if (!passwordValid) {
        res.locals.errorCode = 'INVALID_CREDENTIALS';
        return res.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Email or password is incorrect. Check both and try again.',
            requestId: req.id,
          },
        });
      }

      // 6. Success: release reserved login_fail slot (§6.5 step 5, CON-13)
      await releaseLoginFail(pool, reservation.keyHash, reservation.windowStart, logSink);

      // 7. Session persistence in transaction
      const client = await pool.connect();
      let sessionToken;

      try {
        await client.query('BEGIN');

        // Delete old session presented with request if any (SEC-04)
        const oldCookieToken = req.cookies?.[cookieName];
        if (oldCookieToken && isValidTokenFormat(oldCookieToken)) {
          const oldTokenHash = hashSessionToken(oldCookieToken);
          await client.query('DELETE FROM sessions WHERE token_hash = $1', [oldTokenHash]);
        }

        // Clean up expired sessions for this user (SEC-06, SECT-18)
        await client.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [user.id]);

        // Create new session
        sessionToken = generateSessionToken();
        const tokenHash = hashSessionToken(sessionToken);

        await client.query(
          `
          INSERT INTO sessions (user_id, token_hash, expires_at)
          VALUES ($1, $2, now() + ($3 || ' days')::interval)
          `,
          [user.id, tokenHash, config.sessionTtlDays || 7]
        );

        // Keep sessions bounded to 10 per user
        await client.query(
          `
          DELETE FROM sessions
          WHERE user_id = $1
            AND id NOT IN (
              SELECT id FROM sessions
              WHERE user_id = $1
              ORDER BY created_at DESC
              LIMIT 10
            )
          `,
          [user.id]
        );

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      // 8. Set session cookie and respond 200
      setSessionCookie(res, sessionToken);

      return res.status(200).json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /auth/logout ─────────────────────────────────────────────────────
  router.post('/auth/logout', async (req, res, next) => {
    try {
      const rawToken = req.cookies?.[cookieName];
      if (rawToken && isValidTokenFormat(rawToken)) {
        try {
          const tokenHash = hashSessionToken(rawToken);
          await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
        } catch {
          // Failure to delete session from DB does not prevent cookie clearance
        }
      }

      clearSessionCookie(res);
      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // ── GET /auth/me ──────────────────────────────────────────────────────────
  router.get('/auth/me', (req, res) => {
    if (!req.user) {
      res.locals.errorCode = 'UNAUTHENTICATED';
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Sign in to continue.',
          requestId: req.id,
        },
      });
    }

    return res.status(200).json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
      },
    });
  });

  return router;
}

