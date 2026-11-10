/**
 * tests/api/concurrency.test.js
 *
 * Real PostgreSQL concurrency and transaction race condition tests (CON-01 to CON-06).
 *
 * Tests:
 * - CON-01: Product stock 1; 2 users order in parallel -> exactly one 201, one 409; final stock 0; exactly 1 order.
 * - CON-02: Product stock 5; 10 users order 1 in parallel -> exactly 5 succeed, 5 get 409; final stock 0; 5 orders exist.
 * - CON-03: Deadlock freedom; 2 users order products A and B in opposite order across rounds -> no deadlock, all 201/409.
 * - CON-04: Same user, same key, same body; 5 parallel requests -> exactly one 201 and four 200 replays, all same order ID.
 * - CON-05: 20 parallel orders -> all 20 order numbers are unique.
 * - CON-06: Two parallel registrations with same email -> exactly one 201 and one 409 EMAIL_TAKEN.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startTestServer } from '../helpers/server.js';
import { assertSafeTestDatabase, getTestClient, resetTestDb } from '../helpers/db.js';
import { loadTestConfig } from '../helpers/config.js';

const { Pool } = pg;

assertSafeTestDatabase();

describe('Phase 6: Concurrency Tests (CON-01 to CON-06)', () => {
  let testEnv;
  let pool;
  let client;
  let userCounter = 0;
  let ipCounter = 0;

  function nextEmail() {
    userCounter += 1;
    return `concurrency.user.${Date.now()}.${userCounter}@example.com`;
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
        name: 'Concurrency User',
        email,
        password,
      }),
    });
    assert.equal(res.status, 201, 'User registration must succeed');
    const cookie = res.headers.getSetCookie()[0];
    const data = await res.json();
    return { user: data.user, cookie, ip };
  }

  const sampleShipping = {
    fullName: 'Concurrency Test',
    phone: '919876543210',
    addressLine1: '100 Race Condition Blvd',
    city: 'Springfield',
    region: 'Example State',
    postalCode: '641001',
  };

  before(async () => {
    client = await getTestClient();
    await resetTestDb(client);

    const config = loadTestConfig();
    pool = new Pool({ connectionString: config.databaseUrl, max: 25 });
    testEnv = await startTestServer({
      config,
      pool,
      logSink: (evt) => {
        if (evt.level === 'error') {
          console.error('Server error log:', evt);
        }
      },
    });
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
  // CON-01: Product stock 1, 2 concurrent users
  // ---------------------------------------------------------------------------
  it('CON-01: stock 1 with 2 concurrent users -> exactly one 201, one 409; final stock 0; exactly 1 order', async () => {
    // Set Product 3 stock to 1
    await client.query('UPDATE products SET stock_quantity = 1 WHERE id = 3');

    const [userA, userB] = await Promise.all([
      registerUser(nextEmail()),
      registerUser(nextEmail()),
    ]);

    const orderPayload = {
      items: [{ productId: 3, quantity: 1 }],
      shipping: sampleShipping,
    };

    const [resA, resB] = await Promise.all([
      testEnv.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'Idempotency-Key': 'd0000000-0000-4000-8000-000000000001',
          'Cookie': userA.cookie,
        },
        body: JSON.stringify(orderPayload),
      }),
      testEnv.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'Idempotency-Key': 'd0000000-0000-4000-8000-000000000002',
          'Cookie': userB.cookie,
        },
        body: JSON.stringify(orderPayload),
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [201, 409]);

    // Check final stock is 0
    const stockRes = await client.query('SELECT stock_quantity FROM products WHERE id = 3');
    assert.equal(stockRes.rows[0].stock_quantity, 0);

    // Check exactly one order was created for product 3
    const ordersRes = await client.query(
      `SELECT count(*)::int AS n FROM order_items WHERE product_id = 3`
    );
    assert.equal(ordersRes.rows[0].n, 1);
  });

  // ---------------------------------------------------------------------------
  // CON-02: Product stock 5, 10 parallel users
  // ---------------------------------------------------------------------------
  it('CON-02: stock 5 with 10 parallel users -> exactly 5 succeed (201), 5 fail (409); final stock 0; 5 orders', async () => {
    // Set Product 4 stock to 5
    await client.query('UPDATE products SET stock_quantity = 5 WHERE id = 4');

    const users = await Promise.all(
      Array.from({ length: 10 }, () => registerUser(nextEmail()))
    );

    const orderPayload = {
      items: [{ productId: 4, quantity: 1 }],
      shipping: sampleShipping,
    };

    const responses = await Promise.all(
      users.map((u, idx) =>
        testEnv.request('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': testEnv.url,
            'Idempotency-Key': `d0000000-0000-4000-8000-0000000000${String(idx + 10).padStart(2, '0')}`,
            'Cookie': u.cookie,
          },
          body: JSON.stringify(orderPayload),
        })
      )
    );

    const counts = {};
    for (const r of responses) {
      counts[r.status] = (counts[r.status] || 0) + 1;
      if (r.status !== 201 && r.status !== 409) {
        const body = await r.json().catch(() => ({}));
        console.error('CON-02 unexpected response:', r.status, body);
      }
    }
    console.log('CON-02 status counts:', counts);

    assert.equal(counts[201], 5, 'Exactly 5 requests must succeed with 201');
    assert.equal(counts[409], 5, 'Exactly 5 requests must fail with 409');

    // Final stock must be 0
    const stockRes = await client.query('SELECT stock_quantity FROM products WHERE id = 4');
    assert.equal(stockRes.rows[0].stock_quantity, 0);

    // Exactly 5 orders exist
    const ordersRes = await client.query(
      'SELECT count(*)::int AS n FROM order_items WHERE product_id = 4'
    );
    assert.equal(ordersRes.rows[0].n, 5);
  });

  // ---------------------------------------------------------------------------
  // CON-03: Deadlock freedom under opposite item order
  // ---------------------------------------------------------------------------
  it('CON-03: deadlock freedom when ordering products A and B in opposite order across rounds', async () => {
    // Set generous stock for Product 5 and Product 6
    await client.query('UPDATE products SET stock_quantity = 100 WHERE id IN (5, 6)');

    const rounds = 10;
    for (let r = 0; r < rounds; r++) {
      const [user1, user2] = await Promise.all([
        registerUser(nextEmail()),
        registerUser(nextEmail()),
      ]);

      // User 1 orders [5, 6]; User 2 orders [6, 5]
      const [res1, res2] = await Promise.all([
        testEnv.request('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': testEnv.url,
            'Idempotency-Key': `d0000000-0000-4000-8000-0000000010${String(r).padStart(2, '0')}`,
            'Cookie': user1.cookie,
          },
          body: JSON.stringify({
            items: [
              { productId: 5, quantity: 1 },
              { productId: 6, quantity: 1 },
            ],
            shipping: sampleShipping,
          }),
        }),
        testEnv.request('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': testEnv.url,
            'Idempotency-Key': `d0000000-0000-4000-8000-0000000020${String(r).padStart(2, '0')}`,
            'Cookie': user2.cookie,
          },
          body: JSON.stringify({
            items: [
              { productId: 6, quantity: 1 },
              { productId: 5, quantity: 1 },
            ],
            shipping: sampleShipping,
          }),
        }),
      ]);

      // Neither must deadlock (500/503); both must return 201
      assert.equal(res1.status, 201, `Round ${r}: User 1 must return 201`);
      assert.equal(res2.status, 201, `Round ${r}: User 2 must return 201`);
    }
  });

  // ---------------------------------------------------------------------------
  // CON-04: Same user, same key, same body in parallel
  // ---------------------------------------------------------------------------
  it('CON-04: same user, same key, same body: 5 parallel requests return exactly one 201 and four 200 replays', async () => {
    // Ample stock on Product 7
    await client.query('UPDATE products SET stock_quantity = 50 WHERE id = 7');
    const stockBefore = (await client.query('SELECT stock_quantity FROM products WHERE id = 7')).rows[0].stock_quantity;

    const { cookie } = await registerUser(nextEmail());
    const key = 'd0000000-0000-4000-8000-000000000004';
    const body = JSON.stringify({
      items: [{ productId: 7, quantity: 1 }],
      shipping: sampleShipping,
    });

    const requests = Array.from({ length: 5 }, () =>
      testEnv.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'Idempotency-Key': key,
          'Cookie': cookie,
        },
        body,
      })
    );

    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status).sort();

    // Exactly one 201 and four 200s
    assert.deepEqual(statuses, [200, 200, 200, 200, 201]);

    const orderDataList = await Promise.all(responses.map((r) => r.json()));
    const orderIds = new Set(orderDataList.map((d) => d.order.id));
    assert.equal(orderIds.size, 1, 'All responses must carry the exact same order ID');

    // Exactly one order in DB
    const orderCount = (await client.query('SELECT count(*)::int AS n FROM orders WHERE idempotency_key = $1', [key])).rows[0].n;
    assert.equal(orderCount, 1);

    // Stock decremented exactly once
    const stockAfter = (await client.query('SELECT stock_quantity FROM products WHERE id = 7')).rows[0].stock_quantity;
    assert.equal(stockAfter, stockBefore - 1);
  });

  // ---------------------------------------------------------------------------
  // CON-05: 20 parallel orders produce unique order numbers
  // ---------------------------------------------------------------------------
  it('CON-05: 20 parallel orders create 20 unique order numbers', async () => {
    await client.query('UPDATE products SET stock_quantity = 100 WHERE id BETWEEN 5 AND 20');

    const users = await Promise.all(
      Array.from({ length: 20 }, () => registerUser(nextEmail()))
    );

    const orderRequests = users.map((u, idx) =>
      testEnv.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'Idempotency-Key': `d0000000-0000-4000-8000-0000000005${String(idx).padStart(2, '0')}`,
          'Cookie': u.cookie,
        },
        body: JSON.stringify({
          items: [{ productId: (idx % 15) + 5, quantity: 1 }],
          shipping: sampleShipping,
        }),
      })
    );

    const responses = await Promise.all(orderRequests);
    for (const res of responses) {
      if (res.status !== 201) {
        const body = await res.json().catch(() => ({}));
        console.error('CON-05 unexpected response:', res.status, body);
      }
      assert.equal(res.status, 201);
    }

    const bodies = await Promise.all(responses.map((r) => r.json()));
    const orderNumbers = bodies.map((b) => b.order.orderNumber);
    assert.equal(orderNumbers.length, 20);

    const uniqueNumbers = new Set(orderNumbers);
    assert.equal(uniqueNumbers.size, 20, 'All 20 order numbers must be unique');
  });

  // ---------------------------------------------------------------------------
  // CON-06: Two parallel registrations with same email
  // ---------------------------------------------------------------------------
  it('CON-06: two parallel registrations with same email return exactly one 201 and one 409', async () => {
    const email = nextEmail();
    const ip = nextIp();

    const [res1, res2] = await Promise.all([
      testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'X-Forwarded-For': ip,
        },
        body: JSON.stringify({
          name: 'Parallel Register 1',
          email,
          password: 'Password123!',
        }),
      }),
      testEnv.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': testEnv.url,
          'X-Forwarded-For': ip,
        },
        body: JSON.stringify({
          name: 'Parallel Register 2',
          email,
          password: 'Password123!',
        }),
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [201, 409]);

    const failBody = res1.status === 409 ? await res1.json() : await res2.json();
    assert.equal(failBody.error.code, 'EMAIL_TAKEN');
  });
});

