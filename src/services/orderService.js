/**
 * src/services/orderService.js
 *
 * Transactional order creation and reading service (§4.8, §4.9, §4A.1, §4A.2, §6.5).
 *
 * Enforces:
 * - Deterministic advisory lock on (user_id, idempotency_key) before any stock check (4A.1).
 * - Mandatory READ COMMITTED transaction with local timeouts (5s lock_timeout, statement_timeout).
 * - Sequential product locking (ORDER BY id FOR UPDATE) to guarantee deadlock freedom.
 * - Comprehensive stock verification reporting all conflicts before failing.
 * - Safe integer paise money calculations via src/lib/money.js and src/lib/numbers.js.
 * - Database sequence-based order numbers (src/lib/orderNumber.js).
 * - Invariant verification on read-back before commit.
 * - Single re-read on unique 23505 conflict backstop.
 * - Strict owner isolation for order listing and order detail reading.
 */

import { toSafeMinor, toSafeCount } from '../lib/numbers.js';
import { calculateOrderTotals } from '../lib/money.js';
import { generateOrderNumber } from '../lib/orderNumber.js';
import { validateOrderInput, validateIdempotencyKey } from '../validators/orders.js';
import { checkRateLimit } from './rateLimiter.js';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serialize an order row and its items into the contract OrderDetail shape.
 *
 * @param {object} orderRow
 * @param {object[]} itemRows
 * @returns {object}
 */
export function serializeOrderDetail(orderRow, itemRows) {
  const subtotalMinor = toSafeMinor(orderRow.subtotal_minor, 'subtotalMinor');
  const shippingMinor = toSafeMinor(orderRow.shipping_minor, 'shippingMinor');
  const totalMinor = toSafeMinor(orderRow.total_minor, 'totalMinor');

  if (totalMinor !== subtotalMinor + shippingMinor) {
    const err = new Error('Order total does not equal subtotal plus shipping');
    err.code = 'ORDER_INVARIANT_FAILED';
    throw err;
  }

  let lineSum = 0;
  const items = itemRows.map((item) => {
    const unitPriceMinor = toSafeMinor(item.unit_price_minor, 'unitPriceMinor');
    const quantity = toSafeCount(item.quantity, 'quantity');
    const lineTotalMinor = toSafeMinor(item.line_total_minor, 'lineTotalMinor');

    if (lineTotalMinor !== unitPriceMinor * quantity) {
      const err = new Error('Line total does not equal unit price times quantity');
      err.code = 'ORDER_INVARIANT_FAILED';
      throw err;
    }
    lineSum += lineTotalMinor;

    return {
      productId: toSafeCount(item.product_id, 'productId'),
      slug: item.product_slug,
      name: item.product_name,
      unitPriceMinor,
      quantity,
      lineTotalMinor,
      image: item.url
        ? {
            url: item.url,
            alt: item.alt,
            width: toSafeCount(item.width, 'width'),
            height: toSafeCount(item.height, 'height'),
          }
        : null,
    };
  });

  if (lineSum !== subtotalMinor) {
    const err = new Error('Sum of line totals does not equal subtotal');
    err.code = 'ORDER_INVARIANT_FAILED';
    throw err;
  }

  return {
    id: orderRow.id,
    orderNumber: orderRow.order_number,
    status: orderRow.status,
    createdAt:
      orderRow.created_at instanceof Date
        ? orderRow.created_at.toISOString()
        : new Date(orderRow.created_at).toISOString(),
    currency: orderRow.currency,
    subtotalMinor,
    shippingMinor,
    totalMinor,
    shipping: {
      fullName: orderRow.shipping_full_name,
      phone: orderRow.shipping_phone,
      addressLine1: orderRow.shipping_address_line1,
      addressLine2: orderRow.shipping_address_line2 || null,
      city: orderRow.shipping_city,
      region: orderRow.shipping_region,
      postalCode: orderRow.shipping_postal_code,
    },
    items,
  };
}

/**
 * Helper to fetch order items with leading image for an order.
 */
