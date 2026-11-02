/**
 * src/middleware/originGuard.js
 *
 * Origin and CSRF protection middleware (§6.3, SEC-13, SEC-14).
 *
 * Mounted on every state-changing method (POST, PUT, PATCH, DELETE) under /api
 * before body parsing.
 */

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Creates origin guard middleware.
 *
 * @param {object} options
 * @param {import('../config.js').AppConfig} options.config
 * @returns {import('express').RequestHandler}
 */
export function originGuardMiddleware({ config }) {
  if (!config) {
    throw new Error('originGuardMiddleware: config is required');
  }

  const extraOrigins = new Set(config.extraAllowedOrigins || []);
  const isProduction = Boolean(config.isProduction);

  return function originGuard(req, res, next) {
    if (!STATE_CHANGING_METHODS.has(req.method)) {
      return next();
    }

    const origin = req.get('origin');
    const secFetchSite = req.get('sec-fetch-site');

    // 1. Compute own origin using req.protocol (honours trust proxy) and req.get('host').
    const host = req.get('host');
    const ownOrigin = `${req.protocol}://${host}`;

    // 2. If Origin header is present:
    if (origin !== undefined) {
      if (origin === 'null' || (origin !== ownOrigin && !extraOrigins.has(origin))) {
        res.locals.errorCode = 'FORBIDDEN_ORIGIN';
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN_ORIGIN',
            message: 'Cross-origin requests are forbidden.',
            requestId: req.id,
          },
        });
      }
    } else if (secFetchSite !== undefined) {
      // 3. If Origin is absent, inspect Sec-Fetch-Site:
      if (secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
        res.locals.errorCode = 'FORBIDDEN_ORIGIN';
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN_ORIGIN',
            message: 'Cross-origin requests are forbidden.',
            requestId: req.id,
          },
        });
      }
    } else {
      // 4. If both headers are absent:
      if (isProduction) {
        res.locals.errorCode = 'FORBIDDEN_ORIGIN';
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN_ORIGIN',
            message: 'Cross-origin requests are forbidden.',
            requestId: req.id,
          },
        });
      }
    }

    // 5. If request carries a body, enforce Content-Type: application/json.
    const contentLength = req.get('content-length');
    const transferEncoding = req.get('transfer-encoding');
    const hasBody = (contentLength !== undefined && contentLength !== '0') || transferEncoding !== undefined;

    if (hasBody) {
      const contentType = req.get('content-type') || '';
      const isJson = contentType === 'application/json' || contentType.startsWith('application/json;');
      if (!isJson) {
        res.locals.errorCode = 'UNSUPPORTED_MEDIA_TYPE';
        return res.status(415).json({
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Content-Type must be application/json.',
            requestId: req.id,
          },
        });
      }
    }

    next();
  };
}

