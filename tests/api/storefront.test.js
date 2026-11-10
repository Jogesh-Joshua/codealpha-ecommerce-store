/**
 * tests/api/storefront.test.js
 *
 * Storefront routing and static-asset serving tests (§9.2, DR-08).
 *
 * Verifies:
 * - GET / returns 200 HTML with Deskline homepage content
 * - GET /shop returns 200 HTML with Shop catalogue content
 * - All referenced CSS files return 200 text/css with appropriate caching headers
 * - Favicon (ICO and SVG) returns 200
 * - Category placeholder SVGs return 200 image/svg+xml
 * - Unknown non-API routes return 404 HTML
 * - Unknown API routes return 404 JSON (ROUTE_NOT_FOUND)
 * - API health endpoints (/api/health and /api/health?deep=1) remain fully functional
 * - Path traversal attempts are blocked and return 404
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startTestServer } from '../helpers/server.js';
import { assertSafeTestDatabase } from '../helpers/db.js';
import { loadTestConfig } from '../helpers/config.js';

const { Pool } = pg;

assertSafeTestDatabase();

describe('Storefront and Static Asset Serving', () => {
  let testEnv;
  let pool;

  before(async () => {
    const config = loadTestConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    testEnv = await startTestServer({ config, pool });
  });

  after(async () => {
    await testEnv.close();
    await pool.end();
  });

  describe('Homepage Routing (GET /)', () => {
    it('returns 200 with text/html and Deskline home content', async () => {
      const res = await testEnv.request('/');
      assert.equal(res.status, 200);

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/html'), `Expected text/html but got ${contentType}`);

      const html = await res.text();
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('Accessories for the desk you work at'));
      assert.ok(html.includes('Deskline'));
      assert.ok(html.includes('Demo store. Orders are saved, nothing ships, and no payment is taken.'));
      assert.ok(html.includes('href="/css/tokens.css"'));
      assert.ok(html.includes('href="/css/base.css"'));
      assert.ok(html.includes('href="/css/components.css"'));
      assert.ok(html.includes('href="/css/pages.css"'));
      assert.ok(html.includes('Shop by category'));
      assert.ok(html.includes('Featured products'));
    });
  });

  describe('Shop Catalogue Routing (GET /shop)', () => {
    it('returns 200 with text/html and Shop catalogue content via cleanUrls', async () => {
      const res = await testEnv.request('/shop');
      assert.equal(res.status, 200);

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/html'), `Expected text/html but got ${contentType}`);

      const html = await res.text();
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('Shop — Deskline'));
      assert.ok(html.includes('id="shop-title">Shop</h1>'));
      assert.ok(html.includes('Felt desk mat, charcoal'));
      assert.ok(html.includes('₹1,499'));
      assert.ok(html.includes('id="search"'));
      assert.ok(html.includes('id="sort-select"'));
    });

    it('returns 200 for direct /shop.html as well', async () => {
      const res = await testEnv.request('/shop.html');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Shop — Deskline'));
    });
  });

  describe('Phase 8 Clean URLs Routing', () => {
    it('GET /product returns 200 HTML with Product Details', async () => {
      const res = await testEnv.request('/product');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Product Details — Deskline'));
    });

    it('GET /cart returns 200 HTML with Cart', async () => {
      const res = await testEnv.request('/cart');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Cart — Deskline'));
    });

    it('GET /checkout returns 200 HTML with Checkout', async () => {
      const res = await testEnv.request('/checkout');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Checkout — Deskline'));
    });

    it('GET /order returns 200 HTML with Order Details', async () => {
      const res = await testEnv.request('/order');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Order Details — Deskline'));
    });

    it('GET /orders returns 200 HTML with Your orders', async () => {
      const res = await testEnv.request('/orders');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Your orders — Deskline'));
    });

    it('GET /login returns 200 HTML with Sign in', async () => {
      const res = await testEnv.request('/login');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Sign in — Deskline'));
    });

    it('GET /register returns 200 HTML with Create account', async () => {
      const res = await testEnv.request('/register');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Create account — Deskline'));
    });
  });

  describe('CSS Asset Serving (GET /css/*.css)', () => {
    it('serves /css/tokens.css with Content-Type: text/css and Cache-Control', async () => {
      const res = await testEnv.request('/css/tokens.css');
      assert.equal(res.status, 200);

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/css'), `Expected text/css but got ${contentType}`);

      const cacheControl = res.headers.get('cache-control') || '';
      assert.ok(cacheControl.includes('public'), 'Expected public cache-control');
      assert.ok(cacheControl.includes('max-age=86400'), 'Expected max-age=86400 per SEC-32');

      const css = await res.text();
      assert.ok(css.includes('--color-pine'));
      assert.ok(css.includes('--color-fog'));
      assert.ok(css.includes('--color-marigold'));
      assert.ok(css.includes('--container-max'));
    });

    it('serves /css/base.css with Content-Type: text/css', async () => {
      const res = await testEnv.request('/css/base.css');
      assert.equal(res.status, 200);

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/css'), `Expected text/css but got ${contentType}`);

      const css = await res.text();
      assert.ok(css.includes('display-xl'));
      assert.ok(css.includes('heading-1'));
      assert.ok(css.includes('skip-link'));
      assert.ok(css.includes('main:focus-visible'));
    });

    it('serves /css/components.css with Content-Type: text/css', async () => {
      const res = await testEnv.request('/css/components.css');
      assert.equal(res.status, 200);

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/css'), `Expected text/css but got ${contentType}`);

      const css = await res.text();
      assert.ok(css.includes('.button-primary'));
      assert.ok(css.includes('.product-card'));
      assert.ok(css.includes('.card-image-well'));
      assert.ok(css.includes('.announcement-bar'));
    });

    it('serves /css/pages.css with Content-Type: text/css', async () => {
      const res = await testEnv.request('/css/pages.css');
      assert.equal(res.status, 200);

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/css'), `Expected text/css but got ${contentType}`);

      const css = await res.text();
      assert.ok(css.includes('.hero-grid'));
      assert.ok(css.includes('.hotspot'));
      assert.ok(css.includes('.shop-grid'));
      assert.ok(css.includes('.spotlight-panel'));
    });
  });

  describe('Favicon & Media Assets', () => {
    it('serves /favicon.ico with 200', async () => {
      const res = await testEnv.request('/favicon.ico');
      assert.equal(res.status, 200);
      const buf = await res.arrayBuffer();
      assert.ok(buf.byteLength > 0, 'Favicon must not be empty');
    });

    it('serves /icons/favicon.svg and /favicon.svg with 200 image/svg+xml', async () => {
      const res1 = await testEnv.request('/icons/favicon.svg');
      assert.equal(res1.status, 200);
      assert.ok((res1.headers.get('content-type') || '').includes('image/svg+xml'));

      const res2 = await testEnv.request('/favicon.svg');
      assert.equal(res2.status, 200);
      assert.ok((res2.headers.get('content-type') || '').includes('image/svg+xml'));
    });

    it('serves hero and category placeholder SVGs with 200 image/svg+xml', async () => {
      const resHero = await testEnv.request('/images/hero-flatlay.svg');
      assert.equal(resHero.status, 200);
      assert.ok((resHero.headers.get('content-type') || '').includes('image/svg+xml'));

      const resCat = await testEnv.request('/images/placeholders/desk-mats.svg');
      assert.equal(resCat.status, 200);
      assert.ok((resCat.headers.get('content-type') || '').includes('image/svg+xml'));
    });
  });

  describe('Routing Boundaries & 404 Behaviour', () => {
    it('returns 404 HTML for unknown storefront route (/unknown-route)', async () => {
      const res = await testEnv.request('/unknown-route');
      assert.equal(res.status, 404);

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/html'), `Expected text/html 404 but got ${contentType}`);

      const html = await res.text();
      assert.ok(html.includes('Page Not Found'));
    });

    it('returns 404 HTML for missing static asset (/css/missing.css)', async () => {
      const res = await testEnv.request('/css/missing.css');
      assert.equal(res.status, 404);

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/html'));
    });

    it('returns 404 JSON for unknown API route (/api/non-existent-route)', async () => {
      const res = await testEnv.request('/api/non-existent-route');
      assert.equal(res.status, 404);

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('application/json'));

      const body = await res.json();
      assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
    });

    it('blocks directory traversal attempts and returns 404', async () => {
      const res = await testEnv.request('/css/../../package.json');
      assert.equal(res.status, 404);
      const text = await res.text();
      assert.ok(!text.includes('codealpha-ecommerce-store'));
    });
  });

  describe('Health API Continuity', () => {
    it('GET /api/health still returns 200 ok', async () => {
      const res = await testEnv.request('/api/health');
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, { status: 'ok' });
    });

    it('GET /api/health?deep=1 still returns 200 ok with database up', async () => {
      const res = await testEnv.request('/api/health?deep=1');
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, { status: 'ok', database: 'up' });
    });
  });
});

