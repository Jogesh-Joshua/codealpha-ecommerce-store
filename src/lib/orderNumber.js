/**
 * src/lib/orderNumber.js
 *
 * Sequence-based order number generator (§4.9 step 9, UT-08, DB-10).
 *
 * Pattern: ^[A-Z]{2,4}-[0-9]{6,}$
 * Example: DL-100001
 *
 * Never uses timestamps or random values as substitutes for the database sequence.
 */

export const ORDER_NUMBER_REGEX = /^[A-Z]{2,4}-[0-9]{6,}$/;

/**
 * Format a prefix and sequence value into the standard order number string.
 *
 * @param {string} prefix 2 to 4 uppercase ASCII characters (e.g., 'DL')
 * @param {number|string} seq Positive integer sequence value
 * @returns {string}
 */
export function formatOrderNumber(prefix, seq) {
  const cleanPrefix = String(prefix || '').trim().toUpperCase();
  if (!/^[A-Z]{2,4}$/.test(cleanPrefix)) {
    throw new Error(`Invalid order number prefix: "${prefix}". Must be 2 to 4 uppercase letters.`);
  }

  const num = Number(seq);
  if (!Number.isSafeInteger(num) || num < 1) {
    throw new Error(`Invalid order sequence value: "${seq}". Must be a positive integer.`);
  }

  const seqStr = String(num).padStart(6, '0');
  const orderNumber = `${cleanPrefix}-${seqStr}`;

  if (!ORDER_NUMBER_REGEX.test(orderNumber)) {
    throw new Error(`Generated order number "${orderNumber}" failed contract format validation.`);
  }

  return orderNumber;
}

/**
 * Generate the next sequential order number using PostgreSQL order_number_seq.
 *
 * @param {import('pg').PoolClient|import('pg').Pool} db
 * @param {string} prefix
 * @returns {Promise<string>}
 */
export async function generateOrderNumber(db, prefix = 'DL') {
  const result = await db.query("SELECT nextval('order_number_seq') AS seq");
  const seq = Number(result.rows[0].seq);
  return formatOrderNumber(prefix, seq);
}

