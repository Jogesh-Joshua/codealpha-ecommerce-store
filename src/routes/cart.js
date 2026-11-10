/**
 * src/routes/cart.js
 *
 * Cart API router (§4.6, DR-01, DR-02, DR-15, API-21 to API-30, API-64).
 *
 * Enforces:
 * - Public endpoint POST /api/cart/validate (works without session).
 * - Database-backed rate limiting per IP (bucket 'cart_ip', 120 per 10m).
 * - Cache-Control: no-store on all cart responses.
 * - Source of truth is PostgreSQL: never trust client prices, names, stock, or totals.
 * - Merge duplicate product IDs by summing quantities before calculation.
 * - Enforce maximum quantity cap of 10 per line.
 * - Correct status and issues: 'ok', 'quantity_reduced' (INSUFFICIENT_STOCK / QUANTITY_CAPPED),
 *   'out_of_stock' (OUT_OF_STOCK), 'unavailable' (PRODUCT_UNAVAILABLE).
 * - Summary counts only 'ok' lines; shipping is 0 when no 'ok' lines exist.
 * - All numbers projected as safe integers via toSafeMinor / toSafeCount.
 */

import { Router } from 'express';
import { validateCartValidate } from '../validators/cart.js';
import { checkRateLimit } from '../services/rateLimiter.js';
import { toSafeCount, toSafeMinor } from '../lib/numbers.js';

/**
 * Creates cart router.
 *
 * @param {object} options
 * @param {import('../config.js').AppConfig} options.config
 * @param {import('pg').Pool} options.pool
 * @param {object} [options.logSink]
 * @returns {import('express').Router}
 */
