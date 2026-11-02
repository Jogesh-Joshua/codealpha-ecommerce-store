/**
 * tests/api/security.test.js
 *
 * Phase 2 security and middleware gate tests:
 * SECT-04, SECT-05, SECT-06, SECT-07, SECT-08, SECT-10, plus 404 handlers.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../helpers/server.js';
import { loadTestConfig, withProductionBehaviour } from '../helpers/config.js';
import { createApp } from '../../src/createApp.js';
import http from 'node:http';

describe('Phase 2 Security & Middleware Tests', () => {
  let testEnv;

  before(async () => {
    testEnv = await startTestServer();
  });

  after(async () => {
    await testEnv.close();
  });

  // ── SECT-04: Origin Guard ───────────────────────────────────────────────
  describe('SECT-04: Origin & CSRF guard', () => {
    it('rejects POST with unauthorized origin (403 FORBIDDEN_ORIGIN)', async () => {
      const res = await testEnv.request('/api/health', {
        method: 'POST',
        headers: {
          'Origin': 'https://evil.example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: true }),
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error.code, 'FORBIDDEN_ORIGIN');
    });

    it('rejects POST with Origin: null (403 FORBIDDEN_ORIGIN)', async () => {
      const res = await testEnv.request('/api/health', {
        method: 'POST',
        headers: {
          'Origin': 'null',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: true }),
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error.code, 'FORBIDDEN_ORIGIN');
    });

    it('allows same-origin POST request', async () => {
      const res = await testEnv.request('/api/health', {
        method: 'POST',
        headers: {
          'Origin': testEnv.url,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      // Route is 404/ROUTE_NOT_FOUND (since POST /api/health does not exist), but NOT 403 (it passed origin guard)
      assert.notEqual(res.status, 403);
      assert.notEqual(res.status, 415);
    });

    it('rejects absent Origin with Sec-Fetch-Site: cross-site (403 FORBIDDEN_ORIGIN)', async () => {
      const res = await testEnv.request('/api/health', {
        method: 'POST',
        headers: {
          'Sec-Fetch-Site': 'cross-site',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: true }),
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error.code, 'FORBIDDEN_ORIGIN');
    });

    it('allows absent Origin with Sec-Fetch-Site: same-origin', async () => {
      const res = await testEnv.request('/api/health', {
        method: 'POST',
        headers: {
          'Sec-Fetch-Site': 'same-origin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.notEqual(res.status, 403);
    });

    it('in production mode, rejects POST when both Origin and Sec-Fetch-Site are absent (403)', async () => {
      const prodConfig = withProductionBehaviour(loadTestConfig());
      const prodEnv = await startTestServer({ config: prodConfig });
      try {
        const res = await prodEnv.request('/api/health', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ test: true }),
        });
        assert.equal(res.status, 403);
        const body = await res.json();
        assert.equal(body.error.code, 'FORBIDDEN_ORIGIN');
      } finally {
        await prodEnv.close();
      }
    });

    it('rejects state-changing request with form Content-Type (415 UNSUPPORTED_MEDIA_TYPE)', async () => {
      const res = await testEnv.request('/api/health', {
        method: 'POST',
        headers: {
          'Origin': testEnv.url,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name=test',
      });
      assert.equal(res.status, 415);
      const body = await res.json();
      assert.equal(body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    });
  });

  // ── SECT-05: Payload Size Limit ──────────────────────────────────────────
  describe('SECT-05: Request body limits (20 kB)', () => {
    it('rejects JSON payload exceeding 20 kB (20,480 bytes) with 413 PAYLOAD_TOO_LARGE', async () => {
      const largeData = 'a'.repeat(21 * 1024);
      const res = await testEnv.request('/api/health', {
        method: 'POST',
        headers: {
          'Origin': testEnv.url,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: largeData }),
      });
      assert.equal(res.status, 413);
      const body = await res.json();
      assert.equal(body.error.code, 'PAYLOAD_TOO_LARGE');
    });

    it('rejects malformed JSON body with 400 INVALID_JSON', async () => {
      const res = await testEnv.request('/api/health', {
        method: 'POST',
        headers: {
          'Origin': testEnv.url,
          'Content-Type': 'application/json',
        },
        body: '{"invalid": json}',
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'INVALID_JSON');
    });
  });

  // ── SECT-06: Unknown Fields Rejection ────────────────────────────────────
  describe('SECT-06: Unknown fields rejection schema check', () => {
    it('rejects unknown fields with 400 VALIDATION_ERROR on strict schemas', async () => {
      const { z } = await import('zod');
      const testSchema = z.object({ email: z.string() }).strict();

      const config = loadTestConfig();
      const testEnvWithSchema = await startTestServer({
        config,
        configureRoutes: (app) => {
          app.post('/api/test-schema', (req, res, next) => {
            const parsed = testSchema.safeParse(req.body);
            if (!parsed.success) {
              const err = new Error('Some fields need attention.');
              err.status = 400;
              err.code = 'VALIDATION_ERROR';
              err.fields = {};
              for (const issue of parsed.error.issues) {
                err.fields[issue.path.join('.')] = issue.message;
              }
              return next(err);
            }
            res.status(200).json({ ok: true });
          });
        },
      });

      try {
        const res = await testEnvWithSchema.request('/api/test-schema', {
          method: 'POST',
          headers: {
            'Origin': testEnvWithSchema.url,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: 'test@example.com', unknownField: true }),
        });
        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.error.code, 'VALIDATION_ERROR');
        assert.ok(body.error.fields.unknownField || Object.keys(body.error.fields).length > 0);
      } finally {
        await testEnvWithSchema.close();
      }
    });
  });

  // ── SECT-07: No Access-Control Headers ───────────────────────────────────
  describe('SECT-07: CORS restriction', () => {
    it('never emits Access-Control-* headers on any response, including OPTIONS', async () => {
      const res = await testEnv.request('/api/health', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://some-site.com',
        },
      });

      for (const [header] of res.headers.entries()) {
        assert.ok(
          !header.toLowerCase().startsWith('access-control-'),
          `Response must not contain CORS header: ${header}`,
        );
      }
    });
  });

  // ── SECT-08: No X-Powered-By & Helmet Security Headers ───────────────────
  describe('SECT-08: Server header suppression and helmet defaults', () => {
    it('does not emit X-Powered-By header', async () => {
      const res = await testEnv.request('/api/health');
      assert.equal(res.headers.get('x-powered-by'), null);
    });

    it('emits standard helmet security headers', async () => {
      const res = await testEnv.request('/api/health');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    });
  });

  // ── SECT-10: Error Envelope Sanitization ─────────────────────────────────
  describe('SECT-10: Error sanitization', () => {
    it('returns generic envelope on internal 500 error without leaking stack or SQL', async () => {
      const config = loadTestConfig();
      const errorEnv = await startTestServer({
        config,
        configureRoutes: (app) => {
          app.get('/api/forced-error', () => {
            const err = new Error('SELECT * FROM users WHERE password_hash = "secret"');
            err.detail = 'Key (email)=(admin@deskline.com) already exists';
            err.table = 'users';
            throw err;
          });
        },
      });

      try {
        const res = await errorEnv.request('/api/forced-error');
        assert.equal(res.status, 500);

        const body = await res.json();
        assert.equal(body.error.code, 'INTERNAL_ERROR');
        assert.equal(body.error.message, 'An unexpected error occurred. Please try again later.');
        assert.ok(body.error.requestId);

        const bodyStr = JSON.stringify(body);
        assert.ok(!bodyStr.includes('SELECT'));
        assert.ok(!bodyStr.includes('password_hash'));
        assert.ok(!bodyStr.includes('admin@deskline.com'));
        assert.ok(!bodyStr.includes('stack'));
      } finally {
        await errorEnv.close();
      }
    });
  });

  // ── 404 Routing Distinction ──────────────────────────────────────────────
  describe('404 Routing Handlers', () => {
    it('returns JSON ROUTE_NOT_FOUND on unknown /api/* path', async () => {
      const res = await testEnv.request('/api/non-existent-route');
      assert.equal(res.status, 404);

      const body = await res.json();
      assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
      assert.ok(body.error.requestId);
    });

    it('returns HTML notFoundPage on unknown non-API path', async () => {
      const res = await testEnv.request('/unknown-page');
      assert.equal(res.status, 404);

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/html'));

      const html = await res.text();
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('Page Not Found'));
    });
  });
});
