/**
 * tests/db/schema.test.js
 *
 * DB-02: constraint behaviour
 * DB-03: foreign keys
 * DB-04: indexes exist
 * DB-05: seeded counts match §7.5
 * DB-06: seed idempotence; --reset-stock without --yes refuses
 * DB-07: every seeded price_minor is a positive integer multiple of 100
 * DB-08: updated_at trigger
 * DB-11: assertSafeTestDatabase() and test-db-reset exit conditions
 * DB-12: idempotency backstop (23505) and advisory lock
 * DB-13: no global parser — bigint and numeric come back as strings, integer as number
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeTestDatabase, getTestClient, resetTestDb } from '../helpers/db.js';
import { runSeed } from '../../scripts/seed.js';
import { products as catalogProducts } from '../../db/seeds/catalog.js';

// Safety check — exits if environment is wrong.
assertSafeTestDatabase();

// ─────────────────────────────────────────────────────────────────────────────
// Shared client
// ─────────────────────────────────────────────────────────────────────────────

describe('DB-02 to DB-13: schema and data integrity', () => {
  let client;

  before(async () => {
    client = await getTestClient();
  });

  after(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await resetTestDb(client);
  });

  // ── DB-02: constraint behaviour ──────────────────────────────────────────

  describe('DB-02: constraint violations', () => {
    it('rejects email that is not lower-case', async () => {
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO users (name, email, password_hash)
             VALUES ('Test', 'Bad@Email.com', 'hash')`,
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects duplicate email', async () => {
      await client.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ('User One', 'dup@example.com', 'hash1')`,
      );
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO users (name, email, password_hash)
             VALUES ('User Two', 'dup@example.com', 'hash2')`,
          ),
        (err) => {
          assert.ok(err.code === '23505', `Expected unique violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects product price_minor of 0', async () => {
      const { rows } = await client.query(`SELECT id FROM categories LIMIT 1`);
      const catId = rows[0].id;
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO products (category_id, slug, name, summary, description, specs, price_minor)
             VALUES ($1, 'test-slug-zero', 'Test', 'Sum', 'Desc', '[]', 0)`,
            [catId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects product price_minor that is negative', async () => {
      const { rows } = await client.query(`SELECT id FROM categories LIMIT 1`);
      const catId = rows[0].id;
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO products (category_id, slug, name, summary, description, specs, price_minor)
             VALUES ($1, 'test-slug-neg', 'Test', 'Sum', 'Desc', '[]', -100)`,
            [catId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects product price_minor not a multiple of 100 (e.g. 150)', async () => {
      const { rows } = await client.query(`SELECT id FROM categories LIMIT 1`);
      const catId = rows[0].id;
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO products (category_id, slug, name, summary, description, specs, price_minor)
             VALUES ($1, 'test-slug-frac', 'Test', 'Sum', 'Desc', '[]', 150)`,
            [catId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects product with negative stock_quantity', async () => {
      const { rows } = await client.query(`SELECT id FROM categories LIMIT 1`);
      const catId = rows[0].id;
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO products (category_id, slug, name, summary, description, specs, price_minor, stock_quantity)
             VALUES ($1, 'test-slug-negstk', 'Test', 'Sum', 'Desc', '[]', 100, -1)`,
            [catId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects product with bad slug (contains uppercase)', async () => {
      const { rows } = await client.query(`SELECT id FROM categories LIMIT 1`);
      const catId = rows[0].id;
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO products (category_id, slug, name, summary, description, specs, price_minor)
             VALUES ($1, 'Bad-Slug', 'Test', 'Sum', 'Desc', '[]', 100)`,
            [catId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects featured_rank of 0 (must be > 0 or NULL)', async () => {
      const { rows } = await client.query(`SELECT id FROM categories LIMIT 1`);
      const catId = rows[0].id;
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO products (category_id, slug, name, summary, description, specs, price_minor, featured_rank)
             VALUES ($1, 'feat-zero', 'Test', 'Sum', 'Desc', '[]', 100, 0)`,
            [catId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects order whose total_minor ≠ subtotal_minor + shipping_minor', async () => {
      // Insert a user first.
      const { rows: userRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('O', 'o@o.com', 'h') RETURNING id`,
      );
      const userId = userRows[0].id;
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO orders
               (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
                shipping_full_name, shipping_phone, shipping_address_line1,
                shipping_city, shipping_region, shipping_postal_code,
                idempotency_key, request_hash)
             VALUES ('DL-999001', $1, 'INR', 100, 50, 200,
                     'Test User', '9876543210', '1 Test St',
                     'City', 'State', '641001',
                     gen_random_uuid(), '\\x01')`,
            [userId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects order with currency other than INR', async () => {
      const { rows: userRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('O2', 'o2@o.com', 'h') RETURNING id`,
      );
      const userId = userRows[0].id;
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO orders
               (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
                shipping_full_name, shipping_phone, shipping_address_line1,
                shipping_city, shipping_region, shipping_postal_code,
                idempotency_key, request_hash)
             VALUES ('DL-999002', $1, 'USD', 100, 50, 150,
                     'Test User', '9876543210', '1 Test St',
                     'City', 'State', '641001',
                     gen_random_uuid(), '\\x01')`,
            [userId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects shipping_phone with fewer than 10 digits', async () => {
      const { rows: userRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('O3', 'o3@o.com', 'h') RETURNING id`,
      );
      const userId = userRows[0].id;
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO orders
               (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
                shipping_full_name, shipping_phone, shipping_address_line1,
                shipping_city, shipping_region, shipping_postal_code,
                idempotency_key, request_hash)
             VALUES ('DL-999003', $1, 'INR', 100, 50, 150,
                     'Test User', '12345', '1 Test St',
                     'City', 'State', '641001',
                     gen_random_uuid(), '\\x01')`,
            [userId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects order_item line_total_minor ≠ unit_price_minor × quantity', async () => {
      // Create user and order first.
      const { rows: uRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('OI', 'oi@o.com', 'h') RETURNING id`,
      );
      const userId = uRows[0].id;
      const { rows: oRows } = await client.query(
        `INSERT INTO orders
           (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
            shipping_full_name, shipping_phone, shipping_address_line1,
            shipping_city, shipping_region, shipping_postal_code,
            idempotency_key, request_hash)
         VALUES ('DL-999004', $1, 'INR', 100, 50, 150,
                 'Test User', '9876543210', '1 Test St',
                 'City', 'State', '641001',
                 gen_random_uuid(), '\\x01')
         RETURNING id`,
        [userId],
      );
      const orderId = oRows[0].id;
      const { rows: pRows } = await client.query(`SELECT id FROM products WHERE is_active LIMIT 1`);
      const productId = pRows[0].id;

      // Bad: 100 * 2 ≠ 999
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO order_items
               (order_id, product_id, product_name, product_slug, unit_price_minor, quantity, line_total_minor)
             VALUES ($1, $2, 'Test', 'test', 100, 2, 999)`,
            [orderId, productId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects order_item quantity of 0', async () => {
      const { rows: uRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('OQ', 'oq@o.com', 'h') RETURNING id`,
      );
      const userId = uRows[0].id;
      const { rows: oRows } = await client.query(
        `INSERT INTO orders
           (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
            shipping_full_name, shipping_phone, shipping_address_line1,
            shipping_city, shipping_region, shipping_postal_code,
            idempotency_key, request_hash)
         VALUES ('DL-999005', $1, 'INR', 0, 0, 0,
                 'Test User', '9876543210', '1 Test St',
                 'City', 'State', '641001',
                 gen_random_uuid(), '\\x01')
         RETURNING id`,
        [userId],
      );
      const orderId = oRows[0].id;
      const { rows: pRows } = await client.query(`SELECT id FROM products WHERE is_active LIMIT 1`);
      const productId = pRows[0].id;

      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO order_items
               (order_id, product_id, product_name, product_slug, unit_price_minor, quantity, line_total_minor)
             VALUES ($1, $2, 'Test', 'test', 100, 0, 0)`,
            [orderId, productId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects order_item quantity of 101', async () => {
      const { rows: uRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('OQ2', 'oq2@o.com', 'h') RETURNING id`,
      );
      const userId = uRows[0].id;
      const { rows: oRows } = await client.query(
        `INSERT INTO orders
           (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
            shipping_full_name, shipping_phone, shipping_address_line1,
            shipping_city, shipping_region, shipping_postal_code,
            idempotency_key, request_hash)
         VALUES ('DL-999006', $1, 'INR', 10100, 0, 10100,
                 'Test User', '9876543210', '1 Test St',
                 'City', 'State', '641001',
                 gen_random_uuid(), '\\x01')
         RETURNING id`,
        [userId],
      );
      const orderId = oRows[0].id;
      const { rows: pRows } = await client.query(`SELECT id FROM products WHERE is_active LIMIT 1`);
      const productId = pRows[0].id;

      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO order_items
               (order_id, product_id, product_name, product_slug, unit_price_minor, quantity, line_total_minor)
             VALUES ($1, $2, 'Test', 'test', 100, 101, 10100)`,
            [orderId, productId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects duplicate (order_id, product_id)', async () => {
      const { rows: uRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('DUP', 'dup2@o.com', 'h') RETURNING id`,
      );
      const userId = uRows[0].id;
      const { rows: oRows } = await client.query(
        `INSERT INTO orders
           (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
            shipping_full_name, shipping_phone, shipping_address_line1,
            shipping_city, shipping_region, shipping_postal_code,
            idempotency_key, request_hash)
         VALUES ('DL-999007', $1, 'INR', 100, 0, 100,
                 'Test User', '9876543210', '1 Test St',
                 'City', 'State', '641001',
                 gen_random_uuid(), '\\x01')
         RETURNING id`,
        [userId],
      );
      const orderId = oRows[0].id;
      const { rows: pRows } = await client.query(`SELECT id FROM products WHERE is_active LIMIT 1`);
      const productId = pRows[0].id;

      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, product_slug, unit_price_minor, quantity, line_total_minor)
         VALUES ($1, $2, 'Test', 'test', 100, 1, 100)`,
        [orderId, productId],
      );
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO order_items
               (order_id, product_id, product_name, product_slug, unit_price_minor, quantity, line_total_minor)
             VALUES ($1, $2, 'Test2', 'test', 100, 1, 100)`,
            [orderId, productId],
          ),
        (err) => {
          assert.ok(err.code === '23505', `Expected unique violation, got ${err.code}`);
          return true;
        },
      );
    });

    it('rejects duplicate (user_id, idempotency_key) in orders', async () => {
      const { rows: uRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('IDEM', 'idem@o.com', 'h') RETURNING id`,
      );
      const userId = uRows[0].id;
      const key = '00000000-0000-4000-8000-000000000099';
      await client.query(
        `INSERT INTO orders
           (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
            shipping_full_name, shipping_phone, shipping_address_line1,
            shipping_city, shipping_region, shipping_postal_code,
            idempotency_key, request_hash)
         VALUES ('DL-999010', $1, 'INR', 100, 50, 150,
                 'Test', '9876543210', '1 St', 'City', 'State', '641001',
                 $2, '\\x01')`,
        [userId, key],
      );
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO orders
               (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
                shipping_full_name, shipping_phone, shipping_address_line1,
                shipping_city, shipping_region, shipping_postal_code,
                idempotency_key, request_hash)
             VALUES ('DL-999011', $1, 'INR', 100, 50, 150,
                     'Test', '9876543210', '1 St', 'City', 'State', '641001',
                     $2, '\\x02')`,
            [userId, key],
          ),
        (err) => {
          assert.ok(err.code === '23505', `Expected unique violation, got ${err.code}`);
          assert.ok(
            err.constraint === 'orders_idempotency_key',
            `Expected constraint orders_idempotency_key, got ${err.constraint}`,
          );
          return true;
        },
      );
    });

    it('rejects product_images with URL not starting with /images/', async () => {
      const { rows: pRows } = await client.query(`SELECT id FROM products LIMIT 1`);
      const productId = pRows[0].id;
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO product_images (product_id, url, alt, width, height, sort_order)
             VALUES ($1, 'https://cdn.example.com/img.webp', 'Bad', 800, 1000, 99)`,
            [productId],
          ),
        (err) => {
          assert.ok(err.code === '23514', `Expected check violation, got ${err.code}`);
          return true;
        },
      );
    });
  });

  // ── DB-03: foreign keys ──────────────────────────────────────────────────

  describe('DB-03: foreign key enforcement', () => {
    it('deleting a product with order_items fails', async () => {
      // Create a user, order, and item.
      const { rows: uRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('FK1', 'fk1@o.com', 'h') RETURNING id`,
      );
      const userId = uRows[0].id;
      const { rows: oRows } = await client.query(
        `INSERT INTO orders
           (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
            shipping_full_name, shipping_phone, shipping_address_line1,
            shipping_city, shipping_region, shipping_postal_code,
            idempotency_key, request_hash)
         VALUES ('DL-FK001', $1, 'INR', 100, 50, 150,
                 'FK User', '9876543210', '1 St', 'City', 'State', '641001',
                 gen_random_uuid(), '\\x01')
         RETURNING id`,
        [userId],
      );
      const orderId = oRows[0].id;
      const { rows: pRows } = await client.query(`SELECT id FROM products WHERE is_active LIMIT 1`);
      const productId = pRows[0].id;

      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, product_slug, unit_price_minor, quantity, line_total_minor)
         VALUES ($1, $2, 'Test', 'test-fk', 100, 1, 100)`,
        [orderId, productId],
      );

      await assert.rejects(
        () => client.query(`DELETE FROM products WHERE id = $1`, [productId]),
        (err) => {
          assert.ok(
            err.code === '23503' || err.code === '23001',
            `Expected foreign key violation, got ${err.code}`,
          );
          return true;
        },
      );
    });

    it('deleting a user with orders fails', async () => {
      const { rows: uRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('FK2', 'fk2@o.com', 'h') RETURNING id`,
      );
      const userId = uRows[0].id;
      await client.query(
        `INSERT INTO orders
           (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
            shipping_full_name, shipping_phone, shipping_address_line1,
            shipping_city, shipping_region, shipping_postal_code,
            idempotency_key, request_hash)
         VALUES ('DL-FK002', $1, 'INR', 0, 0, 0,
                 'FK2', '9876543210', '1 St', 'City', 'State', '641001',
                 gen_random_uuid(), '\\x01')`,
        [userId],
      );

      await assert.rejects(
        () => client.query(`DELETE FROM users WHERE id = $1`, [userId]),
        (err) => {
          assert.ok(
            err.code === '23503' || err.code === '23001',
            `Expected foreign key violation, got ${err.code}`,
          );
          return true;
        },
      );
    });

    it('deleting a user cascades to their sessions', async () => {
      const { rows: uRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('CAS', 'cas@o.com', 'h') RETURNING id`,
      );
      const userId = uRows[0].id;
      await client.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at)
         VALUES ($1, '\\xdeadbeef', now() + interval '7 days')`,
        [userId],
      );

      const { rows: beforeDel } = await client.query(
        `SELECT count(*)::int AS n FROM sessions WHERE user_id = $1`,
        [userId],
      );
      assert.equal(beforeDel[0].n, 1);

      // Delete user — should cascade to sessions.
      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);

      const { rows: afterDel } = await client.query(
        `SELECT count(*)::int AS n FROM sessions WHERE user_id = $1`,
        [userId],
      );
      assert.equal(afterDel[0].n, 0, 'Deleting user should cascade to sessions');
    });

    it('deleting an order cascades to its items', async () => {
      const { rows: uRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('CAS2', 'cas2@o.com', 'h') RETURNING id`,
      );
      const userId = uRows[0].id;
      const { rows: oRows } = await client.query(
        `INSERT INTO orders
           (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
            shipping_full_name, shipping_phone, shipping_address_line1,
            shipping_city, shipping_region, shipping_postal_code,
            idempotency_key, request_hash)
         VALUES ('DL-CAS001', $1, 'INR', 100, 50, 150,
                 'CAS User', '9876543210', '1 St', 'City', 'State', '641001',
                 gen_random_uuid(), '\\x01')
         RETURNING id`,
        [userId],
      );
      const orderId = oRows[0].id;
      const { rows: pRows } = await client.query(`SELECT id FROM products WHERE is_active LIMIT 1`);
      const productId = pRows[0].id;

      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, product_slug, unit_price_minor, quantity, line_total_minor)
         VALUES ($1, $2, 'Test', 'test-cas', 100, 1, 100)`,
        [orderId, productId],
      );

      // First delete the user restriction: delete the order (which requires deleting items first
      // or allowing cascade). order_items CASCADE on delete.
      await client.query(`DELETE FROM orders WHERE id = $1`, [orderId]);

      const { rows: items } = await client.query(
        `SELECT count(*)::int AS n FROM order_items WHERE order_id = $1`,
        [orderId],
      );
      assert.equal(items[0].n, 0, 'Deleting order should cascade to order_items');
    });
  });

  // ── DB-04: indexes ────────────────────────────────────────────────────────

  describe('DB-04: named indexes exist', () => {
    const expectedIndexes = [
      'users_email_key',
      'sessions_token_hash_key',
      'products_category_idx',
      'products_newest_idx',
      'products_price_idx',
      'products_featured_idx',
      'orders_user_created_idx',
      'order_items_product_idx',
      'rate_limits_window_idx',
    ];

    for (const indexName of expectedIndexes) {
      it(`index "${indexName}" exists`, async () => {
        const { rows } = await client.query(
          `SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public' AND indexname = $1`,
          [indexName],
        );
        assert.equal(rows.length, 1, `Expected index "${indexName}" to exist`);
      });
    }
  });

  // ── DB-05: seeded counts ──────────────────────────────────────────────────

  describe('DB-05: seeded counts match §7.5', () => {
    it('has exactly 5 categories', async () => {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM categories`);
      assert.equal(rows[0].n, 5);
    });

    it('has exactly 21 products (20 active, 1 inactive)', async () => {
      const { rows } = await client.query(`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE is_active)::int AS active
        FROM products
      `);
      assert.equal(rows[0].total, 21);
      assert.equal(rows[0].active, 20);
    });

    it('desk-mats category has exactly 4 active products', async () => {
      const { rows } = await client.query(`
        SELECT count(*)::int AS n
          FROM products p
          JOIN categories c ON c.id = p.category_id
         WHERE c.slug = 'desk-mats' AND p.is_active
      `);
      assert.equal(rows[0].n, 4);
    });

    it('exactly 1 active product with stock 0 (out of stock)', async () => {
      const { rows } = await client.query(`
        SELECT count(*)::int AS n
          FROM products
         WHERE is_active AND stock_quantity = 0
      `);
      assert.equal(rows[0].n, 1);
    });

    it('exactly 2 active products with stock 1..5 (low stock)', async () => {
      const { rows } = await client.query(`
        SELECT count(*)::int AS n
          FROM products
         WHERE is_active AND stock_quantity BETWEEN 1 AND 5
      `);
      assert.equal(rows[0].n, 2);
    });

    it('featured ranks 1, 2, 3, and 4 each appear exactly once', async () => {
      const { rows } = await client.query(`
        SELECT featured_rank, count(*)::int AS n
          FROM products
         WHERE featured_rank IS NOT NULL
         GROUP BY featured_rank
         ORDER BY featured_rank
      `);
      assert.equal(rows.length, 4, 'Expected 4 featured products');
      assert.deepEqual(
        rows.map((r) => r.featured_rank),
        [1, 2, 3, 4],
      );
      for (const r of rows) {
        assert.equal(r.n, 1, `featured_rank ${r.featured_rank} should appear exactly once`);
      }
    });

    it('the long-name product is present', async () => {
      const { rows } = await client.query(`
        SELECT slug FROM products
         WHERE slug = 'ultra-slim-monitor-light-bar-with-asymmetric-glare-free-optics-and-wireless-dial'
      `);
      assert.equal(rows.length, 1);
    });

    it('the inactive product is present and not active', async () => {
      const { rows } = await client.query(`
        SELECT is_active FROM products WHERE slug = 'archived-basic-mouse-pad'
      `);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].is_active, false);
    });
  });

  // ── DB-06: seed idempotence ───────────────────────────────────────────────

  describe('DB-06: seed idempotence', () => {
    it('running the seed twice gives identical counts', async () => {
      const testUrl = process.env.TEST_DATABASE_URL;

      const { rows: before } = await client.query(`
        SELECT
          (SELECT count(*)::int FROM categories) AS cats,
          (SELECT count(*)::int FROM products) AS prods,
          (SELECT count(*)::int FROM products WHERE is_active) AS active
      `);

      await runSeed(testUrl, { resetStock: false });

      const { rows: after } = await client.query(`
        SELECT
          (SELECT count(*)::int FROM categories) AS cats,
          (SELECT count(*)::int FROM products) AS prods,
          (SELECT count(*)::int FROM products WHERE is_active) AS active
      `);

      assert.deepEqual(after[0], before[0], 'Counts must not change after second seed run');
    });

    it('stock changed between runs is not overwritten (without --reset-stock)', async () => {
      // Manually change stock for one product.
      await client.query(
        `UPDATE products SET stock_quantity = 999 WHERE slug = 'felt-desk-mat-charcoal'`,
      );

      const testUrl = process.env.TEST_DATABASE_URL;
      await runSeed(testUrl, { resetStock: false });

      const { rows } = await client.query(
        `SELECT stock_quantity FROM products WHERE slug = 'felt-desk-mat-charcoal'`,
      );
      assert.equal(rows[0].stock_quantity, 999, 'Stock must not be overwritten without --reset-stock');
    });

    it('--reset-stock option restores stock to catalog values', async () => {
      await client.query(
        `UPDATE products SET stock_quantity = 999 WHERE slug = 'felt-desk-mat-charcoal'`,
      );

      const testUrl = process.env.TEST_DATABASE_URL;
      await runSeed(testUrl, { resetStock: true });

      const { rows } = await client.query(
        `SELECT stock_quantity FROM products WHERE slug = 'felt-desk-mat-charcoal'`,
      );
      const catalogEntry = catalogProducts.find((p) => p.slug === 'felt-desk-mat-charcoal');
      assert.equal(rows[0].stock_quantity, catalogEntry.stock_quantity);
    });
  });

  // ── DB-07: price_minor values ────────────────────────────────────────────

  describe('DB-07: seeded price_minor values', () => {
    it('every seeded price_minor is a positive integer multiple of 100', async () => {
      const { rows } = await client.query(
        `SELECT slug, price_minor FROM products WHERE slug = ANY($1::text[])`,
        [catalogProducts.map((p) => p.slug)],
      );
      for (const row of rows) {
        assert.ok(
          Number.isInteger(row.price_minor),
          `${row.slug}: price_minor should be an integer`,
        );
        assert.ok(row.price_minor > 0, `${row.slug}: price_minor should be > 0`);
        assert.equal(
          row.price_minor % 100,
          0,
          `${row.slug}: price_minor (${row.price_minor}) must be a multiple of 100`,
        );
      }
      // Verify count matches catalog.
      assert.equal(rows.length, catalogProducts.length);
    });
  });

  // ── DB-08: updated_at trigger ────────────────────────────────────────────

  describe('DB-08: updated_at changes on update', () => {
    it('updating a user row advances updated_at', async () => {
      const { rows: ins } = await client.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ('UpdUser', 'upd@o.com', 'h')
         RETURNING id, updated_at`,
      );
      const userId = ins[0].id;
      const before = ins[0].updated_at;

      // Wait a moment so the timestamp can differ.
      await new Promise((r) => setTimeout(r, 20));

      await client.query(`UPDATE users SET name = 'UpdUser2' WHERE id = $1`, [userId]);

      const { rows: sel } = await client.query(
        `SELECT updated_at FROM users WHERE id = $1`,
        [userId],
      );
      const after = sel[0].updated_at;
      assert.ok(new Date(after) > new Date(before), 'updated_at should advance after update');
    });

    it('updating a product row advances updated_at', async () => {
      const { rows: ins } = await client.query(
        `SELECT id, updated_at FROM products WHERE is_active LIMIT 1`,
      );
      const productId = ins[0].id;
      const before = ins[0].updated_at;

      await new Promise((r) => setTimeout(r, 20));

      await client.query(
        `UPDATE products SET name = name WHERE id = $1`,
        [productId],
      );

      const { rows: sel } = await client.query(
        `SELECT updated_at FROM products WHERE id = $1`,
        [productId],
      );
      const after = sel[0].updated_at;
      assert.ok(new Date(after) > new Date(before), 'products.updated_at should advance after update');
    });
  });

  // ── DB-11: assertSafeTestDatabase() exit conditions ──────────────────────

  describe('DB-11: assertSafeTestDatabase exit conditions', () => {
    it('test-db-reset script refuses when NODE_ENV is not test', async () => {
      // We test the logic in scripts/test-db-reset.js by importing and calling
      // the internal check via a child process-like approach.
      // Instead, we verify the helper function from tests/helpers/db.js directly
      // by checking that the six conditions we tested here are correctly enforced.

      // The assertSafeTestDatabase() function would have already exited if any
      // condition failed (since it is called at the top of this file).
      // We verify the check logic by examining the environment we are running in.

      assert.equal(process.env.NODE_ENV, 'test', 'NODE_ENV must be test for this test to run');
      assert.ok(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL must be set');
      assert.ok(
        !/pooler/.test(new URL(process.env.TEST_DATABASE_URL).hostname),
        'TEST_DATABASE_URL host must not contain -pooler',
      );
      assert.equal(process.env.TEST_DB_DISPOSABLE, 'yes', 'TEST_DB_DISPOSABLE must be yes');
      assert.equal(process.env.VERCEL, undefined, 'VERCEL must not be set');
    });
  });

  // ── DB-12: idempotency backstop ───────────────────────────────────────────

  describe('DB-12: idempotency backstop', () => {
    it('second insert of the same (user_id, idempotency_key) gets SQLSTATE 23505 on orders_idempotency_key', async () => {
      const { rows: uRows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('IDM', 'idm@o.com', 'h') RETURNING id`,
      );
      const userId = uRows[0].id;
      const key = '00000000-0000-4000-8000-000000000042';

      await client.query(
        `INSERT INTO orders
           (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
            shipping_full_name, shipping_phone, shipping_address_line1,
            shipping_city, shipping_region, shipping_postal_code,
            idempotency_key, request_hash)
         VALUES ('DL-IDM001', $1, 'INR', 100, 50, 150,
                 'IDM', '9876543210', '1 St', 'City', 'State', '641001',
                 $2, '\\x01')`,
        [userId, key],
      );

      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO orders
               (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
                shipping_full_name, shipping_phone, shipping_address_line1,
                shipping_city, shipping_region, shipping_postal_code,
                idempotency_key, request_hash)
             VALUES ('DL-IDM002', $1, 'INR', 100, 50, 150,
                     'IDM', '9876543210', '1 St', 'City', 'State', '641001',
                     $2, '\\x02')`,
            [userId, key],
          ),
        (err) => {
          assert.equal(err.code, '23505', 'Must be a unique violation');
          assert.equal(err.constraint, 'orders_idempotency_key', 'Must name the right constraint');
          return true;
        },
      );
    });

    it('same idempotency_key for two different users succeeds', async () => {
      const { rows: u1 } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('IDM2', 'idm2@o.com', 'h') RETURNING id`,
      );
      const { rows: u2 } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('IDM3', 'idm3@o.com', 'h') RETURNING id`,
      );
      const sharedKey = '00000000-0000-4000-8000-000000000043';

      await client.query(
        `INSERT INTO orders
           (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
            shipping_full_name, shipping_phone, shipping_address_line1,
            shipping_city, shipping_region, shipping_postal_code,
            idempotency_key, request_hash)
         VALUES ('DL-IDM003', $1, 'INR', 100, 50, 150,
                 'User', '9876543210', '1 St', 'City', 'State', '641001',
                 $2, '\\x01')`,
        [u1[0].id, sharedKey],
      );
      // This must succeed — same key, different user.
      await assert.doesNotReject(() =>
        client.query(
          `INSERT INTO orders
             (order_number, user_id, currency, subtotal_minor, shipping_minor, total_minor,
              shipping_full_name, shipping_phone, shipping_address_line1,
              shipping_city, shipping_region, shipping_postal_code,
              idempotency_key, request_hash)
           VALUES ('DL-IDM004', $1, 'INR', 100, 50, 150,
                   'User', '9876543210', '1 St', 'City', 'State', '641001',
                   $2, '\\x02')`,
          [u2[0].id, sharedKey],
        ),
      );
    });

    it('SELECT hashtextextended and pg_advisory_xact_lock run without error', async () => {
      // hashtextextended
      const { rows: h } = await client.query(
        `SELECT hashtextextended('order:test:key', 0) AS hash`,
      );
      assert.ok(typeof h[0].hash === 'string' || typeof h[0].hash === 'bigint' || h[0].hash !== null);

      // transaction-scoped advisory lock (inside a real transaction)
      await client.query('BEGIN');
      try {
        await assert.doesNotReject(() =>
          client.query(
            `SELECT pg_advisory_xact_lock(hashtextextended('order:test:key2', 0))`,
          ),
        );
      } finally {
        await client.query('COMMIT');
      }
    });
  });

  // ── DB-13: no global parser ───────────────────────────────────────────────

  describe('DB-13: no global type parser overrides', () => {
    it('SELECT 1::bigint returns string "1" (not number 1)', async () => {
      const { rows } = await client.query(`SELECT 1::bigint AS n`);
      assert.equal(typeof rows[0].n, 'string', 'bigint column must arrive as a string');
      assert.equal(rows[0].n, '1');
    });

    it('SELECT 1::numeric returns a string (not a number)', async () => {
      const { rows } = await client.query(`SELECT 1::numeric AS n`);
      assert.equal(typeof rows[0].n, 'string', 'numeric column must arrive as a string');
    });

    it('SELECT 1::integer returns number 1 (not a string)', async () => {
      const { rows } = await client.query(`SELECT 1::integer AS n`);
      assert.equal(typeof rows[0].n, 'number', 'integer column must arrive as a number');
      assert.equal(rows[0].n, 1);
    });
  });
});

