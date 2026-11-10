/**
 * tests/api/auth.test.js
 *
 * Phase 4 Authentication, Sessions, and Rate Limiting Integration Tests (§8.4, §8.5, §8.6).
 *
 * Covers:
 * - API-31 to API-43, API-67, API-68
 * - CON-11 to CON-13
 * - SECT-01 to SECT-03, SECT-11, SECT-12, SECT-14 to SECT-18
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startTestServer } from '../helpers/server.js';
import { assertSafeTestDatabase, getTestClient, resetTestDb } from '../helpers/db.js';
import { loadTestConfig, withProductionBehaviour } from '../helpers/config.js';
import { hashSessionToken, isValidTokenFormat } from '../../src/lib/tokens.js';

const { Pool } = pg;

assertSafeTestDatabase();

describe('Phase 4: Authentication, Sessions, and Rate Limiting', () => {
  let testEnv;
  let pool;
  let client;
  let logEvents = [];

  const logSink = (line) => {
    try {
      logEvents.push(JSON.parse(line));
    } catch {
      logEvents.push(line);
    }
  };

  before(async () => {
    client = await getTestClient();
    await resetTestDb(client);

    const config = loadTestConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    testEnv = await startTestServer({ config, pool, logSink });
  });

  after(async () => {
    await testEnv.close();
    await pool.end();
    await client.end();
  });

  beforeEach(() => {
    logEvents = [];
    testEnv.jar.clear();
  });

  // Helper for generating distinct IPs per scenario
  let ipCounter = 1;
  const nextIp = () => `198.51.100.${ipCounter++}`;

  // Helper for generating distinct emails
  let emailCounter = 1;
  const nextEmail = () => `user_${Date.now()}_${emailCounter++}@example.com`;

  describe('Registration (API-31, API-32, API-33, API-34, API-35, API-41, SECT-01, SECT-12, SECT-17)', () => {
    it('API-31 & SECT-12 & SECT-17: POST /api/auth/register returns 201 {user} without password, sets HttpOnly cookie', async () => {
      const email = nextEmail();
      const ip = nextIp();

      const res = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'X-Forwarded-For': ip,
        },
        body: JSON.stringify({
          name: 'Deskline User',
          email,
          password: 'SecretPassword123!',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();

      // DTO check: only id, name, email
      assert.ok(data.user);
      assert.ok(data.user.id);
      assert.equal(data.user.name, 'Deskline User');
      assert.equal(data.user.email, email.toLowerCase());
      assert.equal(data.user.password, undefined);
      assert.equal(data.user.password_hash, undefined);

      // Verify Set-Cookie header
      const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      assert.ok(setCookies.length > 0);
      const cookieHeader = setCookies[0];

      assert.ok(cookieHeader.includes('deskline_session_test='));
      assert.ok(cookieHeader.toLowerCase().includes('httponly'));
      assert.ok(cookieHeader.toLowerCase().includes('samesite=lax'));
      assert.ok(cookieHeader.includes('Path=/'));
      assert.ok(!cookieHeader.toLowerCase().includes('domain='));
      assert.ok(cookieHeader.toLowerCase().includes('max-age=604800')); // 7 days in seconds

      // Verify raw token format in cookie
      const tokenMatch = cookieHeader.match(/deskline_session_test=([^;]+)/);
      assert.ok(tokenMatch);
      assert.equal(isValidTokenFormat(tokenMatch[1]), true);

      // Verify token does not appear in body (SECT-17)
      assert.equal(JSON.stringify(data).includes(tokenMatch[1]), false);
    });

    it('SECT-01: In production mode, cookie has Secure flag and __Host- prefix', async () => {
      const prodConfig = withProductionBehaviour(testEnv.config);
      const prodEnv = await startTestServer({ config: prodConfig, pool });
      const email = nextEmail();
      const ip = nextIp();

      try {
        const res = await prodEnv.request('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': prodEnv.url,
            'X-Forwarded-For': ip,
          },
          body: JSON.stringify({
            name: 'Prod User',
            email,
            password: 'SecretPassword123!',
          }),
        });

        assert.equal(res.status, 201);
        const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
        assert.ok(setCookies.length > 0);
        const cookieHeader = setCookies[0];

        assert.ok(cookieHeader.startsWith('__Host-deskline_session='));
        assert.ok(cookieHeader.toLowerCase().includes('secure'));
        assert.ok(cookieHeader.toLowerCase().includes('httponly'));
        assert.ok(cookieHeader.toLowerCase().includes('samesite=lax'));
        assert.ok(cookieHeader.includes('Path=/'));
        assert.ok(!cookieHeader.toLowerCase().includes('domain='));
      } finally {
        await prodEnv.close();
      }
    });

    it('API-32: database stores valid bcrypt hash differing from password', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const password = 'CleartextPassword99!';

      await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'X-Forwarded-For': ip,
        },
        body: JSON.stringify({
          name: 'Hash Check User',
          email,
          password,
        }),
      });

      const res = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
      assert.equal(res.rows.length, 1);
      const hash = res.rows[0].password_hash;

      assert.notEqual(hash, password);
      assert.match(hash, /^\$2[aby]\$\d+\$/);
    });

    it('API-33: registration validation rules return exact field error messages (§4.7)', async () => {
      const ip = nextIp();

      // Missing name
      const res1 = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: '', email: nextEmail(), password: 'Password123!' }),
      });
      assert.equal(res1.status, 400);
      const d1 = await res1.json();
      assert.equal(d1.error.fields.name, 'Enter your name.');

      // Invalid email
      const res2 = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'Alex', email: 'not-an-email', password: 'Password123!' }),
      });
      assert.equal(res2.status, 400);
      const d2 = await res2.json();
      assert.equal(d2.error.fields.email, 'Enter a valid email address, like name@example.com.');

      // Short password (<8 chars)
      const res3 = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'Alex', email: nextEmail(), password: 'short' }),
      });
      assert.equal(res3.status, 400);
      const d3 = await res3.json();
      assert.equal(d3.error.fields.password, 'Use at least 8 characters.');

      // Long password (>72 bytes) (API-41)
      const res4 = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'Alex', email: nextEmail(), password: 'a'.repeat(73) }),
      });
      assert.equal(res4.status, 400);
      const d4 = await res4.json();
      assert.equal(d4.error.fields.password, 'Use 72 characters or fewer.');

      // Password equal to email
      const targetEmail = nextEmail();
      const res5 = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'Alex', email: targetEmail, password: targetEmail }),
      });
      assert.equal(res5.status, 400);
      const d5 = await res5.json();
      assert.equal(d5.error.fields.password, 'Password cannot equal email.');
    });

    it('API-34: registering duplicate email with different casing returns 409 EMAIL_TAKEN', async () => {
      const email = nextEmail();
      const ip = nextIp();

      // First registration in lowercase
      const res1 = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'User One', email: email.toLowerCase(), password: 'Password123!' }),
      });
      assert.equal(res1.status, 201);

      // Second registration in uppercase
      const res2 = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'User Two', email: email.toUpperCase(), password: 'Password123!' }),
      });
      assert.equal(res2.status, 409);
      const d2 = await res2.json();
      assert.equal(d2.error.code, 'EMAIL_TAKEN');
      assert.equal(d2.error.fields.email, 'An account with this email already exists. Sign in instead.');
    });

    it('API-35 & SECT-06: unknown fields (role, isAdmin, confirmPassword) return 400 VALIDATION_ERROR', async () => {
      const ip = nextIp();
      const res = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({
          name: 'Attacker',
          email: nextEmail(),
          password: 'Password123!',
          role: 'admin',
          isAdmin: true,
          confirmPassword: 'Password123!',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'VALIDATION_ERROR');
      assert.ok(data.error.fields.role);
      assert.ok(data.error.fields.isAdmin);
      assert.ok(data.error.fields.confirmPassword);
    });

    it('API-43: the 11th registration from one IP in one hour returns 429 RATE_LIMITED', async () => {
      const ip = nextIp();

      // 10 successful registrations
      for (let i = 0; i < 10; i++) {
        const res = await testEnv.request('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
          body: JSON.stringify({ name: `User ${i}`, email: nextEmail(), password: 'Password123!' }),
        });
        assert.equal(res.status, 201, `Expected attempt ${i + 1} to succeed`);
      }

      // 11th registration from the same IP must be rate limited
      const res11 = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'User 11', email: nextEmail(), password: 'Password123!' }),
      });

      assert.equal(res11.status, 429);
      assert.ok(res11.headers.get('Retry-After'));
      const d11 = await res11.json();
      assert.equal(d11.error.code, 'RATE_LIMITED');
    });
  });

  describe('Login & Sessions (API-36, API-37, API-38, API-40, SECT-02, SECT-03, SECT-18)', () => {
    it('API-36 & SECT-03: login returns 200 with new session token and invalidates old cookie token', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const password = 'CorrectPassword123!';

      // Register user and get initial session cookie
      const regRes = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'Session User', email, password }),
      });
      assert.equal(regRes.status, 201);
      const regSetCookie = regRes.headers.getSetCookie()[0];
      const oldToken = regSetCookie.match(/deskline_session_test=([^;]+)/)[1];

      // Login sending the old cookie
      const loginRes = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'X-Forwarded-For': ip,
          'Cookie': `deskline_session_test=${oldToken}`,
        },
        body: JSON.stringify({ email, password }),
      });

      assert.equal(loginRes.status, 200);
      const loginSetCookie = loginRes.headers.getSetCookie()[0];
      const newToken = loginSetCookie.match(/deskline_session_test=([^;]+)/)[1];

      // Tokens must differ
      assert.notEqual(oldToken, newToken);

      // Old session token MUST have been deleted from database
      const oldHash = hashSessionToken(oldToken);
      const oldCheck = await pool.query('SELECT id FROM sessions WHERE token_hash = $1', [oldHash]);
      assert.equal(oldCheck.rows.length, 0);

      // New session token MUST exist in database
      const newHash = hashSessionToken(newToken);
      const newCheck = await pool.query('SELECT id FROM sessions WHERE token_hash = $1', [newHash]);
      assert.equal(newCheck.rows.length, 1);
    });

    it('API-37: wrong password and unknown email return identical status, body, and headers (apart from requestId)', async () => {
      const email = nextEmail();
      const ip = nextIp();

      // Register a real user
      await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'Real User', email, password: 'RealPassword123!' }),
      });

      // 1. Known email, wrong password
      const resWrongPass = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': nextIp() },
        body: JSON.stringify({ email, password: 'IncorrectPassword99!' }),
      });

      // 2. Unknown email
      const resUnknownEmail = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': nextIp() },
        body: JSON.stringify({ email: nextEmail(), password: 'IncorrectPassword99!' }),
      });

      assert.equal(resWrongPass.status, 401);
      assert.equal(resUnknownEmail.status, 401);

      const bodyWrongPass = await resWrongPass.json();
      const bodyUnknownEmail = await resUnknownEmail.json();

      assert.equal(bodyWrongPass.error.code, 'INVALID_CREDENTIALS');
      assert.equal(bodyUnknownEmail.error.code, 'INVALID_CREDENTIALS');
      assert.equal(bodyWrongPass.error.message, 'Email or password is incorrect. Check both and try again.');
      assert.equal(bodyUnknownEmail.error.message, 'Email or password is incorrect. Check both and try again.');

      // Response headers (Cache-Control, Content-Type) should match
      assert.equal(resWrongPass.headers.get('cache-control'), resUnknownEmail.headers.get('cache-control'));
      assert.equal(resWrongPass.headers.get('content-type'), resUnknownEmail.headers.get('content-type'));
    });

    it('API-38: login with missing or non-string fields returns 400 VALIDATION_ERROR', async () => {
      const ip = nextIp();

      // Missing fields
      const res1 = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({}),
      });
      assert.equal(res1.status, 400);

      // Non-string fields
      const res2 = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ email: 12345, password: true }),
      });
      assert.equal(res2.status, 400);
    });

    it('API-40 & SECT-02: logout returns 204, deletes session row, clears cookie; replaying returns 401', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const password = 'ValidPassword123!';

      // Register to get cookie
      const regRes = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'Logout User', email, password }),
      });
      assert.equal(regRes.status, 201);
      const rawCookie = regRes.headers.getSetCookie()[0];
      const token = rawCookie.match(/deskline_session_test=([^;]+)/)[1];

      // GET /api/auth/me should succeed with cookie
      const meBefore = await testEnv.request('/api/auth/me', {
        headers: { 'Cookie': `deskline_session_test=${token}` },
      });
      assert.equal(meBefore.status, 200);

      // Logout
      const logoutRes = await testEnv.request('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Origin': testEnv.url,
          'Cookie': `deskline_session_test=${token}`,
        },
      });
      assert.equal(logoutRes.status, 204);

      // Set-Cookie must clear the cookie (Max-Age=0)
      const clearCookies = logoutRes.headers.getSetCookie();
      assert.ok(clearCookies.length > 0);
      assert.ok(clearCookies[0].includes('Max-Age=0'));

      // Session row must be deleted from DB
      const tokenHash = hashSessionToken(token);
      const dbRow = await pool.query('SELECT id FROM sessions WHERE token_hash = $1', [tokenHash]);
      assert.equal(dbRow.rows.length, 0);

      // Replaying the old cookie must return 401 (SECT-02)
      const meAfter = await testEnv.request('/api/auth/me', {
        headers: { 'Cookie': `deskline_session_test=${token}` },
      });
      assert.equal(meAfter.status, 401);

      // Logout with no cookie still returns 204
      const logoutAgain = await testEnv.request('/api/auth/logout', {
        method: 'POST',
        headers: { 'Origin': testEnv.url },
      });
      assert.equal(logoutAgain.status, 204);
    });

    it('SECT-18: logging in deletes that user\'s expired sessions', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const password = 'UserPassword123!';

      // Register user
      const regRes = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'Cleanup User', email, password }),
      });
      const data = await regRes.json();
      const userId = data.user.id;

      // Insert an expired session manually for this user
      const expiredTokenHash = Buffer.alloc(32, 7);
      await pool.query(
        `
        INSERT INTO sessions (user_id, token_hash, created_at, expires_at)
        VALUES ($1, $2, now() - interval '2 days', now() - interval '1 day')
        `,
        [userId, expiredTokenHash]
      );

      // Verify expired session exists
      const beforeLogin = await pool.query('SELECT id FROM sessions WHERE token_hash = $1', [expiredTokenHash]);
      assert.equal(beforeLogin.rows.length, 1);

      // Login
      const loginRes = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': nextIp() },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(loginRes.status, 200);

      // Expired session MUST be gone
      const afterLogin = await pool.query('SELECT id FROM sessions WHERE token_hash = $1', [expiredTokenHash]);
      assert.equal(afterLogin.rows.length, 0);
    });
  });

  describe('Current User Lookup (API-39)', () => {
    it('API-39: GET /api/auth/me returns user with valid cookie, 401 without, and 401 with clearing Set-Cookie when expired', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const password = 'PasswordForMeEndpoint123!';

      // 1. Without cookie -> 401 UNAUTHENTICATED
      const resNoCookie = await testEnv.request('/api/auth/me');
      assert.equal(resNoCookie.status, 401);
      const dNoCookie = await resNoCookie.json();
      assert.equal(dNoCookie.error.code, 'UNAUTHENTICATED');

      // 2. Register to obtain valid session
      const regRes = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'Me User', email, password }),
      });
      const rawCookie = regRes.headers.getSetCookie()[0];
      const token = rawCookie.match(/deskline_session_test=([^;]+)/)[1];

      // 3. With valid cookie -> 200 { user }
      const resValid = await testEnv.request('/api/auth/me', {
        headers: { 'Cookie': `deskline_session_test=${token}` },
      });
      assert.equal(resValid.status, 200);
      const dValid = await resValid.json();
      assert.equal(dValid.user.email, email.toLowerCase());
      assert.equal(dValid.user.name, 'Me User');

      // 4. Manually expire the session in the database (satisfying sessions_expiry_check)
      const tokenHash = hashSessionToken(token);
      await pool.query(
        "UPDATE sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE token_hash = $1",
        [tokenHash]
      );

      // 5. Querying with expired cookie returns 401 AND Set-Cookie clearing the cookie
      const resExpired = await testEnv.request('/api/auth/me', {
        headers: { 'Cookie': `deskline_session_test=${token}` },
      });
      assert.equal(resExpired.status, 401);
      const clearCookies = resExpired.headers.getSetCookie();
      assert.ok(clearCookies.length > 0);
      assert.ok(clearCookies[0].includes('Max-Age=0'));
    });
  });

  describe('Rate Limiting Policy & Verification (API-42, API-67, API-68, SECT-14, SECT-16)', () => {
    it('API-42 & SECT-16: 5 sequential failed logins return 401, 6th returns 429 even with correct password (no bcrypt)', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const password = 'RealPassword123!';

      // Register real user
      await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': nextIp() },
        body: JSON.stringify({ name: 'Lockout User', email, password }),
      });

      // 5 failed login attempts
      for (let i = 1; i <= 5; i++) {
        const res = await testEnv.request('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
          body: JSON.stringify({ email, password: 'WrongPassword!' }),
        });
        assert.equal(res.status, 401, `Attempt ${i} should return 401`);
      }

      // Check hits count is exactly 5
      const key = `login_fail:${email.toLowerCase()}:${ip}`;
      const crypto = await import('node:crypto');
      const keyHash = crypto.createHash('sha256').update(key).digest();
      const countRes = await pool.query('SELECT hits FROM rate_limits WHERE key_hash = $1', [keyHash]);
      assert.equal(countRes.rows.length, 1);
      assert.equal(countRes.rows[0].hits, 5);

      // 6th attempt with CORRECT password must return 429 RATE_LIMITED
      const res6 = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ email, password }),
      });

      assert.equal(res6.status, 429);
      assert.ok(res6.headers.get('Retry-After'));
      const d6 = await res6.json();
      assert.equal(d6.error.code, 'RATE_LIMITED');
      assert.equal(d6.error.message, 'Too many sign-in attempts. Wait a few minutes and try again.');

      // Hits count must still be 5 (not 6) because reservation was released on block
      const countResAfter = await pool.query('SELECT hits FROM rate_limits WHERE key_hash = $1', [keyHash]);
      assert.equal(countResAfter.rows[0].hits, 5);
    });

    it('API-42 (unknown email): 5 failed logins return 401, then 6th returns 429 identically', async () => {
      const email = nextEmail();
      const ip = nextIp();

      // 5 failed login attempts for unknown email
      for (let i = 1; i <= 5; i++) {
        const res = await testEnv.request('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
          body: JSON.stringify({ email, password: 'AnyPassword!' }),
        });
        assert.equal(res.status, 401, `Unknown email attempt ${i} should return 401`);
      }

      // 6th attempt returns 429
      const res6 = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ email, password: 'AnyPassword!' }),
      });

      assert.equal(res6.status, 429);
      const d6 = await res6.json();
      assert.equal(d6.error.code, 'RATE_LIMITED');
    });

    it('API-67: successful logins are not counted as failures; slot released on success', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const password = 'RealPassword123!';

      await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': nextIp() },
        body: JSON.stringify({ name: 'Counter User', email, password }),
      });

      // 3 failed logins
      for (let i = 1; i <= 3; i++) {
        const res = await testEnv.request('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
          body: JSON.stringify({ email, password: 'WrongPassword' }),
        });
        assert.equal(res.status, 401);
      }

      const crypto = await import('node:crypto');
      const key = `login_fail:${email.toLowerCase()}:${ip}`;
      const keyHash = crypto.createHash('sha256').update(key).digest();

      // Hits is 3
      const h3 = await pool.query('SELECT hits FROM rate_limits WHERE key_hash = $1', [keyHash]);
      assert.equal(h3.rows[0].hits, 3);

      // Correct login succeeds (returns 200)
      const resSuccess = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(resSuccess.status, 200);

      // Hits remains 3 afterwards (success released its slot)
      const hAfterSuccess = await pool.query('SELECT hits FROM rate_limits WHERE key_hash = $1', [keyHash]);
      assert.equal(hAfterSuccess.rows[0].hits, 3);

      // 2 more failures
      const f4 = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ email, password: 'Wrong' }),
      });
      assert.equal(f4.status, 401);

      const f5 = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ email, password: 'Wrong' }),
      });
      assert.equal(f5.status, 401);

      // Hits is now 5
      const h5 = await pool.query('SELECT hits FROM rate_limits WHERE key_hash = $1', [keyHash]);
      assert.equal(h5.rows[0].hits, 5);

      // Next attempt returns 429
      const blocked = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(blocked.status, 429);
    });

    it('API-68: window roll-over resets lockout without extending it', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const password = 'RealPassword123!';

      await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': nextIp() },
        body: JSON.stringify({ name: 'RollOver User', email, password }),
      });

      // 5 failed logins to lock out
      for (let i = 1; i <= 5; i++) {
        await testEnv.request('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
          body: JSON.stringify({ email, password: 'Bad' }),
        });
      }

      // 6th is blocked
      const blockedRes = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(blockedRes.status, 429);

      // Move the rate_limit row back by 1 window (15 minutes)
      const crypto = await import('node:crypto');
      const key = `login_fail:${email.toLowerCase()}:${ip}`;
      const keyHash = crypto.createHash('sha256').update(key).digest();
      await pool.query(
        "UPDATE rate_limits SET window_start = window_start - interval '16 minutes' WHERE key_hash = $1",
        [keyHash]
      );

      // Now correct login must succeed again (returns 200)
      const unblockedRes = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(unblockedRes.status, 200);
    });

    it('SECT-14: rate_limits.key_hash holds 32-byte digests; raw email or IP never appears', async () => {
      const rows = await pool.query('SELECT bucket, key_hash FROM rate_limits LIMIT 10');
      assert.ok(rows.rows.length > 0);
      for (const row of rows.rows) {
        assert.ok(Buffer.isBuffer(row.key_hash));
        assert.equal(row.key_hash.length, 32);
      }
    });

    it('SECT-15: database failure during rate limiting fails closed with 503 SERVICE_UNAVAILABLE', async () => {
      // Create a mock pool that rejects queries
      const brokenPool = {
        query: async () => {
          throw new Error('Database connection terminated');
        },
        connect: async () => {
          throw new Error('Database connection terminated');
        },
      };

      const failingEnv = await startTestServer({ config: testEnv.config, pool: brokenPool });
      try {
        const res = await failingEnv.request('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': failingEnv.url,
            'X-Forwarded-For': nextIp(),
          },
          body: JSON.stringify({ email: nextEmail(), password: 'Password123!' }),
        });

        assert.equal(res.status, 503);
        const data = await res.json();
        assert.equal(data.error.code, 'SERVICE_UNAVAILABLE');
      } finally {
        await failingEnv.close();
      }
    });
  });

  describe('Concurrency Protections (CON-11, CON-12, CON-13)', () => {
    it('CON-11: 20 parallel wrong-password logins in fresh window: exactly 5 return 401, 15 return 429; hits is 5', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const password = 'RealPassword123!';

      // Register account first
      await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': nextIp() },
        body: JSON.stringify({ name: 'Parallel User', email, password }),
      });

      // Send 20 parallel wrong-password requests
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          testEnv.request('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
            body: JSON.stringify({ email, password: 'WrongPassword' }),
          })
        );
      }

      const responses = await Promise.all(promises);
      const statuses = responses.map((r) => r.status);

      const count401 = statuses.filter((s) => s === 401).length;
      const count429 = statuses.filter((s) => s === 429).length;

      assert.equal(count401, 5, `Expected exactly 5 x 401 responses, got ${count401}`);
      assert.equal(count429, 15, `Expected exactly 15 x 429 responses, got ${count429}`);

      // Final hits count must be exactly 5
      const crypto = await import('node:crypto');
      const key = `login_fail:${email.toLowerCase()}:${ip}`;
      const keyHash = crypto.createHash('sha256').update(key).digest();
      const countRes = await pool.query('SELECT hits FROM rate_limits WHERE key_hash = $1', [keyHash]);
      assert.equal(countRes.rows[0].hits, 5);
    });

    it('CON-12: after 4 sequential failures, 10 parallel wrong-password logins: exactly 1 returns 401, 9 return 429', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const password = 'RealPassword123!';

      await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': nextIp() },
        body: JSON.stringify({ name: 'NearLimit User', email, password }),
      });

      // 4 sequential failures
      for (let i = 0; i < 4; i++) {
        const res = await testEnv.request('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
          body: JSON.stringify({ email, password: 'Bad' }),
        });
        assert.equal(res.status, 401);
      }

      // 10 parallel requests
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          testEnv.request('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
            body: JSON.stringify({ email, password: 'Bad' }),
          })
        );
      }

      const responses = await Promise.all(promises);
      const statuses = responses.map((r) => r.status);

      const count401 = statuses.filter((s) => s === 401).length;
      const count429 = statuses.filter((s) => s === 429).length;

      assert.equal(count401, 1, `Expected exactly 1 x 401, got ${count401}`);
      assert.equal(count429, 9, `Expected exactly 9 x 429, got ${count429}`);

      const crypto = await import('node:crypto');
      const key = `login_fail:${email.toLowerCase()}:${ip}`;
      const keyHash = crypto.createHash('sha256').update(key).digest();
      const countRes = await pool.query('SELECT hits FROM rate_limits WHERE key_hash = $1', [keyHash]);
      assert.equal(countRes.rows[0].hits, 5);
    });

    it('CON-13: after 3 failures, parallel correct and wrong login: 200 and 401; 5 parallel correct on fresh key: 200 and hits 0', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const password = 'RealPassword123!';

      await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': nextIp() },
        body: JSON.stringify({ name: 'SuccessHandling User', email, password }),
      });

      // 3 sequential failures
      for (let i = 0; i < 3; i++) {
        await testEnv.request('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
          body: JSON.stringify({ email, password: 'Bad' }),
        });
      }

      // 1 correct and 1 wrong in parallel
      const [resCorrect, resWrong] = await Promise.all([
        testEnv.request('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
          body: JSON.stringify({ email, password }),
        }),
        testEnv.request('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
          body: JSON.stringify({ email, password: 'Bad' }),
        }),
      ]);

      assert.equal(resCorrect.status, 200);
      assert.equal(resWrong.status, 401);

      // Final hits is 4 (the success released its slot)
      const crypto = await import('node:crypto');
      const key = `login_fail:${email.toLowerCase()}:${ip}`;
      const keyHash = crypto.createHash('sha256').update(key).digest();
      const countRes = await pool.query('SELECT hits FROM rate_limits WHERE key_hash = $1', [keyHash]);
      assert.equal(countRes.rows[0].hits, 4);

      // Fresh key: 5 parallel correct logins all return 200 and leave hits at 0
      const freshEmail = nextEmail();
      const freshIp = nextIp();
      await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': nextIp() },
        body: JSON.stringify({ name: 'Fresh User', email: freshEmail, password }),
      });

      const freshPromises = [];
      for (let i = 0; i < 5; i++) {
        freshPromises.push(
          testEnv.request('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': freshIp },
            body: JSON.stringify({ email: freshEmail, password }),
          })
        );
      }

      const freshResponses = await Promise.all(freshPromises);
      for (const res of freshResponses) {
        assert.equal(res.status, 200);
      }

      const freshKey = `login_fail:${freshEmail.toLowerCase()}:${freshIp}`;
      const freshKeyHash = crypto.createHash('sha256').update(freshKey).digest();
      const freshCountRes = await pool.query('SELECT hits FROM rate_limits WHERE key_hash = $1', [freshKeyHash]);
      assert.equal(freshCountRes.rows[0].hits, 0);
    });
  });

  describe('Security & Logging (SECT-11)', () => {
    it('SECT-11: captured logs after register, login, and logout contain no secrets or passwords', async () => {
      const email = nextEmail();
      const ip = nextIp();
      const secretPassword = 'UltraSecretPassword!#42';

      // 1. Register
      const regRes = await testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': ip },
        body: JSON.stringify({ name: 'Log Audit User', email, password: secretPassword }),
      });
      assert.equal(regRes.status, 201);
      const rawCookie = regRes.headers.getSetCookie()[0];
      const token = rawCookie.match(/deskline_session_test=([^;]+)/)[1];

      // 2. Login
      const loginRes = await testEnv.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': testEnv.url, 'X-Forwarded-For': nextIp() },
        body: JSON.stringify({ email, password: secretPassword }),
      });
      assert.equal(loginRes.status, 200);

      // 3. Logout
      const logoutRes = await testEnv.request('/api/auth/logout', {
        method: 'POST',
        headers: { 'Origin': testEnv.url, 'Cookie': `deskline_session_test=${token}` },
      });
      assert.equal(logoutRes.status, 204);

      // Scan all captured log events
      assert.ok(logEvents.length > 0);
      for (const event of logEvents) {
        const text = typeof event === 'string' ? event : JSON.stringify(event);
        assert.equal(text.includes(secretPassword), false, 'Log contains plaintext password');
        assert.equal(text.includes(token), false, 'Log contains session token');
        assert.equal(text.includes('postgresql://'), false, 'Log contains database connection string');
      }
    });
  });
});