export function createCartRouter({ config, pool } = {}) {
  const router = Router();

  // ---------------------------------------------------------------------------
  // POST /cart/validate — Validate client cart against server database
  // ---------------------------------------------------------------------------
  router.post('/cart/validate', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');

      // 1. Rate limiting (bucket: 'cart_ip', limit: 120 / 10m, §6.5, API-30)
      const clientIp = req.ip || '127.0.0.1';
      const rateCheck = await checkRateLimit(pool, 'cart_ip', clientIp);
      if (!rateCheck.allowed) {
        res.set('Retry-After', String(rateCheck.retryAfter));
        return res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many cart validation requests. Please try again later.',
            requestId: req.id,
          },
        });
      }

      // 2. Validate request body (strict, max 50 items, integer checks, API-28)
      const { items } = validateCartValidate(req.body);

      // 3. Merge duplicate productId entries by summing quantities (API-22)
      const mergedMap = new Map();
      for (const item of items) {
        if (mergedMap.has(item.productId)) {
          mergedMap.get(item.productId).quantity += item.quantity;
        } else {
          mergedMap.set(item.productId, {
            productId: item.productId,
            quantity: item.quantity,
          });
        }
      }
      const mergedItems = Array.from(mergedMap.values());

      // 4. Handle empty cart (API-28)
      if (mergedItems.length === 0) {
        return res.status(200).json({
          lines: [],
          summary: {
            subtotalMinor: 0,
            shippingMinor: 0,
            totalMinor: 0,
            currency: 'INR',
            itemCount: 0,
          },
          hasBlockingIssues: false,
        });
      }

      // 5. Query PostgreSQL for product information
      const productIds = mergedItems.map((item) => item.productId);

      const productsResult = await pool.query(
        `
        SELECT
          id,
          slug,
          name,
          price_minor,
          stock_quantity,
          is_active
        FROM products
        WHERE id = ANY($1::int[])
        `,
        [productIds]
      );

      const productMap = new Map();
      for (const row of productsResult.rows) {
        productMap.set(row.id, row);
      }

      // 6. Query primary images for requested products
      const imagesResult = await pool.query(
        `
        SELECT product_id, url, alt, width, height, sort_order
        FROM product_images
        WHERE product_id = ANY($1::int[])
        ORDER BY sort_order ASC
        `,
        [productIds]
      );

      const primaryImageMap = new Map();
      for (const img of imagesResult.rows) {
        if (!primaryImageMap.has(img.product_id)) {
          primaryImageMap.set(img.product_id, {
            url: img.url,
            alt: img.alt,
            width: toSafeCount(img.width, 'width'),
            height: toSafeCount(img.height, 'height'),
          });
        }
      }

      // 7. Evaluate each line
      const lines = [];
      let subtotalMinor = 0;
      let itemCount = 0;
      let hasBlockingIssues = false;

      for (const item of mergedItems) {
        const p = productMap.get(item.productId);
        const image = p ? primaryImageMap.get(p.id) || null : null;
        const requestedQuantity = item.quantity;

        // Condition 1: Unknown or inactive product (API-25)
        if (!p || !p.is_active) {
          hasBlockingIssues = true;
          lines.push({
            productId: toSafeCount(item.productId, 'productId'),
            slug: p ? p.slug : null,
            name: p ? p.name : 'Unavailable product',
            image: null,
            unitPriceMinor: 0,
            requestedQuantity: toSafeCount(requestedQuantity, 'requestedQuantity'),
            status: 'unavailable',
            allowedQuantity: 0,
            lineTotalMinor: 0,
            issues: [
              {
                code: 'PRODUCT_UNAVAILABLE',
                message: 'This item is no longer available.',
              },
            ],
          });
        }
        // Condition 2: Stock is zero (API-24)
        else if (p.stock_quantity <= 0) {
          hasBlockingIssues = true;
          lines.push({
            productId: toSafeCount(p.id, 'productId'),
            slug: p.slug,
            name: p.name,
            image,
            unitPriceMinor: toSafeMinor(p.price_minor, 'unitPriceMinor'),
            requestedQuantity: toSafeCount(requestedQuantity, 'requestedQuantity'),
            status: 'out_of_stock',
            allowedQuantity: 0,
            lineTotalMinor: 0,
            issues: [
              {
                code: 'OUT_OF_STOCK',
                message: 'This item is currently out of stock.',
              },
            ],
          });
        }
        // Condition 3: Requested quantity exceeds available stock and stock < 10 (API-23)
        else if (requestedQuantity > p.stock_quantity && p.stock_quantity < 10) {
          hasBlockingIssues = true;
          const allowedQuantity = p.stock_quantity;
          lines.push({
            productId: toSafeCount(p.id, 'productId'),
            slug: p.slug,
            name: p.name,
            image,
            unitPriceMinor: toSafeMinor(p.price_minor, 'unitPriceMinor'),
            requestedQuantity: toSafeCount(requestedQuantity, 'requestedQuantity'),
            status: 'quantity_reduced',
            allowedQuantity: toSafeCount(allowedQuantity, 'allowedQuantity'),
            lineTotalMinor: 0,
            issues: [
              {
                code: 'INSUFFICIENT_STOCK',
                message:
                  allowedQuantity === 1
                    ? 'Only 1 is available.'
                    : `Only ${allowedQuantity} are available.`,
              },
            ],
          });
        }
        // Condition 4: Requested quantity exceeds 10 (API-26)
        else if (requestedQuantity > 10) {
          hasBlockingIssues = true;
          const allowedQuantity = 10;
          lines.push({
            productId: toSafeCount(p.id, 'productId'),
            slug: p.slug,
            name: p.name,
            image,
            unitPriceMinor: toSafeMinor(p.price_minor, 'unitPriceMinor'),
            requestedQuantity: toSafeCount(requestedQuantity, 'requestedQuantity'),
            status: 'quantity_reduced',
            allowedQuantity: toSafeCount(allowedQuantity, 'allowedQuantity'),
            lineTotalMinor: 0,
            issues: [
              {
                code: 'QUANTITY_CAPPED',
                message: 'Quantity is capped at 10 per item.',
              },
            ],
          });
        }
        // Condition 5: Valid line (API-21)
        else {
          const unitPriceMinor = toSafeMinor(p.price_minor, 'unitPriceMinor');
          const lineTotalMinor = toSafeMinor(
            unitPriceMinor * requestedQuantity,
            'lineTotalMinor'
          );
          subtotalMinor += lineTotalMinor;
          itemCount += requestedQuantity;

          lines.push({
            productId: toSafeCount(p.id, 'productId'),
            slug: p.slug,
            name: p.name,
            image,
            unitPriceMinor,
            requestedQuantity: toSafeCount(requestedQuantity, 'requestedQuantity'),
            status: 'ok',
            allowedQuantity: toSafeCount(requestedQuantity, 'allowedQuantity'),
            lineTotalMinor,
            issues: [],
          });
        }
      }

      // 8. Summary calculations (§4.6, API-21, API-27)
      const hasOkLines = lines.some((l) => l.status === 'ok');
      const shippingMinor = hasOkLines
        ? toSafeMinor(config.shippingFlatMinor, 'shippingMinor')
        : 0;
      const totalMinor = toSafeMinor(subtotalMinor + shippingMinor, 'totalMinor');

      return res.status(200).json({
        lines,
        summary: {
          subtotalMinor: toSafeMinor(subtotalMinor, 'subtotalMinor'),
          shippingMinor,
          totalMinor,
          currency: 'INR',
          itemCount: toSafeCount(itemCount, 'itemCount'),
        },
        hasBlockingIssues,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

