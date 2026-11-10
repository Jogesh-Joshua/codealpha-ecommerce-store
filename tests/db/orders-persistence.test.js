/**
 * tests/db/orders-persistence.test.js
 *
 * Database persistence, rollback, and sequence concurrency tests (DB-09, DB-10).
 *
 * Must verify:
 * - DB-09: Order persistence is verified through a separate database connection;
 *          a forced failure leaves no order and no stock change.
 * - DB-10: 20 parallel calls to the order-number sequence produce unique order numbers.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeTestDatabase, getTestClient, resetTestDb } from '../helpers/db.js';
import { loadTestConfig } from '../helpers/config.js';
import { createPool } from '../../src/db/pool.js';
import { createOrder } from '../../src/services/orderService.js';
import { generateOrderNumber } from '../../src/lib/orderNumber.js';

assertSafeTestDatabase();

describe('DB-09 & DB-10: Order Database Persistence and Concurrency', () => {
  let pool;
  let config;
  let testClient;
  let testUser;

  before(async () => {
    config = loadTestConfig();
    pool = createPool({ config });
    testClient = await getTestClient();
  });

  after(async () => {
    await testClient.end();
    await pool.end();
  });

  beforeEach(async () => {
    await resetTestDb(testClient);

    // Create a verified test user
    const userRes = await testClient.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ('order-db-test@example.com', '$2a$10$abcdefghijklmnopqrstuvwxyz123456', 'Order DB User')
       RETURNING id, email`
    );
    testUser = userRes.rows[0];
  });

  it('DB-09: order persistence is verified through a separate database connection; forced failure leaves no order and no stock change', async () => {
    // 1. Check initial stock for Product 1 (seed stock 25)
    const initialProductRes = await testClient.query('SELECT stock_quantity FROM products WHERE id = 1');
    const initialStock = initialProductRes.rows[0].stock_quantity;

    // 2. Place valid order for Product 1 (qty 2)
    const idempotencyKey = 'c0000000-0000-4000-8000-000000000001';
    const orderBody = {
      items: [{ productId: 1, quantity: 2 }],
      shipping: {
        fullName: 'Order DB User',
        phone: '919876543210',
        addressLine1: '123 Persistence Lane',
        city: 'Coimbatore',
        region: 'Tamil Nadu',
        postalCode: '641001',
      },
    };

    const result = await createOrder({
      config,
      pool,
      userId: testUser.id,
      idempotencyKey,
      body: orderBody,
    });

    assert.equal(result.status, 201);
    assert.equal(result.isReplay, false);
    const createdOrderId = result.order.id;

    // 3. Read through a completely separate DB connection
    const separateClient = await getTestClient();
    try {
      const dbOrderRes = await separateClient.query(
        'SELECT id, order_number, total_minor, subtotal_minor, shipping_minor FROM orders WHERE id = $1',
        [createdOrderId]
      );
      assert.equal(dbOrderRes.rows.length, 1);
      assert.equal(dbOrderRes.rows[0].id, createdOrderId);
      assert.equal(dbOrderRes.rows[0].order_number, result.order.orderNumber);

      const dbItemsRes = await separateClient.query(
        'SELECT product_id, quantity, line_total_minor FROM order_items WHERE order_id = $1',
        [createdOrderId]
      );
      assert.equal(dbItemsRes.rows.length, 1);
      assert.equal(dbItemsRes.rows[0].product_id, 1);
      assert.equal(dbItemsRes.rows[0].quantity, 2);

      // Verify stock was decremented by 2
      const stockAfterRes = await separateClient.query('SELECT stock_quantity FROM products WHERE id = 1');
      assert.equal(stockAfterRes.rows[0].stock_quantity, initialStock - 2);

      // 4. Forced failure: install temporary trigger to fail order_items insert
      await separateClient.query(`
        CREATE OR REPLACE FUNCTION fail_order_items() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'Forced order_items insertion failure for DB-09 test';
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER force_order_items_failure
        BEFORE INSERT ON order_items
        FOR EACH ROW EXECUTE FUNCTION fail_order_items();
      `);

      const failedKey = 'c0000000-0000-4000-8000-000000000002';
      await assert.rejects(
        () =>
          createOrder({
            config,
            pool,
            userId: testUser.id,
            idempotencyKey: failedKey,
            body: orderBody,
          }),
        (err) => err.status === 500 || err.status === 503
      );

      // Clean up trigger
      await separateClient.query(`
        DROP TRIGGER IF EXISTS force_order_items_failure ON order_items;
        DROP FUNCTION IF EXISTS fail_order_items();
      `);

      // Verify NO order row exists for failedKey
      const checkFailedOrder = await separateClient.query(
        'SELECT id FROM orders WHERE idempotency_key = $1',
        [failedKey]
      );
      assert.equal(checkFailedOrder.rows.length, 0);

      // Verify stock was NOT decremented further
      const stockFinalRes = await separateClient.query('SELECT stock_quantity FROM products WHERE id = 1');
      assert.equal(stockFinalRes.rows[0].stock_quantity, initialStock - 2);
    } finally {
      await separateClient.end();
    }
  });

  it('DB-10: 20 parallel order-number sequence calls produce unique order numbers', async () => {
    const clients = await Promise.all(Array.from({ length: 20 }, () => getTestClient()));

    try {
      const orderNumbers = await Promise.all(
        clients.map((client) => generateOrderNumber(client, config.orderNumberPrefix))
      );

      assert.equal(orderNumbers.length, 20);
      const uniqueNumbers = new Set(orderNumbers);
      assert.equal(uniqueNumbers.size, 20, 'All 20 order numbers must be unique');

      for (const num of orderNumbers) {
        assert.match(num, /^[A-Z]{2,4}-[0-9]{6,}$/);
      }
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  it('verifies 23505 unique-constraint fallback retries in a fresh transaction and succeeds on matching hash', async () => {
    const key = 'c0000000-0000-4000-8000-000000000235';
    const body = {
      items: [{ productId: 1, quantity: 1 }],
      shipping: {
        fullName: 'Retry Test User',
        phone: '919876543210',
        addressLine1: '123 Retry Lane',
        city: 'Coimbatore',
        region: 'Tamil Nadu',
        postalCode: '641001',
      },
    };

    // 1. Create order initially
    const firstResult = await createOrder({
      config,
      pool,
      userId: testUser.id,
      idempotencyKey: key,
      body,
    });
    assert.equal(firstResult.status, 201);

    // 2. Intercept step 5 to simulate race where step 5 misses and step 11 hits real 23505
    let step5Bypassed = false;
    const interceptedPool = {
      connect: async () => {
        const rawClient = await pool.connect();
        const origQuery = rawClient.query.bind(rawClient);
        rawClient.query = async (sql, params) => {
          if (
            typeof sql === 'string' &&
            sql.includes('FROM orders') &&
            sql.includes('idempotency_key = $2') &&
            !step5Bypassed
          ) {
            step5Bypassed = true;
            return { rows: [] }; // Simulate step 5 miss
          }
          return origQuery(sql, params);
        };
        return rawClient;
      },
      query: (...args) => pool.query(...args),
    };

    // 3. createOrder catches real 23505, starts fresh transaction, and re-reads order
    const fallbackResult = await createOrder({
      config,
      pool: interceptedPool,
      userId: testUser.id,
      idempotencyKey: key,
      body,
    });

    assert.equal(fallbackResult.status, 200);
    assert.equal(fallbackResult.isReplay, true);
    assert.equal(fallbackResult.order.id, firstResult.order.id);
  });
});
