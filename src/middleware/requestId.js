/**
 * src/middleware/requestId.js
 *
 * Assigns a unique UUID to every incoming request.
 */

import { randomUUID } from 'node:crypto';

export function requestIdMiddleware() {
  return function requestId(req, res, next) {
    const id = randomUUID();
    req.id = id;
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  };
}

