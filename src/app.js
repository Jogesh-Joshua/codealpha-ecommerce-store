/**
 * src/app.js
 *
 * Production and Vercel serverless entry point (DR-08).
 * Default-exports the configured Express application.
 */

import express from 'express';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createApp } from './createApp.js';

const config = loadConfig();
const pool = createPool({ config });
const app = createApp({ config, pool });

export default app;