async function fetchOrderItems(db, orderId) {
  const itemsRes = await db.query(
    `SELECT oi.id, oi.product_id, oi.product_name, oi.product_slug,
            oi.unit_price_minor, oi.quantity, oi.line_total_minor,
            pi.url, pi.alt, pi.width, pi.height
     FROM order_items oi
     LEFT JOIN LATERAL (
       SELECT url, alt, width, height
       FROM product_images
       WHERE product_id = oi.product_id
       ORDER BY sort_order ASC
       LIMIT 1
     ) pi ON true
     WHERE oi.order_id = $1
     ORDER BY oi.id ASC`,
    [orderId]
  );
  return itemsRes.rows;
}

/**
 * Helper to fetch order detail by user ID and idempotency key (used for replays).
 * Uses a single query with json_agg to minimize network round-trips.
 */
async function fetchOrderByIdempotencyKey(db, userId, idempotencyKey) {
  const res = await db.query(
    `SELECT o.id, o.order_number, o.status, o.currency, o.subtotal_minor, o.shipping_minor, o.total_minor,
            o.shipping_full_name, o.shipping_phone, o.shipping_address_line1, o.shipping_address_line2,
            o.shipping_city, o.shipping_region, o.shipping_postal_code, o.request_hash, o.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'product_name', oi.product_name,
                  'product_slug', oi.product_slug,
                  'unit_price_minor', oi.unit_price_minor,
                  'quantity', oi.quantity,
                  'line_total_minor', oi.line_total_minor,
                  'url', pi.url,
                  'alt', pi.alt,
                  'width', pi.width,
                  'height', pi.height
                ) ORDER BY oi.id ASC
              ) FILTER (WHERE oi.id IS NOT NULL),
              '[]'
            ) AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN LATERAL (
       SELECT url, alt, width, height
       FROM product_images
       WHERE product_id = oi.product_id
       ORDER BY sort_order ASC
       LIMIT 1
     ) pi ON true
     WHERE o.user_id = $1 AND o.idempotency_key = $2
     GROUP BY o.id`,
    [userId, idempotencyKey]
  );

  if (res.rows.length === 0) {
    return null;
  }

  const row = res.rows[0];
  return {
    orderRow: row,
    itemRows: row.items,
  };
}

/**
 * Normative order creation algorithm (§4.9, §4A.1).
 *
 * @param {object} params
 * @param {import('../config.js').AppConfig} params.config
 * @param {import('pg').Pool} params.pool
 * @param {string} params.userId
 * @param {string} params.idempotencyKey
 * @param {unknown} params.body
 * @returns {Promise<{ isReplay: boolean, status: number, order: object }>}
 */
