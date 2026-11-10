/**
 * tests/unit/passwords.test.js
 *
 * UT-02: passwords unit tests (§6.2, SEC-08 to SEC-10, UT-02, SECT-16).
 *
 * Must verify:
 * - Hash differs from input and from a second hash of the same input.
 * - Verify true for matching password, false for incorrect password.
 * - Cost taken from config (or passed parameter).
 * - 73-byte (including multi-byte) password rejected.
 * - Dummy-hash path exists and produces constant-time verification.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  comparePassword,
  compareDummyPassword,
  DUMMY_PASSWORD_HASH,
} from '../../src/lib/passwords.js';

describe('UT-02: lib/passwords.js', () => {
  it('hash differs from plaintext input and starts with valid bcrypt prefix', async () => {
    const plaintext = 'SecretDesklinePass123';
    const hash = await hashPassword(plaintext, 10);

    assert.notEqual(hash, plaintext);
    assert.match(hash, /^\$2[aby]\$10\$/);
  });

  it('two hashes of the same password produce distinct salt/hash outputs', async () => {
    const password = 'ConsistentPassword!99';
    const hash1 = await hashPassword(password, 10);
    const hash2 = await hashPassword(password, 10);

    assert.notEqual(hash1, hash2);
  });

  it('comparePassword returns true for matching password, false for mismatch', async () => {
    const password = 'CorrectPassword#42';
    const wrongPassword = 'WrongPassword#42';
    const hash = await hashPassword(password, 10);

    const match = await comparePassword(password, hash);
    assert.equal(match, true);

    const mismatch = await comparePassword(wrongPassword, hash);
    assert.equal(mismatch, false);
  });

  it('respects the cost parameter passed to hashPassword', async () => {
    const hash10 = await hashPassword('TestCost10', 10);
    assert.match(hash10, /^\$2[aby]\$10\$/);

    const hash11 = await hashPassword('TestCost11', 11);
    assert.match(hash11, /^\$2[aby]\$11\$/);
  });

  it('rejects passwords over 72 UTF-8 bytes (ASCII and multi-byte)', async () => {
    // Exactly 72 ASCII bytes passes
    const pass72Ascii = 'a'.repeat(72);
    assert.equal(Buffer.byteLength(pass72Ascii, 'utf8'), 72);
    const hash72 = await hashPassword(pass72Ascii, 10);
    assert.ok(hash72);

    // 73 ASCII bytes fails
    const pass73Ascii = 'a'.repeat(73);
    assert.equal(Buffer.byteLength(pass73Ascii, 'utf8'), 73);
    await assert.rejects(
      async () => {
        await hashPassword(pass73Ascii, 10);
      },
      {
        message: 'Password must be 72 bytes or fewer.',
      }
    );

    // Multi-byte characters: Euro sign '€' is 3 UTF-8 bytes.
    // 24 * 3 = 72 bytes passes
    const pass72Multi = '€'.repeat(24);
    assert.equal(Buffer.byteLength(pass72Multi, 'utf8'), 72);
    const hashMulti = await hashPassword(pass72Multi, 10);
    assert.ok(hashMulti);

    // 24 * 3 + 1 = 73 bytes fails
    const pass73Multi = '€'.repeat(24) + 'a';
    assert.equal(Buffer.byteLength(pass73Multi, 'utf8'), 73);
    await assert.rejects(
      async () => {
        await hashPassword(pass73Multi, 10);
      },
      {
        message: 'Password must be 72 bytes or fewer.',
      }
    );
  });

  it('dummy-hash path exists and returns false without throwing', async () => {
    assert.ok(typeof DUMMY_PASSWORD_HASH === 'string');
    assert.match(DUMMY_PASSWORD_HASH, /^\$2[aby]\$1[0-4]\$/);

    const result = await compareDummyPassword('anyArbitraryPassword', 10);
    assert.equal(result, false);
  });
});

