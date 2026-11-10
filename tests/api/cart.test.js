/**
 * tests/api/cart.test.js
 *
 * Phase 5: Cart validation API tests (API-21 to API-30, API-64).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startTestServer } from '../helpers/server.js';
import { assertSafeTestDatabase, getTestClient, resetTestDb } from '../helpers/db.js';
import { loadTestConfig } from '../helpers/config.js';

const { Pool } = pg;

assertSafeTestDatabase();

describe('Cart Validation API (API-21 to API-30, API-64)', () => {
  let testEnv;
  let pool;
  let client;

  before(async () => {
    client = await getTestClient();
    await resetTestDb(client);

    const config = loadTestConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    testEnv = await startTestServer({ config, pool });
  });

  after(async () => {
    await testEnv.close();
    await pool.end();
    await client.end();
  });

  beforeEach(() => {
    testEnv.jar.clear();
  });

  // ---------------------------------------------------------------------------
  // API-21: Valid lines and hand-calculated INR paise totals
  // ---------------------------------------------------------------------------
  it('API-21: valid lines return status ok and hand-calculated INR paise totals', async () => {
    // Product 1: felt-desk-mat-charcoal (price_minor: 149900) × 2 = 299800
    // Product 9: aluminium-laptop-stand (price_minor: 249900) × 1 = 249900
    // Subtotal: 299800 + 249900 = 549700
    // Shipping: 9900
    // Total: 559600
    // Item count: 3
    const res = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.10',
      },
      body: JSON.stringify({
        items: [
          { productId: 1, quantity: 2 },
          { productId: 9, quantity: 1 },
        ],
      }),
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');

    const data = await res.json();
    assert.equal(data.hasBlockingIssues, false);
    assert.equal(data.lines.length, 2);

    // Line 0
    const line0 = data.lines[0];
    assert.equal(line0.productId, 1);
    assert.equal(line0.slug, 'felt-desk-mat-charcoal');
    assert.equal(line0.name, 'Felt desk mat, charcoal');
    assert.equal(line0.unitPriceMinor, 149900);
    assert.equal(line0.requestedQuantity, 2);
    assert.equal(line0.status, 'ok');
    assert.equal(line0.allowedQuantity, 2);
    assert.equal(line0.lineTotalMinor, 299800);
    assert.deepEqual(line0.issues, []);
    if (line0.image) {
      assert.ok(line0.image.url.startsWith('/images/'));
      assert.ok(Number.isSafeInteger(line0.image.width));
      assert.ok(Number.isSafeInteger(line0.image.height));
    }

    // Line 1
    const line1 = data.lines[1];
    assert.equal(line1.productId, 9);
    assert.equal(line1.slug, 'aluminium-laptop-stand');
    assert.equal(line1.name, 'Aluminium laptop stand');
    assert.equal(line1.unitPriceMinor, 249900);
    assert.equal(line1.requestedQuantity, 1);
    assert.equal(line1.status, 'ok');
    assert.equal(line1.allowedQuantity, 1);
    assert.equal(line1.lineTotalMinor, 249900);
    assert.deepEqual(line1.issues, []);

    // Summary
    assert.equal(data.summary.subtotalMinor, 549700);
    assert.equal(data.summary.shippingMinor, 9900);
    assert.equal(data.summary.totalMinor, 559600);
    assert.equal(data.summary.currency, 'INR');
    assert.equal(data.summary.itemCount, 3);

    // API-64: verify safe integers
    assert.ok(Number.isSafeInteger(data.summary.subtotalMinor));
    assert.ok(Number.isSafeInteger(data.summary.shippingMinor));
    assert.ok(Number.isSafeInteger(data.summary.totalMinor));
    assert.ok(Number.isSafeInteger(data.summary.itemCount));
    assert.ok(Number.isSafeInteger(line0.productId));
    assert.ok(Number.isSafeInteger(line0.unitPriceMinor));
    assert.ok(Number.isSafeInteger(line0.requestedQuantity));
    assert.ok(Number.isSafeInteger(line0.allowedQuantity));
    assert.ok(Number.isSafeInteger(line0.lineTotalMinor));
  });

  // ---------------------------------------------------------------------------
  // API-22: Duplicate product IDs merge correctly
  // ---------------------------------------------------------------------------
  it('API-22: duplicate product IDs merge correctly by summing quantities', async () => {
    // Product 1 × 2 + Product 9 × 1 + Product 1 × 3 => Product 1 × 5, Product 9 × 1
    // Product 1: 149900 × 5 = 749500
    // Product 9: 249900 × 1 = 249900
    // Subtotal: 999400
    const res = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.11',
      },
      body: JSON.stringify({
        items: [
          { productId: 1, quantity: 2 },
          { productId: 9, quantity: 1 },
          { productId: 1, quantity: 3 },
        ],
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.lines.length, 2);
    assert.equal(data.lines[0].productId, 1);
    assert.equal(data.lines[0].requestedQuantity, 5);
    assert.equal(data.lines[0].allowedQuantity, 5);
    assert.equal(data.lines[0].lineTotalMinor, 749500);
    assert.equal(data.lines[0].status, 'ok');

    assert.equal(data.lines[1].productId, 9);
    assert.equal(data.lines[1].requestedQuantity, 1);
    assert.equal(data.lines[1].allowedQuantity, 1);
    assert.equal(data.lines[1].lineTotalMinor, 249900);
    assert.equal(data.lines[1].status, 'ok');

    assert.equal(data.summary.subtotalMinor, 999400);
    assert.equal(data.summary.itemCount, 6);
    assert.equal(data.hasBlockingIssues, false);
  });

  // ---------------------------------------------------------------------------
  // API-23: Quantity above stock returns quantity_reduced and INSUFFICIENT_STOCK
  // ---------------------------------------------------------------------------
  it('API-23: quantity above stock returns quantity_reduced, allowedQuantity, INSUFFICIENT_STOCK, and blocking issue', async () => {
    // Product 2: felt-desk-mat-moss has stock_quantity = 3 in catalog
    const res = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.12',
      },
      body: JSON.stringify({
        items: [{ productId: 2, quantity: 4 }],
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.hasBlockingIssues, true);
    assert.equal(data.lines.length, 1);

    const line = data.lines[0];
    assert.equal(line.productId, 2);
    assert.equal(line.slug, 'felt-desk-mat-moss');
    assert.equal(line.status, 'quantity_reduced');
    assert.equal(line.requestedQuantity, 4);
    assert.equal(line.allowedQuantity, 3);
    assert.equal(line.lineTotalMinor, 0); // Not included in payable subtotal
    assert.equal(line.issues.length, 1);
    assert.equal(line.issues[0].code, 'INSUFFICIENT_STOCK');
    assert.equal(line.issues[0].message, 'Only 3 are available.');

    assert.equal(data.summary.subtotalMinor, 0);
    assert.equal(data.summary.shippingMinor, 0);
    assert.equal(data.summary.totalMinor, 0);
    assert.equal(data.summary.itemCount, 0);
  });

  // ---------------------------------------------------------------------------
  // API-24: Zero stock returns out_of_stock
  // ---------------------------------------------------------------------------
  it('API-24: stock 0 returns out_of_stock', async () => {
    // Product 4: wireless-charging-desk-mat has stock_quantity = 0 in catalog
    const res = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.13',
      },
      body: JSON.stringify({
        items: [{ productId: 4, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.hasBlockingIssues, true);
    assert.equal(data.lines.length, 1);

    const line = data.lines[0];
    assert.equal(line.productId, 4);
    assert.equal(line.slug, 'wireless-charging-desk-mat');
    assert.equal(line.status, 'out_of_stock');
    assert.equal(line.requestedQuantity, 1);
    assert.equal(line.allowedQuantity, 0);
    assert.equal(line.lineTotalMinor, 0);
    assert.equal(line.issues.length, 1);
    assert.equal(line.issues[0].code, 'OUT_OF_STOCK');

    assert.equal(data.summary.subtotalMinor, 0);
    assert.equal(data.summary.shippingMinor, 0);
  });

  // ---------------------------------------------------------------------------
  // API-25: Unknown and inactive product IDs return unavailable
  // ---------------------------------------------------------------------------
  it('API-25: unknown and inactive product IDs return unavailable', async () => {
    // Product 21: archived-basic-mouse-pad (is_active: false)
    // Product 99999: does not exist in catalog
    const res = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.14',
      },
      body: JSON.stringify({
        items: [
          { productId: 21, quantity: 1 },
          { productId: 99999, quantity: 2 },
        ],
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.hasBlockingIssues, true);
    assert.equal(data.lines.length, 2);

    // Inactive product 21
    const line0 = data.lines[0];
    assert.equal(line0.productId, 21);
    assert.equal(line0.status, 'unavailable');
    assert.equal(line0.allowedQuantity, 0);
    assert.equal(line0.lineTotalMinor, 0);
    assert.equal(line0.issues.length, 1);
    assert.equal(line0.issues[0].code, 'PRODUCT_UNAVAILABLE');

    // Non-existent product 99999
    const line1 = data.lines[1];
    assert.equal(line1.productId, 99999);
    assert.equal(line1.status, 'unavailable');
    assert.equal(line1.allowedQuantity, 0);
    assert.equal(line1.lineTotalMinor, 0);
    assert.equal(line1.issues.length, 1);
    assert.equal(line1.issues[0].code, 'PRODUCT_UNAVAILABLE');

    assert.equal(data.summary.subtotalMinor, 0);
    assert.equal(data.summary.shippingMinor, 0);
  });

  // ---------------------------------------------------------------------------
  // API-26: Quantity 11 is capped at 10 with QUANTITY_CAPPED
  // ---------------------------------------------------------------------------
  it('API-26: quantity 11 for a well-stocked product returns quantity_reduced with QUANTITY_CAPPED and allowedQuantity 10', async () => {
    // Product 1 has stock_quantity = 40 (well-stocked)
    const res = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.15',
      },
      body: JSON.stringify({
        items: [{ productId: 1, quantity: 11 }],
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.hasBlockingIssues, true);
    assert.equal(data.lines.length, 1);

    const line = data.lines[0];
    assert.equal(line.productId, 1);
    assert.equal(line.status, 'quantity_reduced');
    assert.equal(line.requestedQuantity, 11);
    assert.equal(line.allowedQuantity, 10);
    assert.equal(line.lineTotalMinor, 0);
    assert.equal(line.issues.length, 1);
    assert.equal(line.issues[0].code, 'QUANTITY_CAPPED');
    assert.equal(line.issues[0].message, 'Quantity is capped at 10 per item.');

    assert.equal(data.summary.subtotalMinor, 0);
    assert.equal(data.summary.shippingMinor, 0);
  });

  // ---------------------------------------------------------------------------
  // API-27: Summary counts only ok lines; shipping is zero with no ok lines
  // ---------------------------------------------------------------------------
  it('API-27: summary counts only ok lines; with no ok lines shippingMinor is 0', async () => {
    // Cart with 1 valid line, 1 out of stock line, 1 inactive line, 1 reduced line
    const res1 = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.16',
      },
      body: JSON.stringify({
        items: [
          { productId: 1, quantity: 2 }, // ok: 149900 × 2 = 299800
          { productId: 4, quantity: 1 }, // out_of_stock
          { productId: 21, quantity: 1 }, // unavailable
          { productId: 2, quantity: 5 }, // quantity_reduced (stock 3)
        ],
      }),
    });

    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.hasBlockingIssues, true);
    assert.equal(data1.summary.subtotalMinor, 299800);
    assert.equal(data1.summary.shippingMinor, 9900);
    assert.equal(data1.summary.totalMinor, 309700);
    assert.equal(data1.summary.itemCount, 2);

    // Cart with only non-ok lines
    const res2 = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.17',
      },
      body: JSON.stringify({
        items: [
          { productId: 4, quantity: 1 },
          { productId: 21, quantity: 1 },
        ],
      }),
    });

    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.hasBlockingIssues, true);
    assert.equal(data2.summary.subtotalMinor, 0);
    assert.equal(data2.summary.shippingMinor, 0);
    assert.equal(data2.summary.totalMinor, 0);
    assert.equal(data2.summary.itemCount, 0);
  });

  // ---------------------------------------------------------------------------
  // API-28: Invalid payloads, 51 lines, non-integer and negative values return 400; empty array returns 200
  // ---------------------------------------------------------------------------
  it('API-28: 51 lines, non-integer, negative, non-array return 400; empty array returns 200 with empty summary', async () => {
    // Empty array returns 200 with empty summary
    const emptyRes = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.18',
      },
      body: JSON.stringify({ items: [] }),
    });
    assert.equal(emptyRes.status, 200);
    const emptyData = await emptyRes.json();
    assert.deepEqual(emptyData.lines, []);
    assert.equal(emptyData.summary.subtotalMinor, 0);
    assert.equal(emptyData.summary.shippingMinor, 0);
    assert.equal(emptyData.summary.totalMinor, 0);
    assert.equal(emptyData.summary.itemCount, 0);
    assert.equal(emptyData.hasBlockingIssues, false);

    // 51 lines returns 400
    const items51 = [];
    for (let i = 1; i <= 51; i++) {
      items51.push({ productId: 1, quantity: 1 });
    }
    const res51 = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.19',
      },
      body: JSON.stringify({ items: items51 }),
    });
    assert.equal(res51.status, 400);
    const data51 = await res51.json();
    assert.equal(data51.error.code, 'VALIDATION_ERROR');

    // Non-array items returns 400
    const resNonArray = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.20',
      },
      body: JSON.stringify({ items: 'not-an-array' }),
    });
    assert.equal(resNonArray.status, 400);

    // Negative quantity returns 400
    const resNegQty = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.21',
      },
      body: JSON.stringify({ items: [{ productId: 1, quantity: -2 }] }),
    });
    assert.equal(resNegQty.status, 400);

    // Zero quantity returns 400
    const resZeroQty = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.22',
      },
      body: JSON.stringify({ items: [{ productId: 1, quantity: 0 }] }),
    });
    assert.equal(resZeroQty.status, 400);

    // Non-integer float quantity returns 400
    const resFloatQty = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.23',
      },
      body: JSON.stringify({ items: [{ productId: 1, quantity: 1.5 }] }),
    });
    assert.equal(resFloatQty.status, 400);

    // String quantity returns 400
    const resStrQty = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.24',
      },
      body: JSON.stringify({ items: [{ productId: 1, quantity: '2' }] }),
    });
    assert.equal(resStrQty.status, 400);

    // Negative productId returns 400
    const resNegId = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.25',
      },
      body: JSON.stringify({ items: [{ productId: -1, quantity: 1 }] }),
    });
    assert.equal(resNegId.status, 400);

    // String productId returns 400
    const resStrId = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.26',
      },
      body: JSON.stringify({ items: [{ productId: '1', quantity: 1 }] }),
    });
    assert.equal(resStrId.status, 400);

    // Unknown fields in item returns 400
    const resUnknownField = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.27',
      },
      body: JSON.stringify({ items: [{ productId: 1, quantity: 1, price: 500 }] }),
    });
    assert.equal(resUnknownField.status, 400);
  });

  // ---------------------------------------------------------------------------
  // API-29: Works without a session cookie
  // ---------------------------------------------------------------------------
  it('API-29: works without a session cookie', async () => {
    testEnv.jar.clear();
    const res = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.28',
      },
      body: JSON.stringify({
        items: [{ productId: 1, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.lines.length, 1);
    assert.equal(data.lines[0].productId, 1);
    assert.equal(data.lines[0].status, 'ok');
  });

  // ---------------------------------------------------------------------------
  // API-30: 121st request from one IP inside 10 minutes returns 429 with Retry-After
  // ---------------------------------------------------------------------------
  it('API-30: the 121st request from one IP inside 10 minutes returns 429 with Retry-After', async () => {
    const rateLimitIp = '198.51.100.99';
    const payload = JSON.stringify({ items: [] });

    // Clean any prior rate limit records for this test IP
    await pool.query(
      `DELETE FROM rate_limits WHERE bucket = 'cart_ip'`
    );

    // Send 120 requests in parallel batches of 20
    for (let batch = 0; batch < 6; batch++) {
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          testEnv.request('/api/cart/validate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Forwarded-For': rateLimitIp,
            },
            body: payload,
          })
        );
      }
      const responses = await Promise.all(promises);
      for (const res of responses) {
        assert.equal(res.status, 200);
      }
    }

    // 121st request should be rejected with 429 RATE_LIMITED
    const blockedRes = await testEnv.request('/api/cart/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': rateLimitIp,
      },
      body: payload,
    });

    assert.equal(blockedRes.status, 429);
    const retryAfter = blockedRes.headers.get('retry-after');
    assert.ok(retryAfter, 'Expected Retry-After header on 429 response');
    assert.ok(Number(retryAfter) > 0, 'Retry-After should be a positive integer');

    const blockedData = await blockedRes.json();
    assert.equal(blockedData.error.code, 'RATE_LIMITED');
  });
});

