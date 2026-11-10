/**
 * tests/unit/cart-validator.test.js
 *
 * Unit tests for cart input validation (§4.6, API-28).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateCartValidate } from '../../src/validators/cart.js';

describe('Cart Validator (validateCartValidate)', () => {
  it('accepts an empty items array', () => {
    const result = validateCartValidate({ items: [] });
    assert.deepEqual(result, { items: [] });
  });

  it('accepts valid items with quantities including quantities > 10', () => {
    const input = {
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 15 },
      ],
    };
    const result = validateCartValidate(input);
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].productId, 1);
    assert.equal(result.items[0].quantity, 2);
    assert.equal(result.items[1].productId, 2);
    assert.equal(result.items[1].quantity, 15);
  });

  it('rejects non-object, null, or array request bodies', () => {
    assert.throws(
      () => validateCartValidate(null),
      (err) => err.status === 400 && err.code === 'VALIDATION_ERROR'
    );
    assert.throws(
      () => validateCartValidate([]),
      (err) => err.status === 400 && err.code === 'VALIDATION_ERROR'
    );
    assert.throws(
      () => validateCartValidate('string'),
      (err) => err.status === 400 && err.code === 'VALIDATION_ERROR'
    );
  });

  it('rejects unknown root fields on request body', () => {
    assert.throws(
      () => validateCartValidate({ items: [], extra: true }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.ok(err.fields.extra);
        return true;
      }
    );
  });

  it('rejects missing or non-array items field', () => {
    assert.throws(
      () => validateCartValidate({}),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.fields.items, 'Items must be an array.');
        return true;
      }
    );
    assert.throws(
      () => validateCartValidate({ items: 'not an array' }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.fields.items, 'Items must be an array.');
        return true;
      }
    );
  });

  it('rejects carts exceeding 50 items (51 items)', () => {
    const items = [];
    for (let i = 1; i <= 51; i++) {
      items.push({ productId: i, quantity: 1 });
    }
    assert.throws(
      () => validateCartValidate({ items }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.fields.items, 'Cart cannot exceed 50 items.');
        return true;
      }
    );
  });

  it('rejects non-object elements inside items array', () => {
    assert.throws(
      () => validateCartValidate({ items: ['invalid'] }),
      (err) => {
        assert.equal(err.status, 400);
        assert.ok(err.fields['items.0']);
        return true;
      }
    );
  });

  it('rejects unknown fields on item objects', () => {
    assert.throws(
      () => validateCartValidate({ items: [{ productId: 1, quantity: 2, price: 100 }] }),
      (err) => {
        assert.equal(err.status, 400);
        assert.ok(err.fields['items.0.price']);
        return true;
      }
    );
  });

  it('rejects non-integer, negative, or zero productId values', () => {
    const invalidProductIds = [0, -1, 1.5, '1', null, undefined, NaN, Infinity];
    for (const badId of invalidProductIds) {
      assert.throws(
        () => validateCartValidate({ items: [{ productId: badId, quantity: 1 }] }),
        (err) => {
          assert.equal(err.status, 400);
          assert.ok(
            err.fields['items.0.productId'],
            `Expected error for productId=${badId}`
          );
          return true;
        }
      );
    }
  });

  it('rejects non-integer, negative, or zero quantity values', () => {
    const invalidQuantities = [0, -1, 1.5, '2', null, undefined, NaN, Infinity];
    for (const badQty of invalidQuantities) {
      assert.throws(
        () => validateCartValidate({ items: [{ productId: 1, quantity: badQty }] }),
        (err) => {
          assert.equal(err.status, 400);
          assert.ok(
            err.fields['items.0.quantity'],
            `Expected error for quantity=${badQty}`
          );
          return true;
        }
      );
    }
  });
});

