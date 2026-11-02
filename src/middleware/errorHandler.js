/**
 * src/middleware/errorHandler.js
 *
 * Centralized error handler and 404 handlers (§4.2, §6.8, SEC-38, SECT-10, DEP-06).
 */

import { renderNotFoundPage } from '../views/notFoundPage.js';

/**
 * Handle 404 Not Found for unmatched routes.
 */
export function notFoundHandler() {
  return function notFound(req, res) {
    const isApi = req.originalUrl.startsWith('/api/') || req.originalUrl === '/api' || req.path.startsWith('/api');

    if (isApi) {
      res.locals.errorCode = 'ROUTE_NOT_FOUND';
      return res.status(404).json({
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: 'The requested API route was not found.',
          requestId: req.id,
        },
      });
    }

    res.status(404).type('html').send(renderNotFoundPage({ requestId: req.id }));
  };
}

/**
 * Centralized error handling middleware.
 */
export function errorHandler() {
  // eslint-disable-next-line no-unused-vars
  return function handleError(err, req, res, next) {
    const isApi = req.originalUrl.startsWith('/api/') || req.originalUrl === '/api' || req.path.startsWith('/api');

    // 1. Body-parser size limit exceeded (413)
    if (err.type === 'entity.too.large' || err.status === 413) {
      res.locals.errorCode = 'PAYLOAD_TOO_LARGE';
      return res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload exceeds the 20 kB limit.',
          requestId: req.id,
        },
      });
    }

    // 2. Body-parser malformed JSON (400)
    if (err instanceof SyntaxError && (err.status === 400 || err.type === 'entity.parse.failed') && 'body' in err) {
      res.locals.errorCode = 'INVALID_JSON';
      return res.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'The request body is not valid JSON.',
          requestId: req.id,
        },
      });
    }

    // Determine status code
    let status = err.status || err.statusCode || 500;
    if (status < 400 || status > 599) {
      status = 500;
    }

    let code = err.code;
    let message = err.message;
    const fields = err.fields;
    const details = err.details;

    // Sanitize 500 and 503 errors (SEC-38, SECT-10)
    if (status === 500 || code === 'INVALID_MONEY_VALUE' || code === 'INVALID_COUNT_VALUE') {
      status = 500;
      code = 'INTERNAL_ERROR';
      message = 'An unexpected error occurred. Please try again later.';
    } else if (status === 503 || code === 'SERVICE_UNAVAILABLE') {
      status = 503;
      code = 'SERVICE_UNAVAILABLE';
      message = 'Service temporarily unavailable. Please try again later.';
    }

    if (!code) {
      code = status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
    }

    res.locals.errorCode = code;

    if (isApi) {
      const errorObj = {
        code,
        message,
        requestId: req.id,
      };

      if (fields && typeof fields === 'object') {
        errorObj.fields = fields;
      }
      if (details && typeof details === 'object') {
        errorObj.details = details;
      }

      return res.status(status).json({ error: errorObj });
    }

    // Non-API internal error
    res.status(status).type('html').send(renderNotFoundPage({ requestId: req.id }));
  };
}

