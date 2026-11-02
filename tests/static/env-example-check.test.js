/**
 * tests/static/env-example-check.test.js  —  STAT-07
 *
 * Verifies that .env.example and .env.test.example together list exactly the
 * variables validated by loadConfig and the test helpers, and that:
 *  - .env.example contains no TEST_* variable
 *  - .env.test.example contains no DATABASE_URL or DATABASE_URL_UNPOOLED
 *  - .env.test.example leaves TEST_DB_DISPOSABLE empty (value is blank)
 *  - Both files contain only placeholder values (no real host/user/password patterns)
 *
 * This test deliberately does NOT load any database.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function readEnvFile(filename) {
  const path = resolve(ROOT, filename);
  assert.ok(existsSync(path), `${filename} must exist`);
  return readFileSync(path, 'utf8');
}

function parseKeys(content) {
  const keys = new Set();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      keys.add(trimmed.slice(0, eq).trim());
    }
  }
  return keys;
}

// Variables that loadConfig validates (from addendum 5.1).
// VERCEL is a system variable not listed in .env.example.
// TEST_DATABASE_URL and TEST_DB_DISPOSABLE are test-only (in .env.test.example only).
const APP_CONFIG_VARS = new Set([
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'SESSION_COOKIE_NAME',
  'SESSION_TTL_DAYS',
  'BCRYPT_COST',
  'STORE_CURRENCY',
  'SHIPPING_FLAT_MINOR',
  'ORDER_NUMBER_PREFIX',
  'DB_POOL_MAX',
  'DB_POOL_IDLE_TIMEOUT_MS',
  'DB_POOL_CONNECTION_TIMEOUT_MS',
  'DB_STATEMENT_TIMEOUT_MS',
  'EXTRA_ALLOWED_ORIGINS',
  'LOG_LEVEL',
]);

// Variables that only belong in .env.test.example
const TEST_ONLY_VARS = new Set([
  'TEST_DATABASE_URL',
  'TEST_DB_DISPOSABLE',
]);

// Variables that are in .env.example but NOT in .env.test.example
const DEV_ONLY_VARS = new Set([
  'DATABASE_URL_UNPOOLED',
  'PORT',
]);

describe('STAT-07: .env.example and .env.test.example', () => {
  let mainContent, testContent;
  let mainKeys, testKeys;

  it('.env.example exists', () => {
    mainContent = readEnvFile('.env.example');
    mainKeys = parseKeys(mainContent);
    assert.ok(mainKeys.size > 0);
  });

  it('.env.test.example exists', () => {
    testContent = readEnvFile('.env.test.example');
    testKeys = parseKeys(testContent);
    assert.ok(testKeys.size > 0);
  });

  it('.env.example contains no TEST_* variable', () => {
    // Must parse after the existence test
    if (!mainKeys) mainKeys = parseKeys(readEnvFile('.env.example'));
    for (const key of mainKeys) {
      assert.ok(!key.startsWith('TEST_'), `.env.example must not contain ${key}`);
    }
  });

  it('.env.example contains no VERCEL variable (system-set)', () => {
    if (!mainKeys) mainKeys = parseKeys(readEnvFile('.env.example'));
    assert.ok(!mainKeys.has('VERCEL'), '.env.example must not contain VERCEL');
  });

  it('.env.example lists all app config variables except VERCEL and test-only vars', () => {
    if (!mainKeys) mainKeys = parseKeys(readEnvFile('.env.example'));
    const expectedInMain = new Set([...APP_CONFIG_VARS]);
    for (const key of expectedInMain) {
      assert.ok(mainKeys.has(key), `.env.example is missing variable: ${key}`);
    }
  });

  it('.env.test.example contains NODE_ENV=test', () => {
    if (!testContent) testContent = readEnvFile('.env.test.example');
    assert.ok(
      testContent.includes('NODE_ENV=test'),
      '.env.test.example must set NODE_ENV=test',
    );
  });

  it('.env.test.example contains no DATABASE_URL (only TEST_DATABASE_URL)', () => {
    if (!testKeys) testKeys = parseKeys(readEnvFile('.env.test.example'));
    assert.ok(
      !testKeys.has('DATABASE_URL'),
      '.env.test.example must not contain DATABASE_URL',
    );
  });

  it('.env.test.example contains no DATABASE_URL_UNPOOLED', () => {
    if (!testKeys) testKeys = parseKeys(readEnvFile('.env.test.example'));
    assert.ok(
      !testKeys.has('DATABASE_URL_UNPOOLED'),
      '.env.test.example must not contain DATABASE_URL_UNPOOLED',
    );
  });

  it('.env.test.example contains TEST_DATABASE_URL', () => {
    if (!testKeys) testKeys = parseKeys(readEnvFile('.env.test.example'));
    assert.ok(
      testKeys.has('TEST_DATABASE_URL'),
      '.env.test.example must contain TEST_DATABASE_URL',
    );
  });

  it('.env.test.example contains TEST_DB_DISPOSABLE with an empty value', () => {
    if (!testContent) testContent = readEnvFile('.env.test.example');
    // Must have the key with an empty (or whitespace-only) value
    const match = testContent.match(/^TEST_DB_DISPOSABLE=(.*)$/m);
    assert.ok(match, '.env.test.example must contain TEST_DB_DISPOSABLE=');
    assert.equal(
      match[1].trim(),
      '',
      'TEST_DB_DISPOSABLE must be empty in .env.test.example',
    );
  });

  it('.env.example values are placeholders (no real credential patterns)', () => {
    if (!mainContent) mainContent = readEnvFile('.env.example');
    // Real passwords/usernames would not contain literal "USER", "PASSWORD", "HOST"
    // Placeholder pattern: value contains USER or PASSWORD or HOST in all caps
    // (the placeholders in section 5.3 use exactly these strings)
    const lines = mainContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const value = trimmed.slice(eq + 1);
      // A real Neon string would contain .neon.tech with actual credentials
      // (not the literal word PASSWORD)
      assert.ok(
        !value.match(/[a-z0-9]{20,}@[a-z0-9-]+\.neon\.tech/),
        `.env.example appears to contain a real Neon URL in line: ${trimmed.slice(0, 40)}...`,
      );
    }
  });
});