export async function createOrder({ config, pool, userId, idempotencyKey, body }) {
  // 1. Validate Idempotency-Key header and request body
  const cleanKey = validateIdempotencyKey(idempotencyKey);
  const { canonicalItems, shipping, requestHash } = validateOrderInput(body);

  // 2. Count attempt against orders_user rate-limit bucket before transaction
  const rateLimitResult = await checkRateLimit(pool, 'orders_user', userId);
  if (!rateLimitResult.allowed) {
    const err = new Error('Too many order attempts. Please try again later.');
    err.status = 429;
    err.code = 'RATE_LIMITED';
    err.retryAfter = rateLimitResult.retryAfter;
    throw err;
  }

  // 3. Acquire dedicated pool client for the transaction
  const client = await pool.connect();

  try {
    // 3. Open transaction at READ COMMITTED and set local timeouts (§4A.1 step 3)
    const stmtTimeoutMs = config.db?.statementTimeoutMs ?? 30000;
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await client.query("SELECT set_config('lock_timeout', '5s', true), set_config('statement_timeout', $1, true)", [
      `${stmtTimeoutMs}ms`,
    ]);

    // 4. Serialise by user and key with transaction-scoped advisory lock (4A.1)
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order:' || $1 || ':' || $2, 0))", [
      userId,
      cleanKey,
    ]);

    // 5. Idempotency lookup
    const existing = await fetchOrderByIdempotencyKey(client, userId, cleanKey);
    if (existing) {
      if (Buffer.compare(existing.orderRow.request_hash, requestHash) === 0) {
        await client.query('COMMIT');
        const serialized = serializeOrderDetail(existing.orderRow, existing.itemRows);
        return { isReplay: true, status: 200, order: serialized };
      }

      await client.query('ROLLBACK');
      const conflictErr = new Error('Idempotency key has already been used with a different request payload.');
      conflictErr.status = 409;
      conflictErr.code = 'IDEMPOTENCY_KEY_REUSED';
      throw conflictErr;
    }

    // 6. Generate order number from sequence before locking products
    const orderNumber = await generateOrderNumber(client, config.orderNumberPrefix);

    // 7. Lock and read products in ascending ID order (deadlock freedom)
    const productIds = canonicalItems.map((i) => i.productId);
    const productsRes = await client.query(
      `SELECT id, name, slug, price_minor, stock_quantity, is_active
       FROM products
       WHERE id = ANY($1::int[])
       ORDER BY id ASC
       FOR UPDATE`,
      [productIds]
    );

    const productMap = new Map();
    for (const prod of productsRes.rows) {
      productMap.set(prod.id, prod);
    }

    // 8. Verify every line; collect all problems
    const problems = [];
    for (const item of canonicalItems) {
      const prod = productMap.get(item.productId);
      if (!prod || !prod.is_active) {
        problems.push({
          productId: item.productId,
          name: prod ? prod.name : 'Unknown Product',
          requestedQuantity: item.quantity,
          availableQuantity: 0,
          reason: 'unavailable',
        });
      } else if (prod.stock_quantity === 0) {
        problems.push({
          productId: item.productId,
          name: prod.name,
          requestedQuantity: item.quantity,
          availableQuantity: 0,
          reason: 'out_of_stock',
        });
      } else if (item.quantity > prod.stock_quantity) {
        problems.push({
          productId: item.productId,
          name: prod.name,
          requestedQuantity: item.quantity,
          availableQuantity: prod.stock_quantity,
          reason: 'insufficient_stock',
        });
      }
    }

    if (problems.length > 0) {
      await client.query('ROLLBACK');
      const stockErr = new Error(
        'One or more items in your cart are no longer available in the requested quantity.'
      );
      stockErr.status = 409;
      stockErr.code = 'STOCK_CONFLICT';
      stockErr.details = { items: problems };
      throw stockErr;
    }

    // 9. Compute money using safe integer paise
    const totals = calculateOrderTotals({
      items: canonicalItems.map((item) => {
        const prod = productMap.get(item.productId);
        return {
          unitPriceMinor: toSafeMinor(prod.price_minor, 'unitPriceMinor'),
          quantity: item.quantity,
        };
      }),
      shippingMinor: toSafeMinor(config.shippingFlatMinor, 'shippingMinor'),
    });

    // 10. Decrement stock per line (defensive update)
    for (const item of canonicalItems) {
      const upd = await client.query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2 AND stock_quantity >= $1',
        [item.quantity, item.productId]
      );
      if (upd.rowCount === 0) {
        await client.query('ROLLBACK');
        const conflictErr = new Error('Stock level changed concurrently during checkout.');
        conflictErr.status = 409;
        conflictErr.code = 'STOCK_CONFLICT';
        conflictErr.details = {
          items: [
            {
              productId: item.productId,
              name: productMap.get(item.productId)?.name || 'Unknown Product',
              requestedQuantity: item.quantity,
              availableQuantity: 0,
              reason: 'insufficient_stock',
            },
          ],
        };
        throw conflictErr;
      }
    }

    // 11. Insert order row
    const insertOrderRes = await client.query(
      `INSERT INTO orders (
        order_number, user_id, status, currency,
        subtotal_minor, shipping_minor, total_minor,
        shipping_full_name, shipping_phone,
        shipping_address_line1, shipping_address_line2,
        shipping_city, shipping_region, shipping_postal_code,
        idempotency_key, request_hash
      ) VALUES (
        $1, $2, 'placed', 'INR',
        $3, $4, $5,
        $6, $7,
        $8, $9,
        $10, $11, $12,
        $13, $14
      ) RETURNING id, order_number, status, currency, subtotal_minor, shipping_minor, total_minor,
        shipping_full_name, shipping_phone, shipping_address_line1, shipping_address_line2,
        shipping_city, shipping_region, shipping_postal_code, created_at`,
      [
        orderNumber,
        userId,
        totals.subtotalMinor,
        totals.shippingMinor,
        totals.totalMinor,
        shipping.fullName,
        shipping.phone,
        shipping.addressLine1,
        shipping.addressLine2,
        shipping.city,
        shipping.region,
        shipping.postalCode,
        cleanKey,
        requestHash,
      ]
    );
    const orderRow = insertOrderRes.rows[0];

    // 12. Insert order items in batch
    const valueClauses = [];
    const itemValues = [];
    let pIdx = 1;
    for (let i = 0; i < canonicalItems.length; i++) {
      const item = canonicalItems[i];
      const prod = productMap.get(item.productId);
      const unitPriceMinor = toSafeMinor(prod.price_minor, 'unitPriceMinor');
      const lineTotalMinor = totals.lines[i];

      valueClauses.push(
        `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`
      );
      itemValues.push(
        orderRow.id,
        item.productId,
        prod.name,
        prod.slug,
        unitPriceMinor,
        item.quantity,
        lineTotalMinor
      );
    }

    await client.query(
      `INSERT INTO order_items (
        order_id, product_id, product_name, product_slug,
        unit_price_minor, quantity, line_total_minor
      ) VALUES ${valueClauses.join(', ')}`,
      itemValues
    );

    // 13. Read back order items inside transaction (before commit)
    const itemRows = await fetchOrderItems(client, orderRow.id);

    // Assert invariants
    const serializedOrder = serializeOrderDetail(orderRow, itemRows);

    // 14. Commit
    await client.query('COMMIT');
    return { isReplay: false, status: 201, order: serializedOrder };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    // Unique violation backstop (23505 on orders_idempotency_key) (§4A.1 step 13)
    if (err.code === '23505' && err.constraint === 'orders_idempotency_key') {
      try {
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '8s'");
        const retryExisting = await fetchOrderByIdempotencyKey(client, userId, cleanKey);
        if (retryExisting) {
          if (Buffer.compare(retryExisting.orderRow.request_hash, requestHash) === 0) {
            await client.query('COMMIT');
            const serialized = serializeOrderDetail(retryExisting.orderRow, retryExisting.itemRows);
            return { isReplay: true, status: 200, order: serialized };
          }
          await client.query('ROLLBACK');
          const conflictErr = new Error(
            'Idempotency key has already been used with a different request payload.'
          );
          conflictErr.status = 409;
          conflictErr.code = 'IDEMPOTENCY_KEY_REUSED';
          throw conflictErr;
        }
        await client.query('ROLLBACK');
      } catch (retryErr) {
        try {
          await client.query('ROLLBACK');
        } catch {}
        if (retryErr.status) throw retryErr;
      }
    }

    // Lock timeout (55P03) or statement timeout (57014) or deadlock (40P01) or network error
    if (
      err.code === '55P03' ||
      err.code === '57014' ||
      err.code === '40P01' ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'ETIMEDOUT'
    ) {
      const serviceErr = new Error('Database service temporarily unavailable.');
      serviceErr.status = 503;
      serviceErr.code = 'SERVICE_UNAVAILABLE';
      throw serviceErr;
    }

    // Re-throw if error already has status code
    if (err.status) {
      throw err;
    }

    // Generic unexpected error (500)
    const internalErr = new Error('An unexpected internal error occurred.');
    internalErr.status = 500;
    internalErr.code = err.code || 'INTERNAL_ERROR';
    internalErr.cause = err;
    throw internalErr;
  } finally {
    client.release();
  }
}

