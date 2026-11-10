/**
 * src/routes/orders.js
 *
 * Order creation and reading routes (§4.8, §4.9, §4A.1, API-44 to API-66).
 *
 * Endpoints:
 * - POST /api/orders      Create new order or replay existing (requires auth, Idempotency-Key header).
 * - GET  /api/orders      List orders for current user with pagination (requires auth).
 * - GET  /api/orders/:id  Get order detail by ID for current user (requires auth).
 */

import { Router } from 'express';
import { createOrder, getOrderList, getOrderDetailById } from '../services/orderService.js';

/**
 * Factory for order routes.
 *
 * @param {object} options
 * @param {import('../config.js').AppConfig} options.config
 * @param {import('pg').Pool} options.pool
 * @param {Function} [options.logSink]
 * @returns {Router}
 */
export function createOrdersRouter({ config, pool, logSink }) {
  if (!config) throw new Error('createOrdersRouter: config is required');
  if (!pool) throw new Error('createOrdersRouter: pool is required');

  const router = Router();

  // Enforce session authentication on all /api/orders routes (API-44, API-63)
  router.use('/orders', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');

    if (!req.user) {
      res.locals.errorCode = 'UNAUTHENTICATED';
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required.',
          requestId: req.id,
        },
      });
    }

    next();
  });

  /**
   * POST /api/orders
   * Create new order or return idempotent replay.
   */
  router.post('/orders', async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'];

    try {
      const result = await createOrder({
        config,
        pool,
        userId: req.user.id,
        idempotencyKey,
        body: req.body,
      });

      if (result.isReplay) {
        res.setHeader('Idempotent-Replay', 'true');
        return res.status(200).json({ order: result.order });
      }

      return res.status(201).json({ order: result.order });
    } catch (err) {
      if ((err.status === 429 || err.code === 'RATE_LIMITED') && err.retryAfter) {
        res.setHeader('Retry-After', String(err.retryAfter));
      }
      throw err;
    }
  });

  /**
   * GET /api/orders
   * List paginated orders for the authenticated user.
   */
  router.get('/orders', async (req, res) => {
    const result = await getOrderList(pool, req.user.id, req.query);
    return res.status(200).json(result);
  });

  /**
   * GET /api/orders/:id
   * Fetch single order detail by UUID for the authenticated user.
   */
  router.get('/orders/:id', async (req, res) => {
    const order = await getOrderDetailById(pool, req.params.id, req.user.id);
    return res.status(200).json({ order });
  });

  return router;
}
