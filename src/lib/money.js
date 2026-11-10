/**
 * src/lib/money.js
 *
 * Safe integer paise arithmetic helpers (§4A.2, UT-01, DR-02).
 *
 * All money is integer INR paise.
 * Floats, negatives, NaN, and unsafe integers are rejected.
 * Floating-point arithmetic is strictly forbidden.
 */

/**
 * Assert that a value is a non-negative safe integer representing minor currency units (paise).
 *
 * @param {unknown} value
 * @param {string} [name='amount']
 * @returns {number}
 */
export function assertMinor(value, name = 'amount') {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Object.is(value, Math.trunc(value))
  ) {
    const err = new Error(`Invalid money value for field "${name}": must be a non-negative safe integer`);
    err.code = 'INVALID_MONEY_VALUE';
    throw err;
  }
  return value;
}

/**
 * Check whether a minor currency amount represents a whole rupee (multiple of 100 paise).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isWholeRupee(value) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Object.is(value, Math.trunc(value))
  ) {
    return false;
  }
  return value % 100 === 0;
}

/**
 * Assert that a minor currency amount is a valid whole rupee (multiple of 100 paise).
 *
 * @param {unknown} value
 * @param {string} [name='amount']
 * @returns {number}
 */
export function assertWholeRupee(value, name = 'amount') {
  assertMinor(value, name);
  if (value % 100 !== 0) {
    const err = new Error(`Money value for field "${name}" must be a whole-rupee amount (multiple of 100 paise)`);
    err.code = 'INVALID_MONEY_VALUE';
    throw err;
  }
  return value;
}

/**
 * Multiply unit price (in paise) by integer quantity safely.
 *
 * @param {number} unitPriceMinor
 * @param {number} quantity
 * @returns {number}
 */
export function mulMinor(unitPriceMinor, quantity) {
  assertMinor(unitPriceMinor, 'unitPriceMinor');
  if (
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    !Object.is(quantity, Math.trunc(quantity))
  ) {
    const err = new Error('Invalid quantity: must be a non-negative safe integer');
    err.code = 'INVALID_QUANTITY_VALUE';
    throw err;
  }

  const result = unitPriceMinor * quantity;
  if (!Number.isSafeInteger(result)) {
    const err = new Error('Multiplication overflow: resulting minor value exceeds safe integer limit');
    err.code = 'INVALID_MONEY_VALUE';
    throw err;
  }
  return result;
}

/**
 * Sum an array of minor currency values safely.
 *
 * @param {number[]} amounts
 * @returns {number}
 */
export function sumMinor(amounts) {
  if (!Array.isArray(amounts)) {
    const err = new Error('Amounts must be an array');
    err.code = 'INVALID_MONEY_VALUE';
    throw err;
  }

  let total = 0;
  for (let i = 0; i < amounts.length; i++) {
    const amt = assertMinor(amounts[i], `amounts[${i}]`);
    total += amt;
    if (!Number.isSafeInteger(total)) {
      const err = new Error('Sum overflow: resulting minor value exceeds safe integer limit');
      err.code = 'INVALID_MONEY_VALUE';
      throw err;
    }
  }
  return total;
}

/**
 * Calculate a single line total: unitPriceMinor * quantity.
 *
 * @param {number} unitPriceMinor
 * @param {number} quantity
 * @returns {number}
 */
export function calculateLineTotal(unitPriceMinor, quantity) {
  return mulMinor(unitPriceMinor, quantity);
}

/**
 * Calculate complete order totals: lines, subtotal, shipping, and total.
 *
 * @param {object} params
 * @param {Array<{ unitPriceMinor: number, quantity: number }>} params.items
 * @param {number} params.shippingMinor
 * @returns {{
 *   lines: number[],
 *   subtotalMinor: number,
 *   shippingMinor: number,
 *   totalMinor: number
 * }}
 */
export function calculateOrderTotals({ items, shippingMinor }) {
  assertMinor(shippingMinor, 'shippingMinor');

  if (!Array.isArray(items)) {
    const err = new Error('Items must be an array');
    err.code = 'INVALID_MONEY_VALUE';
    throw err;
  }

  const lines = items.map((item, idx) => {
    return mulMinor(item.unitPriceMinor, item.quantity);
  });

  const subtotalMinor = sumMinor(lines);
  const totalMinor = subtotalMinor + shippingMinor;
  if (!Number.isSafeInteger(totalMinor)) {
    const err = new Error('Total overflow: resulting order total exceeds safe integer limit');
    err.code = 'INVALID_MONEY_VALUE';
    throw err;
  }

  return {
    lines,
    subtotalMinor,
    shippingMinor,
    totalMinor,
  };
}

