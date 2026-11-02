/**
 * src/middleware/logging.js
 *
 * Structured JSON logging middleware (§6.8, SEC-39).
 *
 * Log entries contain: requestId, method, path (no query string), status,
 * durationMs, userId (when known), and errorCode (when applicable).
 *
 * Never logs bodies, headers, cookies, passwords, tokens, or query strings.
 */

export function loggingMiddleware({ logSink } = {}) {
  const writeLog = typeof logSink === 'function'
    ? logSink
    : (entry) => {
        const line = JSON.stringify(entry);
        if (entry.status >= 500) {
          console.error(line);
        } else if (entry.status >= 400) {
          console.warn(line);
        } else {
          console.log(line);
        }
      };

  return function requestLogger(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const cleanPath = (req.originalUrl || req.url || '').split('?')[0];

      const entry = {
        requestId: req.id,
        method: req.method,
        path: cleanPath,
        status: res.statusCode,
        durationMs,
      };

      if (req.user && req.user.id) {
        entry.userId = req.user.id;
      }
      if (res.locals && res.locals.errorCode) {
        entry.errorCode = res.locals.errorCode;
      }

      writeLog(entry);
    });

    next();
  };
}

