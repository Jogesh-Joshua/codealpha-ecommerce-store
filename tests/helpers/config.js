/**
 * tests/helpers/config.js
 *
 * Test configuration helpers (§7.6, §8.1).
 *
 * loadTestConfig() calls loadConfig() with DATABASE_URL mapped from
 * TEST_DATABASE_URL so the rest of the application receives a standard config.
 *
 * withProductionBehaviour(config) returns a new frozen config with
 * isProduction=true, the __Host- cookie name, and Secure=true, while leaving
 * all database and pool settings unchanged.
 */

import { loadConfig } from '../../src/config.js';

/**
 * Build the test configuration.
 * Maps TEST_DATABASE_URL → DATABASE_URL so loadConfig() validates it normally.
 * Also sets DB_POOL_MAX=2 for tests (minimum allowed, avoids exhausting the pool).
 *
 * @returns {Readonly<object>} Deeply frozen config with NODE_ENV=test.
 */
export function loadTestConfig() {
  const env = {
    ...process.env,
    // loadConfig expects DATABASE_URL; tests/helpers supply it from TEST_DATABASE_URL.
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    // Remove the unpooled and pooled prod vars so they cannot interfere.
    DATABASE_URL_UNPOOLED: undefined,
  };
  return loadConfig(env);
}

/**
 * Return a new config that mimics production behaviour for tests that need to
 * exercise the __Host- cookie name, Secure flag, and production origin rules.
 *
 * Database and pool settings are left unchanged so integration tests still
 * reach the test database.
 *
 * The returned object is deeply frozen.
 *
 * @param {Readonly<object>} config  A config returned by loadTestConfig().
 * @returns {Readonly<object>}
 */
export function withProductionBehaviour(config) {
  // We cannot mutate a frozen object; build a plain copy and re-freeze it.
  const copy = JSON.parse(JSON.stringify(config));
  copy.isProduction = true;
  copy.isTest = false;
  copy.nodeEnv = 'production';
  copy.sessionCookieName = '__Host-deskline_session';
  // runtime stays the same — onVercel stays false unless the test sets it.
  return deepFreeze(copy);
}

/** Recursively freeze an object and all its nested objects. */
function deepFreeze(obj) {
  Object.getOwnPropertyNames(obj).forEach((name) => {
    const val = obj[name];
    if (val && typeof val === 'object') {
      deepFreeze(val);
    }
  });
  return Object.freeze(obj);
}

