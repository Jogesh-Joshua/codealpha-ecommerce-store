/**
 * src/routes/health.js
 *
 * Health check endpoints (§4.4, API-01, API-02).
 */

import { Router } from 'express';

/**
 * Creates health router.
 *
 * @param {object} options
 * @param {import('pg').Pool} [options.pool]
 * @returns {import('express').Router}
 */
export function createHealthRouter({ pool } = {}) {
  const router = Router();

  router.get('/health', async (req, res, next) => {
    // Check for duplicate query parameters (Contract 4.1)
    if (Array.isArray(req.query.deep)) {
      res.locals.errorCode = 'VALIDATION_ERROR';
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query parameter "deep" cannot be repeated.',
          fields: { deep: 'Parameter cannot be repeated.' },
          requestId: req.id,
        },
      });
    }

    const isDeep = req.query.deep === '1';

    if (!isDeep) {
      return res.status(200).json({ status: 'ok' });
    }

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
      await pool.query('SELECT 1');
      return res.status(200).json({ status: 'ok', database: 'up' });
    } catch {
      res.locals.errorCode = 'SERVICE_UNAVAILABLE';
      return res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable. Please try again later.',
          requestId: req.id,
        },
      });
    }
  });

  return router;
}

