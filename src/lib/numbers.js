/**
 * src/lib/numbers.js
 *
 * Numerical boundary serialisation helpers (§4A.2, DR-21).
 *
 * PostgreSQL returns int8 (bigint) and numeric values as strings.
 * These helpers safely convert validated database values to JavaScript numbers
 * at the service-to-response boundary.
 *
 * Global type parser overrides are strictly prohibited.
 */

const DIGITS_ONLY = /^(0|[1-9][0-9]*)$/;

/**
 * Validate and convert a minor-currency value (paise) to a safe JavaScript integer.
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {number}
 */
export function toSafeMinor(value, fieldName) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0 && Object.is(value, Math.trunc(value))) {
      return value;
    }
  } else if (typeof value === 'string') {
    if (DIGITS_ONLY.test(value)) {
      const num = Number(value);
      if (Number.isSafeInteger(num) && num >= 0) {
        return num;
      }
    }
  }

  const err = new Error(`Invalid money value for field "${fieldName}"`);
  err.code = 'INVALID_MONEY_VALUE';
  throw err;
}

/**
 * Validate and convert a count or quantity value to a safe JavaScript integer.
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {number}
 */
export function toSafeCount(value, fieldName) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0 && Object.is(value, Math.trunc(value))) {
      return value;
    }
  } else if (typeof value === 'string') {
    if (DIGITS_ONLY.test(value)) {
      const num = Number(value);
      if (Number.isSafeInteger(num) && num >= 0) {
        return num;
      }
    }
  }

  const err = new Error(`Invalid count value for field "${fieldName}"`);
  err.code = 'INVALID_COUNT_VALUE';
  throw err;
}
