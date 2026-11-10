/**
 * src/createApp.js
 *
 * Express 5 application factory (§10 Phase 2, DR-08).
 *
 * Configures request IDs, structured logging, helmet security headers,
 * origin guards, body parsers, health routes, and error handling.
 *
 * Does NOT use static file middleware from Express (STAT-08).
 * Does NOT read process.env (loadConfig injects validated config).
 */

import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from './middleware/requestId.js';
import { loggingMiddleware } from './middleware/logging.js';
import { originGuardMiddleware } from './middleware/originGuard.js';
import { sessionLoaderMiddleware } from './middleware/session.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { createHealthRouter } from './routes/health.js';
import { createCategoriesRouter } from './routes/categories.js';
import { createProductsRouter } from './routes/products.js';
import { createAuthRouter } from './routes/auth.js';
import { createCartRouter } from './routes/cart.js';
import { createOrdersRouter } from './routes/orders.js';
import { createStaticAssetsMiddleware } from './middleware/staticAssets.js';

/**
 * Build and return the configured Express application.
 *
 * @param {object} options
 * @param {import('./config.js').AppConfig} options.config
 * @param {Function} [options.logSink]
 * @param {import('pg').Pool} [options.pool]
 * @param {Function} [options.configureRoutes] Optional callback to mount routes before 404 handlers.
 * @param {string} [options.publicDir] Optional path to public directory for static asset serving.
 * @returns {import('express').Express}
 */
export function createApp({ config, logSink, pool, configureRoutes, publicDir } = {}) {
  if (!config) {
    throw new Error('createApp: config is required');
  }

  const app = express();

  // 1. Core Express settings
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // 2. Request ID & Structured JSON logger
  app.use(requestIdMiddleware());
  app.use(loggingMiddleware({ logSink }));

  // 3. Security headers (helmet)
  app.use(helmet());

  // 4. Default API Cache-Control (Contract 4.1)
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // 5. Origin & CSRF guard before body parsing
  app.use('/api', originGuardMiddleware({ config }));

  // 6. Cookie parser on /api (§6.1)
  app.use('/api', cookieParser());

  // 7. JSON body parsing with strict 20 kB limit
  app.use('/api', express.json({ limit: config.bodyLimitBytes || 20480 }));

  // 8. Session loader middleware (§6.1)
  if (pool) {
    app.use('/api', sessionLoaderMiddleware({ config, pool }));
  }

  // 9. Core routes
  app.use('/api', createHealthRouter({ pool }));
  app.use('/api', createCategoriesRouter({ pool }));
  app.use('/api', createProductsRouter({ pool }));
  if (pool) {
    app.use('/api', createAuthRouter({ config, pool, logSink }));
    app.use('/api', createCartRouter({ config, pool, logSink }));
    app.use('/api', createOrdersRouter({ config, pool, logSink }));
  }

  // Optional custom/extra route configuration before static & 404 handlers
  if (typeof configureRoutes === 'function') {
    configureRoutes(app);
  }

  // 8. Storefront & Static asset serving before 404 handler (§9.2, DR-08)
  app.use(createStaticAssetsMiddleware({ publicDir }));

  // 9. 404 Handler (JSON for /api/*, HTML for non-API)
  app.use(notFoundHandler());

  // 10. Centralized Error Handler
  app.use(errorHandler());

  return app;
}
