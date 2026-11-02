/**
 * tests/helpers/server.js
 *
 * Test HTTP server helper (§8.1).
 *
 * Spins up an in-process HTTP server on an ephemeral port using Node's http.createServer,
 * providing a lightweight fetch client with cookie management and origin headers.
 */

import http from 'node:http';
import { createApp } from '../../src/createApp.js';
import { loadTestConfig } from './config.js';

/**
 * Creates and starts a test server on an ephemeral port.
 *
 * @param {object} [options]
 * @param {import('../../src/config.js').AppConfig} [options.config]
 * @param {import('pg').Pool} [options.pool]
 * @param {Function} [options.logSink]
 * @returns {Promise<{
 *   server: import('node:http').Server,
 *   url: string,
 *   close: () => Promise<void>,
 *   request: (path: string, init?: RequestInit) => Promise<Response>,
 *   jar: Map<string, string>
 * }>}
 */
export async function startTestServer(options = {}) {
  const config = options.config || loadTestConfig();
  const logSink = options.logSink || (() => {});
  const pool = options.pool;
  const configureRoutes = options.configureRoutes;

  const app = createApp({ config, logSink, pool, configureRoutes });
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const cookieJar = new Map();

  async function request(path, init = {}) {
    const fullUrl = path.startsWith('http') ? path : `${url}${path}`;
    const headers = new Headers(init.headers || {});

    // Attach stored cookies if Cookie header not explicitly set
    if (!headers.has('cookie') && cookieJar.size > 0) {
      const cookieStr = Array.from(cookieJar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      headers.set('cookie', cookieStr);
    }

    const response = await fetch(fullUrl, {
      ...init,
      headers,
    });

    // Capture set-cookie headers
    const setCookieHeaders = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const sc of setCookieHeaders) {
      const match = sc.match(/^([^=]+)=([^;]+)/);
      if (match) {
        const [, name, val] = match;
        if (sc.includes('Max-Age=0') || sc.includes('expires=Thu, 01 Jan 1970')) {
          cookieJar.delete(name);
        } else {
          cookieJar.set(name, val);
        }
      }
    }

    return response;
  }

  function close() {
    return new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  return {
    server,
    url,
    close,
    request,
    jar: cookieJar,
    config,
  };
}
