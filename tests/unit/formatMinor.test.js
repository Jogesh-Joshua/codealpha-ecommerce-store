/**
 * tests/unit/formatMinor.test.js
 *
 * Unit tests for minor paise currency formatter (Phase 7 / E0).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinor } from '../../public/js/format-minor.js';

describe('formatMinor (Phase 7 / E0)', () => {
  it('formats standard prices to whole-rupee INR strings', () => {
    assert.strictEqual(formatMinor(149900), '₹1,499');
    assert.strictEqual(formatMinor(289900), '₹2,899');
    assert.strictEqual(formatMinor(9900), '₹99');
    assert.strictEqual(formatMinor(0), '₹0');
  });

  it('correctly applies Indian grouping to larger amounts (₹1,00,000)', () => {
    assert.strictEqual(formatMinor(10000000), '₹1,00,000');
    assert.strictEqual(formatMinor(50000000), '₹5,00,000');
  });

  it('accepts valid numeric string inputs', () => {
    assert.strictEqual(formatMinor('149900'), '₹1,499');
    assert.strictEqual(formatMinor('0'), '₹0');
  });

  it('rejects negative numbers and negative strings', () => {
    assert.throws(() => formatMinor(-100), TypeError);
    assert.throws(() => formatMinor('-100'), TypeError);
  });

  it('rejects non-integer and float numbers', () => {
    assert.throws(() => formatMinor(1499.5), TypeError);
    assert.throws(() => formatMinor('1499.5'), TypeError);
  });

  it('rejects NaN, Infinity, null, and non-numeric types', () => {
    assert.throws(() => formatMinor(NaN), TypeError);
    assert.throws(() => formatMinor(Infinity), TypeError);
    assert.throws(() => formatMinor(null), TypeError);
    assert.throws(() => formatMinor(undefined), TypeError);
    assert.throws(() => formatMinor({}), TypeError);
    assert.throws(() => formatMinor('abc'), TypeError);
    assert.throws(() => formatMinor(''), TypeError);
  });
});

