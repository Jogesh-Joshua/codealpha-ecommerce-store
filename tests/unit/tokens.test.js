/**
 * tests/unit/tokens.test.js
 *
 * UT-03: tokens unit tests (§6.1, SEC-01, UT-03).
 *
 * Must verify:
 * - 43-character base64url tokens matching ^[A-Za-z0-9_-]{43}$.
 * - 1,000 generated tokens are all unique.
 * - Digest is deterministic 32-byte SHA-256 of the token.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  generateSessionToken,
  hashSessionToken,
  isValidTokenFormat,
} from '../../src/lib/tokens.js';

describe('UT-03: lib/tokens.js', () => {
  it('generates 43-character base64url tokens', () => {
    const token = generateSessionToken();
    assert.equal(typeof token, 'string');
    assert.equal(token.length, 43);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(isValidTokenFormat(token), true);
  });

  it('1,000 generated tokens are all distinct and strictly formatted', () => {
    const count = 1000;
    const tokens = new Set();

    for (let i = 0; i < count; i++) {
      const token = generateSessionToken();
      assert.equal(token.length, 43);
      assert.equal(isValidTokenFormat(token), true);
      tokens.add(token);
    }

    assert.equal(tokens.size, count);
  });

  it('hashSessionToken computes deterministic 32-byte SHA-256 Buffer digest', () => {
    const token = generateSessionToken();
    const digest1 = hashSessionToken(token);
    const digest2 = hashSessionToken(token);

    assert.ok(Buffer.isBuffer(digest1));
    assert.equal(digest1.length, 32);
    assert.deepEqual(digest1, digest2);

    // Verify against direct crypto computation
    const expected = crypto.createHash('sha256').update(token).digest();
    assert.deepEqual(digest1, expected);
  });

  it('isValidTokenFormat properly validates formats and rejects invalid inputs', () => {
    assert.equal(isValidTokenFormat(''), false);
    assert.equal(isValidTokenFormat(null), false);
    assert.equal(isValidTokenFormat(undefined), false);
    assert.equal(isValidTokenFormat(12345), false);
    assert.equal(isValidTokenFormat('a'.repeat(42)), false); // 42 chars
    assert.equal(isValidTokenFormat('a'.repeat(44)), false); // 44 chars
    assert.equal(isValidTokenFormat('a'.repeat(42) + '+'), false); // '+' not base64url
    assert.equal(isValidTokenFormat('a'.repeat(42) + '/'), false); // '/' not base64url
    assert.equal(isValidTokenFormat('a'.repeat(42) + '='), false); // '=' not base64url
    assert.equal(isValidTokenFormat('A'.repeat(43)), true);
    assert.equal(isValidTokenFormat('0'.repeat(43)), true);
    assert.equal(isValidTokenFormat('-_'.repeat(21) + 'a'), true);
  });
});

