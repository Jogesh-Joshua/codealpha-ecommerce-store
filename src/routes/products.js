/**
 * src/routes/products.js
 *
 * Products API endpoints (§4.5, API-04 to API-20, API-64, SECT-09).
 */

import { Router } from 'express';
import { escapeLike } from '../lib/escapeLike.js';
import { toSafeCount, toSafeMinor } from '../lib/numbers.js';
import {
  validateProductQuery,
  isValidProductSlug,
} from '../validators/products.js';

/**
 * Creates products router.
 *
 * @param {object} options
 * @param {import('pg').Pool} [options.pool]
 * @returns {import('express').Router}
 */
export function createProductsRouter({ pool } = {}) {
  const router = Router();

  /**
   * Helper to compute stockStatus, maxPurchasableQuantity, and lowStockRemaining (§4.3, API-15).
   *
   * @param {number} stock
   * @returns {{
   *   stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock',
   *   lowStockRemaining: number | null,
   *   maxPurchasableQuantity: number
   * }}
   */
  function computeStockFields(stock) {
    if (stock <= 0) {
      return {
        stockStatus: 'out_of_stock',
        lowStockRemaining: null,
        maxPurchasableQuantity: 0,
      };
    }
    if (stock >= 1 && stock <= 5) {
      return {
        stockStatus: 'low_stock',
        lowStockRemaining: stock,
        maxPurchasableQuantity: stock,
      };
    }
    return {
      stockStatus: 'in_stock',
      lowStockRemaining: null,
      maxPurchasableQuantity: Math.min(stock, 10),
    };
  }

  // ---------------------------------------------------------------------------
  // GET /products — Product listing with search, filters, sort & pagination
  // ---------------------------------------------------------------------------
  router.get('/products', async (req, res, next) => {
    // 1. Set caching headers (§4.1, API-18)
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

    // 2. Validate and normalize query parameters (UT-05, API-06, API-11, API-13)
    let validated;
    try {
      validated = validateProductQuery(req.query);
    } catch (err) {
      return next(err);
    }

    const { page, limit, sort, category, search } = validated;

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
      // 4. Build parameterized WHERE conditions (API-07, API-08, API-09, API-10, API-11, API-14, SECT-09)
      const conditions = ['p.is_active = true'];
      const params = [];

      if (category) {
        params.push(category);
        conditions.push(`c.slug = $${params.length}`);
      }

      if (search) {
        const escaped = escapeLike(search);
        params.push(`%${escaped}%`);
        const searchIdx = params.length;
        conditions.push(
          `(p.name ILIKE $${searchIdx} ESCAPE '\\' OR p.summary ILIKE $${searchIdx} ESCAPE '\\' OR p.description ILIKE $${searchIdx} ESCAPE '\\')`
        );
      }

      const whereClause = conditions.join(' AND ');

      // 5. Total count query for pagination
      const countSql = `
        SELECT COUNT(*) AS total
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE ${whereClause}
      `;

      const countResult = await pool.query(countSql, params);
      const total = toSafeCount(countResult.rows[0].total, 'total');
      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

      // 6. Map sort expression from allow-list with id tie-breaker (API-12)
      let orderClause;
      switch (sort) {
        case 'featured':
          orderClause = 'p.featured_rank ASC NULLS LAST, p.id ASC';
          break;
        case 'price_asc':
          orderClause = 'p.price_minor ASC, p.id ASC';
          break;
        case 'price_desc':
          orderClause = 'p.price_minor DESC, p.id ASC';
          break;
        case 'newest':
          orderClause = 'p.created_at DESC, p.id DESC';
          break;
        case 'name_asc':
          orderClause = 'lower(p.name) ASC, p.id ASC';
          break;
        default:
          orderClause = 'p.featured_rank ASC NULLS LAST, p.id ASC';
      }

      // 7. Paged products query
      const offset = (page - 1) * limit;
      const pageParams = [...params, limit, offset];
      const limitIdx = params.length + 1;
      const offsetIdx = params.length + 2;

      const productsSql = `
        SELECT
          p.id,
          p.slug,
          p.name,
          p.summary,
          p.price_minor,
          p.stock_quantity,
          c.slug AS category_slug,
          c.name AS category_name
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE ${whereClause}
        ORDER BY ${orderClause}
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;

      const productsResult = await pool.query(productsSql, pageParams);

      // 8. Batched query for product images (one query for all page products) (§4.5)
      const productIds = productsResult.rows.map((r) => r.id);
      const primaryImageMap = new Map();

      if (productIds.length > 0) {
        const imagesSql = `
          SELECT product_id, url, alt, width, height, sort_order
          FROM product_images
          WHERE product_id = ANY($1::int[])
          ORDER BY sort_order ASC
        `;
        const imagesResult = await pool.query(imagesSql, [productIds]);
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
      }

      // 9. Map to ProductSummary DTO (§4.3, API-15, API-16, API-64)
      const items = productsResult.rows.map((row) => {
        const { stockStatus, lowStockRemaining, maxPurchasableQuantity } =
          computeStockFields(row.stock_quantity);

        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          summary: row.summary,
          priceMinor: toSafeMinor(row.price_minor, 'priceMinor'),
          currency: 'INR',
          category: {
            slug: row.category_slug,
            name: row.category_name,
          },
          image: primaryImageMap.get(row.id) || null,
          stockStatus,
          maxPurchasableQuantity,
          lowStockRemaining,
        };
      });

      // 10. Return paginated response (API-04, API-05, API-17)
      return res.status(200).json({
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        query: {
          search: search ?? null,
          category: category ?? null,
          sort,
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /products/:slug — Single product detail
  // ---------------------------------------------------------------------------
  router.get('/products/:slug', async (req, res, next) => {
    // 1. Set caching headers (§4.1, API-18)
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

    const { slug } = req.params;

    // 2. Validate product slug format; malformed slug returns 404 PRODUCT_NOT_FOUND (API-20)
    if (!isValidProductSlug(slug)) {
      res.locals.errorCode = 'PRODUCT_NOT_FOUND';
      return res.status(404).json({
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found.',
          requestId: req.id,
        },
      });
    }

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
      // 4. Query product and joined category by slug
      const productSql = `
        SELECT
          p.id,
          p.slug,
          p.name,
          p.summary,
          p.description,
          p.specs,
          p.price_minor,
          p.stock_quantity,
          p.is_active,
          p.created_at,
          c.slug AS category_slug,
          c.name AS category_name
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.slug = $1
      `;

      const result = await pool.query(productSql, [slug]);
      const row = result.rows[0];

      // 5. Inactive or missing product returns 404 PRODUCT_NOT_FOUND (API-14, API-20)
      if (!row || !row.is_active) {
        res.locals.errorCode = 'PRODUCT_NOT_FOUND';
        return res.status(404).json({
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'Product not found.',
            requestId: req.id,
          },
        });
      }

      // 6. Query ordered product images (§4.5, API-19)
      const imagesSql = `
        SELECT url, alt, width, height, sort_order
        FROM product_images
        WHERE product_id = $1
        ORDER BY sort_order ASC
      `;
      const imagesResult = await pool.query(imagesSql, [row.id]);
      const images = imagesResult.rows.map((img) => ({
        url: img.url,
        alt: img.alt,
        width: toSafeCount(img.width, 'width'),
        height: toSafeCount(img.height, 'height'),
      }));

      // 7. Compute stock values (API-15)
      const { stockStatus, lowStockRemaining, maxPurchasableQuantity } =
        computeStockFields(row.stock_quantity);

      // 8. Map to ProductDetail DTO (§4.3, API-16, API-19, API-64)
      const product = {
        id: row.id,
        slug: row.slug,
        name: row.name,
        summary: row.summary,
        description: row.description,
        priceMinor: toSafeMinor(row.price_minor, 'priceMinor'),
        currency: 'INR',
        category: {
          slug: row.category_slug,
          name: row.category_name,
        },
        image: images.length > 0 ? images[0] : null,
        images,
        specs: Array.isArray(row.specs) ? row.specs : [],
        stockStatus,
        maxPurchasableQuantity,
        lowStockRemaining,
        createdAt: row.created_at.toISOString(),
      };

      return res.status(200).json({ product });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

