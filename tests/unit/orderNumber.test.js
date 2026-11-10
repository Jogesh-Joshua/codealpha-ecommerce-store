/**
 * tests/unit/orderNumber.test.js
 *
 * Unit tests for sequence-based order number generator (UT-08).
 *
 * Must verify:
 * - Output matches ^[A-Z]{2,4}-[0-9]{6,}$
 * - Correct prefix and zero-padding of sequence numbers.
 * - Rejection of invalid prefixes or non-positive sequence integers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatOrderNumber, ORDER_NUMBER_REGEX } from '../../src/lib/orderNumber.js';

describe('UT-08: lib/orderNumber.js', () => {
  it('formats standard order numbers matching ^[A-Z]{2,4}-[0-9]{6,}$', () => {
    const num1 = formatOrderNumber('DL', 100001);
    assert.equal(num1, 'DL-100001');
    assert.match(num1, ORDER_NUMBER_REGEX);

    const num2 = formatOrderNumber('SHOP', 100002);
    assert.equal(num2, 'SHOP-100002');
    assert.match(num2, ORDER_NUMBER_REGEX);
  });

  it('pads sequence numbers to at least 6 digits', () => {
    const num = formatOrderNumber('DL', 1);
    assert.equal(num, 'DL-000001');
    assert.match(num, ORDER_NUMBER_REGEX);

    const num42 = formatOrderNumber('DL', 42);
    assert.equal(num42, 'DL-000042');
    assert.match(num42, ORDER_NUMBER_REGEX);
  });

  it('handles sequences with 7 or more digits without truncation', () => {
    const large = formatOrderNumber('DL', 1234567);
    assert.equal(large, 'DL-1234567');
    assert.match(large, ORDER_NUMBER_REGEX);
  });

  it('rejects invalid prefixes', () => {
    assert.throws(() => formatOrderNumber('', 100001));
    assert.throws(() => formatOrderNumber('A', 100001)); // Too short
    assert.throws(() => formatOrderNumber('TOOLONG', 100001)); // Too long
    assert.throws(() => formatOrderNumber('12', 100001)); // Non-letters
  });

  it('rejects invalid sequence values', () => {
    assert.throws(() => formatOrderNumber('DL', 0));
    assert.throws(() => formatOrderNumber('DL', -1));
    assert.throws(() => formatOrderNumber('DL', 1.5));
    assert.throws(() => formatOrderNumber('DL', NaN));
    assert.throws(() => formatOrderNumber('DL', 'abc'));
  });
});

