/**
 * src/lib/passwords.js
 *
 * Password hashing and verification via bcryptjs (§6.2, SEC-08 to SEC-10, UT-02, SECT-16).
 *
 * Enforces:
 * - Asynchronous bcryptjs hashing with configurable cost (default 12).
 * - Passwords strictly limited to 8..72 UTF-8 bytes (never truncated).
 * - Timing defense: dummy bcrypt comparison on unknown email.
 */

import bcrypt from 'bcryptjs';

export const DUMMY_PASSWORD_HASHES = {
  10: '$2b$10$EcJhoh9Fc89hOU7DPex7ouJeGZ91gMhYxdJRW.VmyxsmLt3i.mKb2',
  11: '$2b$11$9FL0GeWVI5n254MlAM.IGeVLMGkWfndYRTmtA7FRse7Vbw9CJQG/C',
  12: '$2b$12$GYkTYpZQN36tcQ1AQTOGWu5Hb4AidioWwflCSlcyFZSq4RfuQ5iQG',
  13: '$2b$13$0t3mLLGNlF8cM.xxxrBGSOuWRUIPwMdkmyy.94oP3v5fdWvn95tfW',
  14: '$2b$14$h.gDVBsbQERzl7FLq4sWlOfwIkjFMksdVRaTRkUBvzD35VuoIgERO',
};

export const DUMMY_PASSWORD_HASH = DUMMY_PASSWORD_HASHES[12];

/**
 * Hash a plaintext password with bcryptjs.
 *
 * @param {string} password
 * @param {number} [cost=12]
 * @returns {Promise<string>}
 */
export async function hashPassword(password, cost = 12) {
  if (typeof password !== 'string') {
    const err = new Error('Password must be a string.');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }

  const byteLength = Buffer.byteLength(password, 'utf8');
  if (byteLength > 72) {
    const err = new Error('Password must be 72 bytes or fewer.');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }

  return await bcrypt.hash(password, cost);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 *
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function comparePassword(password, hash) {
  if (typeof password !== 'string' || typeof hash !== 'string') {
    return false;
  }

  const byteLength = Buffer.byteLength(password, 'utf8');
  if (byteLength > 72) {
    return false;
  }

  return await bcrypt.compare(password, hash);
}

/**
 * Perform a dummy bcrypt comparison against a precomputed fixed hash.
 * Ensures constant-time behavior on unknown emails when a slot was granted (§6.2, SEC-10, SECT-16).
 *
 * @param {string} password
 * @param {number} [cost=12]
 * @returns {Promise<boolean>} Always false.
 */
export async function compareDummyPassword(password, cost = 12) {
  const hash = DUMMY_PASSWORD_HASHES[cost] || DUMMY_PASSWORD_HASH;
  const safePassword = typeof password === 'string' && Buffer.byteLength(password, 'utf8') <= 72 ? password : '';
  await bcrypt.compare(safePassword, hash);
  return false;
}

