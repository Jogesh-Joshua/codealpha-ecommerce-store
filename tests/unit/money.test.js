/**
 * tests/unit/money.test.js
 *
 * Unit tests for safe integer paise arithmetic (UT-01).
 *
 * Must verify:
 * - Integer-only arithmetic.
 * - Rejection of floats, negatives, NaN, non-numbers, and unsafe integers.
 * - Line total, subtotal, shipping, total calculations for known inputs.
 * - Whole-rupee check for configuration values.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMinor,
  isWholeRupee,
  assertWholeRupee,
  mulMinor,
  sumMinor,
  calculateLineTotal,
  calculateOrderTotals,
} from '../../src/lib/money.js';

describe('UT-01: lib/money.js', () => {
  describe('assertMinor', () => {
    it('accepts non-negative safe integers', () => {
      assert.equal(assertMinor(0), 0);
      assert.equal(assertMinor(100), 100);
      assert.equal(assertMinor(149900), 149900);
      assert.equal(assertMinor(9007199254740991), 9007199254740991);
    });

    it('rejects floating-point numbers', () => {
      assert.throws(() => assertMinor(1.5), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor(0.01), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor(99.99), { code: 'INVALID_MONEY_VALUE' });
    });

    it('rejects negative numbers', () => {
      assert.throws(() => assertMinor(-1), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor(-100), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor(-0.01), { code: 'INVALID_MONEY_VALUE' });
    });

    it('rejects NaN and Infinities', () => {
      assert.throws(() => assertMinor(NaN), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor(Infinity), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor(-Infinity), { code: 'INVALID_MONEY_VALUE' });
    });

    it('rejects non-numeric types', () => {
      assert.throws(() => assertMinor('100'), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor('0'), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor(null), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor(undefined), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor(true), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor({}), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertMinor([]), { code: 'INVALID_MONEY_VALUE' });
    });

    it('rejects unsafe integers above 2^53 - 1', () => {
      assert.throws(() => assertMinor(9007199254740992), { code: 'INVALID_MONEY_VALUE' });
    });
  });

  describe('isWholeRupee and assertWholeRupee', () => {
    it('isWholeRupee returns true for multiples of 100 paise', () => {
      assert.equal(isWholeRupee(0), true);
      assert.equal(isWholeRupee(100), true);
      assert.equal(isWholeRupee(149900), true);
      assert.equal(isWholeRupee(9900), true);
    });

    it('isWholeRupee returns false for non-multiples of 100 or invalid values', () => {
      assert.equal(isWholeRupee(1), false);
      assert.equal(isWholeRupee(9950), false);
      assert.equal(isWholeRupee(150), false);
      assert.equal(isWholeRupee(-100), false);
      assert.equal(isWholeRupee(1.5), false);
      assert.equal(isWholeRupee('100'), false);
    });

    it('assertWholeRupee accepts whole rupee amounts', () => {
      assert.equal(assertWholeRupee(0), 0);
      assert.equal(assertWholeRupee(100), 100);
      assert.equal(assertWholeRupee(9900), 9900);
      assert.equal(assertWholeRupee(149900), 149900);
    });

    it('assertWholeRupee throws for non-multiples of 100 (e.g., config 9950)', () => {
      assert.throws(() => assertWholeRupee(9950, 'SHIPPING_FLAT_MINOR'), {
        code: 'INVALID_MONEY_VALUE',
      });
      assert.throws(() => assertWholeRupee(150), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => assertWholeRupee(1), { code: 'INVALID_MONEY_VALUE' });
    });
  });

  describe('mulMinor and calculateLineTotal', () => {
    it('multiplies valid paise by integer quantity correctly', () => {
      assert.equal(mulMinor(149900, 2), 299800);
      assert.equal(mulMinor(249900, 1), 249900);
      assert.equal(mulMinor(149900, 0), 0);
      assert.equal(calculateLineTotal(149900, 2), 299800);
    });

    it('rejects invalid quantities', () => {
      assert.throws(() => mulMinor(149900, -1), { code: 'INVALID_QUANTITY_VALUE' });
      assert.throws(() => mulMinor(149900, 1.5), { code: 'INVALID_QUANTITY_VALUE' });
      assert.throws(() => mulMinor(149900, '2'), { code: 'INVALID_QUANTITY_VALUE' });
      assert.throws(() => mulMinor(149900, null), { code: 'INVALID_QUANTITY_VALUE' });
    });
  });

  describe('sumMinor', () => {
    it('sums valid paise array correctly', () => {
      assert.equal(sumMinor([]), 0);
      assert.equal(sumMinor([299800, 249900]), 549700);
      assert.equal(sumMinor([100, 200, 300]), 600);
    });

    it('rejects invalid inputs to sumMinor', () => {
      assert.throws(() => sumMinor('not an array'), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => sumMinor([100, -50]), { code: 'INVALID_MONEY_VALUE' });
      assert.throws(() => sumMinor([100, 1.5]), { code: 'INVALID_MONEY_VALUE' });
    });
  });

  describe('calculateOrderTotals', () => {
    it('calculates line totals, subtotal, shipping, and total for known inputs', () => {
      // Felt desk mat (149900) × 2 + Laptop stand (249900) × 1 + shipping 9900
      const result = calculateOrderTotals({
        items: [
          { unitPriceMinor: 149900, quantity: 2 },
          { unitPriceMinor: 249900, quantity: 1 },
        ],
        shippingMinor: 9900,
      });

      assert.deepEqual(result.lines, [299800, 249900]);
      assert.equal(result.subtotalMinor, 549700);
      assert.equal(result.shippingMinor, 9900);
      assert.equal(result.totalMinor, 559600);
      assert.equal(result.totalMinor, result.subtotalMinor + result.shippingMinor);
    });

    it('rejects invalid shipping amounts', () => {
      assert.throws(
        () =>
          calculateOrderTotals({
            items: [{ unitPriceMinor: 149900, quantity: 1 }],
            shippingMinor: -9900,
          }),
        { code: 'INVALID_MONEY_VALUE' }
      );
      assert.throws(
        () =>
          calculateOrderTotals({
            items: [{ unitPriceMinor: 149900, quantity: 1 }],
            shippingMinor: 99.5,
          }),
        { code: 'INVALID_MONEY_VALUE' }
      );
    });
  });
});

