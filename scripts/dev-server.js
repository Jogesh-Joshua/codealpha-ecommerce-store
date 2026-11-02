/**
 * scripts/dev-server.js
 *
 * Local development server (§7.2, §10 Phase 2).
 *
 * Loaded via: node --env-file=.env --watch scripts/dev-server.js
 */

import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { createApp } from '../src/createApp.js';

const config = loadConfig();
const pool = createPool({ config });
const app = createApp({ config, pool });

const server = app.listen(config.port, () => {
  console.log(`dev-server: listening at http://localhost:${config.port}`);
});

function handleShutdown(signal) {
  console.log(`dev-server: received ${signal}, closing gracefully...`);
  server.close(async () => {
    try {
      await pool.end();
      console.log('dev-server: pool closed, exiting');
      process.exit(0);
    } catch (err) {
      console.error('dev-server: error closing pool:', err.message);
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

