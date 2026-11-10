/**
 * tests/unit/api-client.test.js
 *
 * Unit tests for the frontend API client wrapper (Phase 7 / STAT-03).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, apiRequest, ApiError } from '../../public/js/api.js';

describe('Frontend API Client (Phase 7)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects endpoints that do not start with relative /api/', async () => {
    await assert.rejects(
      () => api.get('https://external.com/api/products'),
      /API endpoints must begin with relative path \/api\//
    );
    await assert.rejects(
      () => api.get('/products'),
      /API endpoints must begin with relative path \/api\//
    );
  });

  it('sends credentials: "same-origin" and sets json headers', async () => {
    let capturedUrl;
    let capturedOptions;

    globalThis.fetch = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const res = await api.post('/api/cart/validate', { items: [] });

    assert.strictEqual(capturedUrl, '/api/cart/validate');
    assert.strictEqual(capturedOptions.credentials, 'same-origin');
    assert.strictEqual(capturedOptions.headers.get('Accept'), 'application/json');
    assert.strictEqual(capturedOptions.headers.get('Content-Type'), 'application/json');
    assert.strictEqual(capturedOptions.body, JSON.stringify({ items: [] }));
    assert.deepStrictEqual(res, { data: { ok: true } });
  });

  it('handles 204 No Content responses cleanly without parsing JSON', async () => {
    globalThis.fetch = async () => new Response(null, { status: 204 });

    const res = await api.delete('/api/orders/1');
    assert.strictEqual(res, null);
  });

  it('normalizes error responses into ApiError instances with code and details', async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        error: {
          code: 'CART_PRODUCT_NOT_FOUND',
          message: 'Product 999 not found',
          details: { productId: 999 }
        }
      }),
      {
        status: 422,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    try {
      await api.post('/api/cart/validate', { items: [{ productId: 999, quantity: 1 }] });
      assert.fail('Expected ApiError to be thrown');
    } catch (err) {
      assert.ok(err instanceof ApiError);
      assert.strictEqual(err.status, 422);
      assert.strictEqual(err.code, 'CART_PRODUCT_NOT_FOUND');
      assert.strictEqual(err.message, 'Product 999 not found');
      assert.deepStrictEqual(err.details, { productId: 999 });
    }
  });

  it('handles non-JSON error bodies gracefully (e.g. 500 HTML error page)', async () => {
    globalThis.fetch = async () => new Response('Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });

    try {
      await api.get('/api/products');
      assert.fail('Expected ApiError to be thrown');
    } catch (err) {
      assert.ok(err instanceof ApiError);
      assert.strictEqual(err.status, 500);
      assert.strictEqual(err.code, 'SERVER_ERROR');
    }
  });
});

