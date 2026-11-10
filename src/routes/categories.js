/**
 * src/routes/categories.js
 *
 * Categories API endpoints (§4.5, API-03, API-16, API-18, API-64).
 */

import { Router } from 'express';
import { toSafeCount } from '../lib/numbers.js';

/**
 * Creates categories router.
 *
 * @param {object} options
 * @param {import('pg').Pool} [options.pool]
 * @returns {import('express').Router}
 */
export function createCategoriesRouter({ pool } = {}) {
  const router = Router();

  router.get('/categories', async (req, res, next) => {
    // 1. Check for repeated query parameters (Contract 4.1)
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        res.locals.errorCode = 'VALIDATION_ERROR';
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Some fields need attention.',
            fields: { [key]: `Query parameter "${key}" cannot be repeated.` },
            requestId: req.id,
          },
        });
      }
    }

    // 2. Set caching headers (§4.1, API-18)
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

    // 3. Database connectivity check
    if (!pool) {
      res.locals.errorCode = 'SERVICE_UNAVAILABLE';
      return res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable. Please try again later.',
          requestId: req.id,
        },
      });
    }

    try {
      // 4. Query categories in sort_order counting only active products (API-03, API-14)
      const sql = `
        SELECT
          c.id,
          c.slug,
          c.name,
          c.image_url,
          COUNT(p.id) AS product_count
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id AND p.is_active = true
        GROUP BY c.id, c.slug, c.name, c.sort_order, c.image_url
        ORDER BY c.sort_order ASC, c.name ASC
      `;

      const result = await pool.query(sql);

      // 5. Map to public Category DTO (§4.3, API-16, API-64)
      const items = result.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        productCount: toSafeCount(row.product_count, 'productCount'),
        image: row.image_url ?? null,
      }));

      return res.status(200).json({ items });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

