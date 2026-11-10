/**
 * src/lib/tokens.js
 *
 * Session token generation, hashing, and format validation (§6.1, SEC-01, UT-03).
 *
 * Enforces:
 * - 43-character base64url tokens derived from 32 bytes of cryptographic randomness.
 * - Deterministic SHA-256 digest hashing into 32-byte Buffer (for database bytea).
 * - Exact token format validation (^[A-Za-z0-9_-]{43}$).
 */

import crypto from 'node:crypto';

const TOKEN_FORMAT_REGEX = /^[A-Za-z0-9_-]{43}$/;

/**
 * Generate a new random session token.
 * 32 bytes encoded as base64url yields exactly 43 characters without padding.
 *
 * @returns {string} 43-character base64url string.
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Compute the SHA-256 digest of a raw session token.
 *
 * @param {string} token
 * @returns {Buffer} 32-byte SHA-256 digest Buffer for bytea storage.
 */
export function hashSessionToken(token) {
  if (typeof token !== 'string') {
    throw new TypeError('Session token must be a string.');
  }
  return crypto.createHash('sha256').update(token).digest();
}

/**
 * Check whether a string matches the required session token format.
 *
 * @param {unknown} token
 * @returns {boolean}
 */
export function isValidTokenFormat(token) {
  if (typeof token !== 'string') {
    return false;
  }
  return TOKEN_FORMAT_REGEX.test(token);
}

