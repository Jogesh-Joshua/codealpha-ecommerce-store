/**
 * Deskline — Minor paise currency formatter (Phase 7 / E0)
 *
 * Prices arrive from the API as integer minor units (paise).
 * The browser formats them with one shared function that divides by 100
 * and calls Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).
 * Every price in the catalogue and the shipping fee is a whole number of rupees,
 * so paise are never shown and nothing is rounded.
 */

const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

/**
 * Formats an amount in paise to a whole-rupee INR string (e.g. 149900 -> ₹1,499).
 *
 * @param {number|string} minor - Amount in paise (non-negative integer)
 * @returns {string} Formatted INR currency string
 * @throws {TypeError} If minor is not a non-negative safe integer
 */
export function formatMinor(minor) {
  if (minor === null || minor === undefined) {
    throw new TypeError('Invalid minor currency value: value cannot be null or undefined');
  }

  if (typeof minor !== 'number' && typeof minor !== 'string') {
    throw new TypeError('Invalid minor currency value: must be a number or string');
  }

  if (typeof minor === 'string') {
    if (!/^(0|[1-9]\d*)$/.test(minor.trim())) {
      throw new TypeError('Invalid minor currency value: must be a non-negative safe integer');
    }
  }

  const num = Number(minor);

  if (!Number.isFinite(num) || !Number.isSafeInteger(num) || num < 0) {
    throw new TypeError('Invalid minor currency value: must be a non-negative safe integer');
  }

  const rupees = Math.floor(num / 100);
  return formatter.format(rupees);
}
