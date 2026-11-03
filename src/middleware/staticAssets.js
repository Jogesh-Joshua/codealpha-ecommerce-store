/**
 * src/middleware/staticAssets.js
 *
 * Storefront and static asset middleware (§9.2, DR-08).
 * Serves static files and clean-URL HTML pages from public/ before 404 handlers.
 * Uses portable absolute filesystem paths.
 * Does NOT use Express built-in static handler (STAT-08).
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PUBLIC_DIR = path.resolve(__dirname, '../../public');

/**
 * Creates static assets middleware for Express.
 *
 * @param {object} [options]
 * @param {string} [options.publicDir]
 * @returns {import('express').RequestHandler}
 */
export function createStaticAssetsMiddleware({ publicDir = DEFAULT_PUBLIC_DIR } = {}) {
  const resolvedPublicDir = path.resolve(publicDir);

  return function staticAssetsMiddleware(req, res, next) {
    // Only handle GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    // Never handle API routes
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      return next();
    }

    let relativePath = req.path;
    if (relativePath === '' || relativePath === '/') {
      relativePath = '/index.html';
    }

    const candidates = [];

    // 1. Direct path as requested (e.g., /css/tokens.css, /index.html, /favicon.ico)
    candidates.push(relativePath);

    // 2. Clean URL fallback (e.g., /shop -> /shop.html)
    if (!path.extname(relativePath)) {
      candidates.push(`${relativePath}.html`);
      candidates.push(path.join(relativePath, 'index.html'));
    }

    for (const cand of candidates) {
      // Normalize and guard against directory traversal
      const safeRelative = path.normalize(cand).replace(/^(\.\.[\/\\])+/, '');
      const absolutePath = path.resolve(resolvedPublicDir, '.' + safeRelative);

      // Verify absolute path resides within public directory
      if (
        !absolutePath.startsWith(resolvedPublicDir + path.sep) &&
        absolutePath !== resolvedPublicDir
      ) {
        continue;
      }

      try {
        const stat = fs.statSync(absolutePath);
        if (stat.isFile()) {
          // Set cache headers per SEC-32
          if (cand.startsWith('/fonts/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (
            cand.startsWith('/css/') ||
            cand.startsWith('/js/') ||
            cand.startsWith('/images/') ||
            cand.startsWith('/icons/') ||
            cand === '/favicon.ico' ||
            cand === '/favicon.svg'
          ) {
            res.setHeader(
              'Cache-Control',
              'public, max-age=86400, stale-while-revalidate=604800',
            );
          }

          return res.sendFile(absolutePath, (err) => {
            if (err && !res.headersSent) {
              next(err);
            }
          });
        }
      } catch {
        // File does not exist on disk, check next candidate
      }
    }

    // No static asset found; continue down middleware chain
    next();
  };
}
