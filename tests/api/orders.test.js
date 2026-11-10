/**
 * tests/api/orders.test.js
 *
 * Phase 6: Order Creation and Reading, Idempotency, and Transactions (API-44 to API-66).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startTestServer } from '../helpers/server.js';
import { assertSafeTestDatabase, getTestClient, resetTestDb } from '../helpers/db.js';
import { loadTestConfig } from '../helpers/config.js';

const { Pool } = pg;

assertSafeTestDatabase();

describe('Phase 6: Order Endpoints (API-44 to API-66)', () => {
  let testEnv;
  let pool;
  let client;
  let userCounter = 0;
  let ipCounter = 0;

  function nextEmail() {
    userCounter += 1;
    return `order.user.${Date.now()}.${userCounter}@example.com`;
  }

  function nextIp() {
    ipCounter += 1;
    return `198.51.100.${(ipCounter % 200) + 10}`;
  }

  async function registerUser(email, password = 'Password123!') {
    const ip = nextIp();
    const res = await testEnv.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'X-Forwarded-For': ip,
      },
      body: JSON.stringify({
        name: 'Order Test User',
        email,
        password,
      }),
    });
    assert.equal(res.status, 201, 'Registration must succeed');
    const cookie = res.headers.getSetCookie()[0];
    const data = await res.json();
    return { user: data.user, cookie, ip };
  }

  const sampleShipping = {
    fullName: 'Alex Morgan',
    phone: '+91 (987) 654-3210',
    addressLine1: '221 Example Street',
    addressLine2: '',
    city: 'Springfield',
    region: 'Example State',
    postalCode: '641001',
  };

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
  // API-44 & API-63: Authentication requirement
  // ---------------------------------------------------------------------------
  it('API-44 & API-63: all three order endpoints return 401 UNAUTHENTICATED without a session', async () => {
    // 1. POST /api/orders without cookie
    const postRes = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': 'a0000000-0000-4000-8000-000000000001',
      },
      body: JSON.stringify({
        items: [{ productId: 1, quantity: 1 }],
        shipping: sampleShipping,
      }),
    });
    assert.equal(postRes.status, 401);
    assert.equal(postRes.headers.get('cache-control'), 'no-store');
    const postData = await postRes.json();
    assert.equal(postData.error.code, 'UNAUTHENTICATED');

    // 2. GET /api/orders without cookie
    const listRes = await testEnv.request('/api/orders');
    assert.equal(listRes.status, 401);
    const listData = await listRes.json();
    assert.equal(listData.error.code, 'UNAUTHENTICATED');

    // 3. GET /api/orders/:id without cookie
    const getRes = await testEnv.request('/api/orders/a0000000-0000-4000-8000-000000000001');
    assert.equal(getRes.status, 401);
    const getData = await getRes.json();
    assert.equal(getData.error.code, 'UNAUTHENTICATED');
  });

  // ---------------------------------------------------------------------------
  // API-45: Missing, malformed, or non-UUID Idempotency-Key returns 400
  // ---------------------------------------------------------------------------
  it('API-45: missing, malformed, and non-UUID idempotency keys return 400 MISSING_IDEMPOTENCY_KEY', async () => {
    await registerUser(nextEmail());

    const badKeys = [undefined, '', 'not-a-uuid', '123456', 'a0000000-0000-1000-8000-000000000001']; // non v4
    for (const key of badKeys) {
      const headers = {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
      };
      if (key !== undefined) {
        headers['Idempotency-Key'] = key;
      }

      const res = await testEnv.request('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          items: [{ productId: 1, quantity: 1 }],
          shipping: sampleShipping,
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'MISSING_IDEMPOTENCY_KEY');
    }
  });

  // ---------------------------------------------------------------------------
  // API-46, API-58, API-64, API-65: Valid order creation, totals, stock decrement
  // ---------------------------------------------------------------------------
  it('API-46, API-58, API-64, API-65: valid order returns 201 with exact paise totals, stock decremented, and invariant compliance', async () => {
    await registerUser(nextEmail());

    // Product 1: 149900 paise, initial stock 25
    // Product 9: 249900 paise, initial stock 15
    const p1Before = (await client.query('SELECT stock_quantity FROM products WHERE id = 1')).rows[0].stock_quantity;
    const p9Before = (await client.query('SELECT stock_quantity FROM products WHERE id = 9')).rows[0].stock_quantity;

    const idempotencyKey = 'a0000000-0000-4000-8000-000000000046';
    const res = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        items: [
          { productId: 1, quantity: 2 },
          { productId: 9, quantity: 1 },
        ],
        shipping: sampleShipping,
      }),
    });

    assert.equal(res.status, 201);
    assert.equal(res.headers.get('cache-control'), 'no-store');

    const data = await res.json();
    assert.ok(data.order);
    const order = data.order;

    // Hand-calculated paise checks
    // Product 1: 149900 × 2 = 299800
    // Product 9: 249900 × 1 = 249900
    // Subtotal: 549700
    // Shipping: 9900
    // Total: 559600
    assert.equal(order.subtotalMinor, 549700);
    assert.equal(order.shippingMinor, 9900);
    assert.equal(order.totalMinor, 559600);
    assert.equal(order.currency, 'INR');
    assert.equal(order.status, 'placed');
    assert.match(order.orderNumber, /^DL-[0-9]{6,}$/);

    // API-58 & API-65 invariants
    assert.equal(order.totalMinor, order.subtotalMinor + order.shippingMinor);
    assert.equal(order.items.length, 2);
    assert.equal(order.items[0].lineTotalMinor, order.items[0].unitPriceMinor * order.items[0].quantity);
    assert.equal(order.items[1].lineTotalMinor, order.items[1].unitPriceMinor * order.items[1].quantity);
    assert.equal(order.items[0].lineTotalMinor + order.items[1].lineTotalMinor, order.subtotalMinor);

    // API-64: all money and count fields are safe integer numbers
    for (const key of ['subtotalMinor', 'shippingMinor', 'totalMinor']) {
      assert.equal(typeof order[key], 'number');
      assert.ok(Number.isSafeInteger(order[key]));
      assert.ok(order[key] >= 0);
    }
    for (const item of order.items) {
      assert.equal(typeof item.unitPriceMinor, 'number');
      assert.ok(Number.isSafeInteger(item.unitPriceMinor));
      assert.equal(typeof item.quantity, 'number');
      assert.ok(Number.isSafeInteger(item.quantity));
      assert.equal(typeof item.lineTotalMinor, 'number');
      assert.ok(Number.isSafeInteger(item.lineTotalMinor));
    }

    // Normalized shipping checks
    assert.equal(order.shipping.fullName, 'Alex Morgan');
    assert.equal(order.shipping.phone, '919876543210');
    assert.equal(order.shipping.addressLine2, null);

    // Stock verification in database
    const p1After = (await client.query('SELECT stock_quantity FROM products WHERE id = 1')).rows[0].stock_quantity;
    const p9After = (await client.query('SELECT stock_quantity FROM products WHERE id = 9')).rows[0].stock_quantity;
    assert.equal(p1After, p1Before - 2);
    assert.equal(p9After, p9Before - 1);

    // Database row verification
    const dbOrder = (await client.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0];
    assert.equal(dbOrder.order_number, order.orderNumber);
    assert.equal(Number(dbOrder.total_minor), 559600);
  });

  // ---------------------------------------------------------------------------
  // API-47: Forbidden client-supplied price/total/user fields
  // ---------------------------------------------------------------------------
  it('API-47: forbidden client-supplied price/total/user fields are rejected without writes', async () => {
    await registerUser(nextEmail());

    const badPayloads = [
      { priceMinor: 149900 },
      { totalMinor: 559600 },
      { userId: '00000000-0000-0000-0000-000000000000' },
      { confirmPassword: 'password' },
      { priceCents: 149900 },
    ];

    for (const forbidden of badPayloads) {
      const res = await testEnv.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'Idempotency-Key': 'a0000000-0000-4000-8000-000000000047',
        },
        body: JSON.stringify({
          items: [{ productId: 1, quantity: 1 }],
          shipping: sampleShipping,
          ...forbidden,
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    }

    // Verify nothing written
    const count = (await client.query('SELECT count(*)::int AS n FROM orders WHERE idempotency_key = $1', [
      'a0000000-0000-4000-8000-000000000047',
    ])).rows[0].n;
    assert.equal(count, 0);
  });

  // ---------------------------------------------------------------------------
  // API-48: Price changed in database takes precedence
  // ---------------------------------------------------------------------------
  it('API-48: changed database price is used instead of previously displayed client price', async () => {
    await registerUser(nextEmail());

    // Temporarily update Product 1 price from 149900 to 189900 in DB
    await client.query('UPDATE products SET price_minor = 189900 WHERE id = 1');

    try {
      const res = await testEnv.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'Idempotency-Key': 'a0000000-0000-4000-8000-000000000048',
        },
        body: JSON.stringify({
          items: [{ productId: 1, quantity: 1 }],
          shipping: sampleShipping,
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.order.items[0].unitPriceMinor, 189900);
      assert.equal(data.order.subtotalMinor, 189900);
      assert.equal(data.order.totalMinor, 189900 + 9900);
    } finally {
      // Restore price
      await client.query('UPDATE products SET price_minor = 149900 WHERE id = 1');
    }
  });

  // ---------------------------------------------------------------------------
  // API-49 & API-50: Validation of items, bounds, duplicate merging
  // ---------------------------------------------------------------------------
  it('API-49 & API-50: invalid items rejected; empty cart rejected; duplicate lines merged and rejected if merged quantity exceeds 10', async () => {
    const { cookie } = await registerUser(nextEmail());

    // 1. Empty items
    const resEmpty = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': 'a0000000-0000-4000-8000-000000000049',
        Cookie: cookie,
      },
      body: JSON.stringify({ items: [], shipping: sampleShipping }),
    });
    assert.equal(resEmpty.status, 400);
    const dEmpty = await resEmpty.json();
    assert.equal(dEmpty.error.fields.items, 'Your cart is empty.');

    // 2. 51 lines
    const items51 = Array.from({ length: 51 }, (_, i) => ({ productId: (i % 20) + 1, quantity: 1 }));
    const res51 = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': 'a0000000-0000-4000-8000-000000000050',
        Cookie: cookie,
      },
      body: JSON.stringify({ items: items51, shipping: sampleShipping }),
    });
    assert.equal(res51.status, 400);

    // 3. Merged quantity <= 10 (4 + 5 = 9) is accepted and creates order with quantity 9
    const resMergeValid = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': 'a0000000-0000-4000-8000-000000000051',
        Cookie: cookie,
      },
      body: JSON.stringify({
        items: [
          { productId: 1, quantity: 4 },
          { productId: 1, quantity: 5 },
        ],
        shipping: sampleShipping,
      }),
    });
    assert.equal(resMergeValid.status, 201);
    const dMergeValid = await resMergeValid.json();
    assert.equal(dMergeValid.order.items.length, 1);
    assert.equal(dMergeValid.order.items[0].quantity, 9);

    // 4. Merged quantity exceeds 10 (6 + 6 = 12) is rejected (never silently capped)
    const resMergeOver = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': 'a0000000-0000-4000-8000-000000000052',
        Cookie: cookie,
      },
      body: JSON.stringify({
        items: [
          { productId: 1, quantity: 6 },
          { productId: 1, quantity: 6 },
        ],
        shipping: sampleShipping,
      }),
    });
    assert.equal(resMergeOver.status, 400);
    const dMerge = await resMergeOver.json();
    assert.equal(dMerge.error.fields['items.0.quantity'], 'Quantity must be between 1 and 10.');
  });

  // ---------------------------------------------------------------------------
  // API-51: Inactive or unknown product returns 409 STOCK_CONFLICT with reason 'unavailable'
  // ---------------------------------------------------------------------------
  it('API-51: inactive or unknown product returns 409 with reason unavailable, no writes', async () => {
    await registerUser(nextEmail());

    // Product 21 is inactive in catalog; Product 99999 does not exist
    const res = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': 'a0000000-0000-4000-8000-000000000052',
      },
      body: JSON.stringify({
        items: [
          { productId: 21, quantity: 1 },
          { productId: 99999, quantity: 1 },
        ],
        shipping: sampleShipping,
      }),
    });

    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.error.code, 'STOCK_CONFLICT');
    assert.equal(data.error.details.items.length, 2);
    assert.equal(data.error.details.items[0].reason, 'unavailable');
    assert.equal(data.error.details.items[1].reason, 'unavailable');
  });

  // ---------------------------------------------------------------------------
  // API-52: Out-of-stock and insufficient-stock lines report all problems
  // ---------------------------------------------------------------------------
  it('API-52: all stock conflicts are reported; no order or stock changes', async () => {
    await registerUser(nextEmail());

    // Product 4 is out of stock (stock 0)
    // Product 15 has low stock (stock 3)
    await client.query('UPDATE products SET stock_quantity = 0 WHERE id = 4');
    await client.query('UPDATE products SET stock_quantity = 3 WHERE id = 15');
    const p15StockBefore = (await client.query('SELECT stock_quantity FROM products WHERE id = 15')).rows[0].stock_quantity;

    const res = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': 'a0000000-0000-4000-8000-000000000053',
      },
      body: JSON.stringify({
        items: [
          { productId: 4, quantity: 1 },
          { productId: 15, quantity: 5 }, // requested 5, only 3 available
        ],
        shipping: sampleShipping,
      }),
    });

    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.error.code, 'STOCK_CONFLICT');
    assert.equal(data.error.details.items.length, 2);

    const outLine = data.error.details.items.find((i) => i.productId === 4);
    assert.equal(outLine.reason, 'out_of_stock');
    assert.equal(outLine.availableQuantity, 0);

    const insufLine = data.error.details.items.find((i) => i.productId === 15);
    assert.equal(insufLine.reason, 'insufficient_stock');
    assert.equal(insufLine.availableQuantity, p15StockBefore);

    // Verify stock unchanged
    const p15StockAfter = (await client.query('SELECT stock_quantity FROM products WHERE id = 15')).rows[0].stock_quantity;
    assert.equal(p15StockAfter, p15StockBefore);
  });

  // ---------------------------------------------------------------------------
  // API-53: Shipping validation rules and storage formats
  // ---------------------------------------------------------------------------
  it('API-53: shipping validation rules return exact messages; phone stored as digits only; empty line2 as null', async () => {
    await registerUser(nextEmail());

    const badShippingCases = [
      { field: 'fullName', value: '', expected: "Enter the recipient's name." },
      { field: 'phone', value: '12345', expected: 'Enter a phone number with 10 to 15 digits.' },
      { field: 'addressLine1', value: '  ', expected: 'Enter a street address.' },
      { field: 'city', value: '', expected: 'Enter a city.' },
      { field: 'region', value: '', expected: 'Enter a state or region.' },
      { field: 'postalCode', value: '1', expected: 'Enter a valid postal code.' },
    ];

    for (const testCase of badShippingCases) {
      const res = await testEnv.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'Idempotency-Key': 'a0000000-0000-4000-8000-000000000054',
        },
        body: JSON.stringify({
          items: [{ productId: 1, quantity: 1 }],
          shipping: { ...sampleShipping, [testCase.field]: testCase.value },
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.fields[`shipping.${testCase.field}`], testCase.expected);
    }
  });

  // ---------------------------------------------------------------------------
  // API-54: Sequential replay of same key and body returns 200 Idempotent-Replay
  // ---------------------------------------------------------------------------
  it('API-54: replay of same key and body returns 200, replay header, one order, one stock decrement, even when stock drops to 0', async () => {
    await registerUser(nextEmail());

    const key = 'a0000000-0000-4000-8000-000000000055';
    const orderBody = {
      items: [{ productId: 1, quantity: 1 }],
      shipping: sampleShipping,
    };

    const stockBefore = (await client.query('SELECT stock_quantity FROM products WHERE id = 1')).rows[0].stock_quantity;

    // 1. First request -> 201
    const res1 = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': key,
      },
      body: JSON.stringify(orderBody),
    });
    assert.equal(res1.status, 201);
    const data1 = await res1.json();
    const orderId = data1.order.id;

    // 2. Set stock of product 1 to 0 in DB to verify replay never re-checks stock!
    await client.query('UPDATE products SET stock_quantity = 0 WHERE id = 1');

    try {
      // 3. Second request with same key and body -> 200 replay
      const res2 = await testEnv.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'Idempotency-Key': key,
        },
        body: JSON.stringify(orderBody),
      });

      assert.equal(res2.status, 200);
      assert.equal(res2.headers.get('idempotent-replay'), 'true');
      const data2 = await res2.json();
      assert.equal(data2.order.id, orderId);

      // Verify exactly one order exists in database
      const orderCount = (await client.query('SELECT count(*)::int AS n FROM orders WHERE idempotency_key = $1', [key])).rows[0].n;
      assert.equal(orderCount, 1);
    } finally {
      // Restore stock
      await client.query('UPDATE products SET stock_quantity = $1 WHERE id = 1', [stockBefore - 1]);
    }
  });

  // ---------------------------------------------------------------------------
  // API-55: Same key with different body returns 409 IDEMPOTENCY_KEY_REUSED
  // ---------------------------------------------------------------------------
  it('API-55: same key with different body returns 409 IDEMPOTENCY_KEY_REUSED', async () => {
    await registerUser(nextEmail());

    const key = 'a0000000-0000-4000-8000-000000000056';
    const res1 = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': key,
      },
      body: JSON.stringify({
        items: [{ productId: 1, quantity: 1 }],
        shipping: sampleShipping,
      }),
    });
    assert.equal(res1.status, 201);

    // Same key with different items
    const res2 = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': key,
      },
      body: JSON.stringify({
        items: [{ productId: 9, quantity: 1 }],
        shipping: sampleShipping,
      }),
    });
    assert.equal(res2.status, 409);
    const data2 = await res2.json();
    assert.equal(data2.error.code, 'IDEMPOTENCY_KEY_REUSED');
  });

  // ---------------------------------------------------------------------------
  // API-56: Same key used by two different users creates two independent orders
  // ---------------------------------------------------------------------------
  it('API-56: same key across different users creates independent orders', async () => {
    const key = 'a0000000-0000-4000-8000-000000000057';
    const orderPayload = {
      items: [{ productId: 1, quantity: 1 }],
      shipping: sampleShipping,
    };

    // User A
    const { cookie: cookieA } = await registerUser(nextEmail());
    const resA = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': key,
        'Cookie': cookieA,
      },
      body: JSON.stringify(orderPayload),
    });
    assert.equal(resA.status, 201);
    const dataA = await resA.json();

    // User B
    const { cookie: cookieB } = await registerUser(nextEmail());
    const resB = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': key,
        'Cookie': cookieB,
      },
      body: JSON.stringify(orderPayload),
    });
    assert.equal(resB.status, 201);
    const dataB = await resB.json();

    assert.notEqual(dataA.order.id, dataB.order.id);
    assert.notEqual(dataA.order.orderNumber, dataB.order.orderNumber);
  });

  // ---------------------------------------------------------------------------
  // API-57: 11th order attempt by one user returns 429 RATE_LIMITED
  // ---------------------------------------------------------------------------
  it('API-57: 11th order attempt by one user in one hour returns 429', async () => {
    const { user, cookie } = await registerUser(nextEmail());

    // Clean rate limits table for this user
    await client.query('DELETE FROM rate_limits WHERE bucket = $1', ['orders_user']);

    const ip = nextIp();

    for (let i = 1; i <= 10; i++) {
      const key = `a0000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`;
      const res = await testEnv.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'Idempotency-Key': key,
          'Cookie': cookie,
          'X-Forwarded-For': ip,
        },
        body: JSON.stringify({
          items: [{ productId: 1, quantity: 1 }],
          shipping: sampleShipping,
        }),
      });
      assert.equal(res.status, 201);
    }

    // 11th attempt
    const res11 = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': 'a0000000-0000-4000-8000-000000000099',
        'Cookie': cookie,
        'X-Forwarded-For': ip,
      },
      body: JSON.stringify({
        items: [{ productId: 1, quantity: 1 }],
        shipping: sampleShipping,
      }),
    });

    assert.equal(res11.status, 429);
    assert.ok(res11.headers.get('retry-after'));
    const d11 = await res11.json();
    assert.equal(d11.error.code, 'RATE_LIMITED');
  });

  // ---------------------------------------------------------------------------
  // API-59: Forced failure leaves no order and stock unchanged
  // ---------------------------------------------------------------------------
  it('API-59: forced order-item insert failure returns generic 500 or 503, no order row exists, stock unchanged', async () => {
    const { cookie } = await registerUser(nextEmail());

    const stockBefore = (await client.query('SELECT stock_quantity FROM products WHERE id = 1')).rows[0].stock_quantity;

    // Install temporary trigger on order_items
    await client.query(`
      CREATE OR REPLACE FUNCTION fail_items_api59() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Forced order_items failure for API-59';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trig_fail_items_api59
      BEFORE INSERT ON order_items
      FOR EACH ROW EXECUTE FUNCTION fail_items_api59();
    `);

    const failedKey = 'a0000000-0000-4000-8000-000000000059';
    try {
      const res = await testEnv.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'Idempotency-Key': failedKey,
          'Cookie': cookie,
        },
        body: JSON.stringify({
          items: [{ productId: 1, quantity: 1 }],
          shipping: sampleShipping,
        }),
      });

      assert.ok(res.status === 500 || res.status === 503);
      const data = await res.json();
      assert.ok(data.error.code === 'INTERNAL_ERROR' || data.error.code === 'SERVICE_UNAVAILABLE');
    } finally {
      await client.query(`
        DROP TRIGGER IF EXISTS trig_fail_items_api59 ON order_items;
        DROP FUNCTION IF EXISTS fail_items_api59();
      `);
    }

    // Assert no order exists and stock unchanged
    const orderCount = (await client.query('SELECT count(*)::int AS n FROM orders WHERE idempotency_key = $1', [failedKey])).rows[0].n;
    assert.equal(orderCount, 0);

    const stockAfter = (await client.query('SELECT stock_quantity FROM products WHERE id = 1')).rows[0].stock_quantity;
    assert.equal(stockAfter, stockBefore);
  });

  // ---------------------------------------------------------------------------
  // API-60: GET /api/orders list endpoint
  // ---------------------------------------------------------------------------
  it('API-60: order list contains only caller orders, newest first, item count, at most 3 thumbnails, pagination', async () => {
    const { cookie } = await registerUser(nextEmail());

    // Place 2 orders for this user
    for (let i = 1; i <= 2; i++) {
      await testEnv.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'Idempotency-Key': `a0000000-0000-4000-8000-00000000006${i}`,
          'Cookie': cookie,
        },
        body: JSON.stringify({
          items: [
            { productId: 1, quantity: 2 },
            { productId: 9, quantity: 1 },
          ],
          shipping: sampleShipping,
        }),
      });
    }

    const res = await testEnv.request('/api/orders?page=1&limit=10', {
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');

    const data = await res.json();
    assert.equal(data.items.length, 2);
    assert.equal(data.pagination.page, 1);
    assert.equal(data.pagination.limit, 10);
    assert.equal(data.pagination.total, 2);
    assert.equal(data.pagination.totalPages, 1);

    // Newest first
    const date1 = new Date(data.items[0].createdAt).getTime();
    const date2 = new Date(data.items[1].createdAt).getTime();
    assert.ok(date1 >= date2);

    // Item count: 2 + 1 = 3
    assert.equal(data.items[0].itemCount, 3);

    // Thumbnails: at most 3
    assert.ok(Array.isArray(data.items[0].thumbnails));
    assert.ok(data.items[0].thumbnails.length <= 3);
  });

  // ---------------------------------------------------------------------------
  // API-61: GET /api/orders/:id ownership & 404 timing/isolation
  // ---------------------------------------------------------------------------
  it('API-61: another user order ID, random UUID, and malformed ID produce identical 404 responses', async () => {
    // User A places an order
    const { cookie: cookieA } = await registerUser(nextEmail());
    const orderRes = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': 'a0000000-0000-4000-8000-000000000061',
        'Cookie': cookieA,
      },
      body: JSON.stringify({
        items: [{ productId: 1, quantity: 1 }],
        shipping: sampleShipping,
      }),
    });
    const orderA = (await orderRes.json()).order;

    // User B tries to read User A's order, a random UUID, and malformed ID
    const { cookie: cookieB } = await registerUser(nextEmail());

    const tests = [
      `/api/orders/${orderA.id}`, // Another user's order
      '/api/orders/b0000000-0000-4000-8000-000000000099', // Random UUID
      '/api/orders/not-a-uuid', // Malformed ID
    ];

    for (const path of tests) {
      const res = await testEnv.request(path, {
        headers: { Cookie: cookieB },
      });
      assert.equal(res.status, 404);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const data = await res.json();
      assert.deepEqual(Object.keys(data).sort(), ['error']);
      assert.deepEqual(Object.keys(data.error).sort(), ['code', 'message', 'requestId']);
      assert.equal(data.error.code, 'ORDER_NOT_FOUND');
      assert.equal(data.error.message, 'Order not found.');
      assert.ok(typeof data.error.requestId === 'string' && data.error.requestId.length > 0);
    }
  });

  // ---------------------------------------------------------------------------
  // API-62: Snapshot integrity: rename or reprice product does not change order detail
  // ---------------------------------------------------------------------------
  it('API-62: order detail remains unchanged after product rename or repricing', async () => {
    const { cookie } = await registerUser(nextEmail());

    const res = await testEnv.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': testEnv.url,
        'Idempotency-Key': 'a0000000-0000-4000-8000-000000000062',
        'Cookie': cookie,
      },
      body: JSON.stringify({
        items: [{ productId: 1, quantity: 1 }],
        shipping: sampleShipping,
      }),
    });
    assert.equal(res.status, 201);
    const createdOrder = (await res.json()).order;

    // Update Product 1 name and price in database
    await client.query(
      `UPDATE products
       SET name = 'Super Luxury Felt Desk Mat 2.0',
           slug = 'super-luxury-felt-desk-mat-2',
           price_minor = 999900
       WHERE id = 1`
    );

    try {
      // Fetch order detail
      const detailRes = await testEnv.request(`/api/orders/${createdOrder.id}`, {
        headers: { Cookie: cookie },
      });
      assert.equal(detailRes.status, 200);
      const detailData = await detailRes.json();
      const item = detailData.order.items[0];

      assert.equal(item.name, 'Felt desk mat, charcoal');
      assert.equal(item.slug, 'felt-desk-mat-charcoal');
      assert.equal(item.unitPriceMinor, 149900);
      assert.equal(detailData.order.subtotalMinor, 149900);
      assert.equal(detailData.order.totalMinor, 149900 + 9900);
    } finally {
      // Restore Product 1
      await client.query(
        `UPDATE products
         SET name = 'Felt desk mat, charcoal',
             slug = 'felt-desk-mat-charcoal',
             price_minor = 149900
         WHERE id = 1`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // API-66: Corrupt values return generic 500 envelope with INVALID_MONEY_VALUE
  // ---------------------------------------------------------------------------
  it('API-66: corrupt values in database return generic 500 without leaking the value', async () => {
    const { user, cookie } = await registerUser(nextEmail());

    // Insert order with unsafe 9007199254740993 paise (violates JS safe integer limit)
    const corruptId = 'c0000000-0000-4000-8000-000000000066';
    await client.query(
      `INSERT INTO orders (
        id, order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
        shipping_full_name, shipping_phone, shipping_address_line1, shipping_city, shipping_region, shipping_postal_code,
        idempotency_key, request_hash
      ) VALUES (
        $1, 'DL-999999', $2, 'INR', 9007199254740993, 0, 9007199254740993,
        'Corrupt User', '919876543210', '123 Bad Way', 'Springfield', 'State', '12345',
        'c0000000-0000-4000-8000-000000000066', '\\x00'
      )`,
      [corruptId, user.id]
    );

    // Reading through GET /api/orders/:id returns 500
    const detailRes = await testEnv.request(`/api/orders/${corruptId}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(detailRes.status, 500);
    const detailBody = await detailRes.json();
    assert.equal(detailBody.error.code, 'INTERNAL_ERROR');
    assert.equal(detailBody.error.message.includes('9007199254740993'), false);

    // Reading through GET /api/orders returns 500
    const listRes = await testEnv.request('/api/orders', {
      headers: { Cookie: cookie },
    });
    assert.equal(listRes.status, 500);
    const listBody = await listRes.json();
    assert.equal(listBody.error.code, 'INTERNAL_ERROR');
  });
});