/**
 * List orders for the authenticated user (§4.8, API-60).
 *
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {{ page?: number, limit?: number }} [query={}]
 * @returns {Promise<{ items: object[], pagination: object }>}
 */
export async function getOrderList(pool, userId, query = {}) {
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const limit = Math.max(1, Math.min(50, Number(query.limit) || 10));
  const offset = (page - 1) * limit;

  // Total count
  const countRes = await pool.query('SELECT COUNT(*) AS total FROM orders WHERE user_id = $1', [userId]);
  const total = toSafeCount(countRes.rows[0].total, 'pagination.total');
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Orders page
  const ordersRes = await pool.query(
    `SELECT id, order_number, status, created_at, currency, total_minor,
            (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = orders.id) AS item_count
     FROM orders
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  if (ordersRes.rows.length === 0) {
    return {
      items: [],
      pagination: { page, limit, total, totalPages },
    };
  }

  const orderIds = ordersRes.rows.map((r) => r.id);

  // Fetch thumbnails: up to 3 per order from item primary images
  const thumbnailsRes = await pool.query(
    `SELECT oi.order_id, pi.url, pi.alt, pi.width, pi.height
     FROM order_items oi
     LEFT JOIN LATERAL (
       SELECT url, alt, width, height
       FROM product_images
       WHERE product_id = oi.product_id
       ORDER BY sort_order ASC
       LIMIT 1
     ) pi ON true
     WHERE oi.order_id = ANY($1::uuid[])
     ORDER BY oi.id ASC`,
    [orderIds]
  );

  const thumbnailsMap = new Map();
  for (const row of thumbnailsRes.rows) {
    if (!row.url) continue;
    if (!thumbnailsMap.has(row.order_id)) {
      thumbnailsMap.set(row.order_id, []);
    }
    const list = thumbnailsMap.get(row.order_id);
    if (list.length < 3) {
      list.push({
        url: row.url,
        alt: row.alt,
        width: toSafeCount(row.width, 'width'),
        height: toSafeCount(row.height, 'height'),
      });
    }
  }

  const items = ordersRes.rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    currency: row.currency,
    itemCount: toSafeCount(row.item_count, 'itemCount'),
    totalMinor: toSafeMinor(row.total_minor, 'totalMinor'),
    thumbnails: thumbnailsMap.get(row.id) || [],
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Get single order detail by ID for the authenticated user (§4.8, API-61, API-62).
 *
 * @param {import('pg').Pool} pool
 * @param {string} orderId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getOrderDetailById(pool, orderId, userId) {
  if (typeof orderId !== 'string' || !UUID_REGEX.test(orderId)) {
    const err = new Error('Order not found.');
    err.status = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  const orderRes = await pool.query(
    `SELECT id, order_number, status, created_at, currency,
            subtotal_minor, shipping_minor, total_minor,
            shipping_full_name, shipping_phone,
            shipping_address_line1, shipping_address_line2,
            shipping_city, shipping_region, shipping_postal_code
     FROM orders
     WHERE id = $1 AND user_id = $2`,
    [orderId, userId]
  );

  if (orderRes.rows.length === 0) {
    const err = new Error('Order not found.');
    err.status = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  const orderRow = orderRes.rows[0];

  const itemsRes = await pool.query(
    `SELECT oi.id, oi.product_id, oi.product_name, oi.product_slug,
            oi.unit_price_minor, oi.quantity, oi.line_total_minor,
            pi.url, pi.alt, pi.width, pi.height
     FROM order_items oi
     LEFT JOIN LATERAL (
       SELECT url, alt, width, height
       FROM product_images
       WHERE product_id = oi.product_id
       ORDER BY sort_order ASC
       LIMIT 1
     ) pi ON true
     WHERE oi.order_id = $1
     ORDER BY oi.id ASC`,
    [orderId]
  );

  return serializeOrderDetail(orderRow, itemsRes.rows);
}

