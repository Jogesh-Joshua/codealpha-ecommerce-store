/**
 * tests/unit/order-validator.test.js
 *
 * Unit tests for order input validation and deterministic request hashing (UT-06, UT-09).
 *
 * Must verify:
 * - Strict schema rejects forbidden fields (priceMinor, totalMinor, userId, confirmPassword, *Cents).
 * - Duplicate product lines merged then re-capped at 10.
 * - Quantity 0, -1, 11, 1.5, "2", null rejected.
 * - Phone normalisation and 10 to 15 digit rule.
 * - Postal code rule.
 * - Empty addressLine2 becomes null.
 * - 51 lines rejected; empty items array rejected with "Your cart is empty.".
 * - Deterministic SHA-256 request hashing regardless of item order or key order (UT-09).
 * - Changing quantity or shipping details changes the hash.
 * - Validates Idempotency-Key header UUID v4 (API-45).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOrderInput,
  validateIdempotencyKey,
  hashCanonicalRequest,
} from '../../src/validators/orders.js';

describe('UT-06: validators/orders.js — Input validation', () => {
  const validOrder = {
    items: [
      { productId: 1, quantity: 2 },
      { productId: 9, quantity: 1 },
    ],
    shipping: {
      fullName: 'Alex Morgan',
      phone: '+91 (987) 654-3210',
      addressLine1: '221 Example Street',
      addressLine2: '',
      city: 'Springfield',
      region: 'Example State',
      postalCode: '641001',
    },
  };

  it('accepts a valid order payload and normalises fields', () => {
    const result = validateOrderInput(validOrder);
    assert.equal(result.canonicalItems.length, 2);
    assert.equal(result.shipping.fullName, 'Alex Morgan');
    assert.equal(result.shipping.phone, '919876543210');
    assert.equal(result.shipping.addressLine2, null);
    assert.equal(result.shipping.postalCode, '641001');
    assert.ok(Buffer.isBuffer(result.requestHash));
    assert.equal(result.requestHash.length, 32);
  });

  describe('Strict schema: forbidden and unknown fields', () => {
    it('rejects client-supplied priceMinor and totalMinor', () => {
      assert.throws(
        () => validateOrderInput({ ...validOrder, priceMinor: 149900 }),
        (err) => err.status === 400 && err.code === 'VALIDATION_ERROR' && 'priceMinor' in err.fields
      );
      assert.throws(
        () => validateOrderInput({ ...validOrder, totalMinor: 559600 }),
        (err) => err.status === 400 && err.code === 'VALIDATION_ERROR' && 'totalMinor' in err.fields
      );
    });

    it('rejects userId and confirmPassword', () => {
      assert.throws(
        () => validateOrderInput({ ...validOrder, userId: '00000000-0000-0000-0000-000000000000' }),
        (err) => err.status === 400 && err.code === 'VALIDATION_ERROR' && 'userId' in err.fields
      );
      assert.throws(
        () => validateOrderInput({ ...validOrder, confirmPassword: 'password123' }),
        (err) => err.status === 400 && err.code === 'VALIDATION_ERROR' && 'confirmPassword' in err.fields
      );
    });

    it('rejects legacy *Cents fields', () => {
      assert.throws(
        () => validateOrderInput({ ...validOrder, priceCents: 149900 }),
        (err) => err.status === 400 && err.code === 'VALIDATION_ERROR' && 'priceCents' in err.fields
      );
      assert.throws(
        () => validateOrderInput({ ...validOrder, totalCents: 559600 }),
        (err) => err.status === 400 && err.code === 'VALIDATION_ERROR' && 'totalCents' in err.fields
      );
    });

    it('rejects unknown fields inside line items', () => {
      const order = {
        ...validOrder,
        items: [{ productId: 1, quantity: 2, priceMinor: 149900 }],
      };
      assert.throws(
        () => validateOrderInput(order),
        (err) =>
          err.status === 400 &&
          err.code === 'VALIDATION_ERROR' &&
          'items.0.priceMinor' in err.fields
      );
    });
  });

  describe('Line items, quantities, and merging', () => {
    it('rejects empty items with "Your cart is empty."', () => {
      assert.throws(
        () => validateOrderInput({ ...validOrder, items: [] }),
        (err) =>
          err.status === 400 &&
          err.code === 'VALIDATION_ERROR' &&
          err.fields.items === 'Your cart is empty.'
      );
    });

    it('rejects more than 50 items', () => {
      const items = Array.from({ length: 51 }, (_, i) => ({ productId: i + 1, quantity: 1 }));
      assert.throws(
        () => validateOrderInput({ ...validOrder, items }),
        (err) =>
          err.status === 400 &&
          err.code === 'VALIDATION_ERROR' &&
          err.fields.items === 'Cart cannot exceed 50 items.'
      );
    });

    it('rejects quantity 0, -1, 11, 1.5, "2", null with "Quantity must be between 1 and 10."', () => {
      const testCases = [0, -1, 11, 1.5, '2', null];
      for (const badQty of testCases) {
        assert.throws(
          () =>
            validateOrderInput({
              ...validOrder,
              items: [{ productId: 1, quantity: badQty }],
            }),
          (err) =>
            err.status === 400 &&
            err.code === 'VALIDATION_ERROR' &&
            err.fields['items.0.quantity'] === 'Quantity must be between 1 and 10.'
        );
      }
    });

    it('merges duplicate product lines by summing quantities', () => {
      const order = {
        ...validOrder,
        items: [
          { productId: 1, quantity: 2 },
          { productId: 9, quantity: 1 },
          { productId: 1, quantity: 3 },
        ],
      };
      const result = validateOrderInput(order);
      assert.equal(result.canonicalItems.length, 2);
      assert.deepEqual(result.canonicalItems[0], { productId: 1, quantity: 5 });
      assert.deepEqual(result.canonicalItems[1], { productId: 9, quantity: 1 });
    });

    it('accepts duplicate product lines when merged quantity is <= 10 (Product 1 qty 4 + qty 5 = 9)', () => {
      const order = {
        ...validOrder,
        items: [
          { productId: 1, quantity: 4 },
          { productId: 1, quantity: 5 },
        ],
      };
      const result = validateOrderInput(order);
      assert.equal(result.canonicalItems.length, 1);
      assert.deepEqual(result.canonicalItems[0], { productId: 1, quantity: 9 });
    });

    it('accepts duplicate product lines when merged quantity equals exactly 10 (Product 1 qty 6 + qty 4 = 10)', () => {
      const order = {
        ...validOrder,
        items: [
          { productId: 1, quantity: 6 },
          { productId: 1, quantity: 4 },
        ],
      };
      const result = validateOrderInput(order);
      assert.equal(result.canonicalItems.length, 1);
      assert.deepEqual(result.canonicalItems[0], { productId: 1, quantity: 10 });
    });

    it('rejects duplicate product lines whose merged quantity exceeds 10 (Product 1 qty 6 + qty 6 = 12)', () => {
      const order = {
        ...validOrder,
        items: [
          { productId: 1, quantity: 6 },
          { productId: 1, quantity: 6 },
        ],
      };
      assert.throws(
        () => validateOrderInput(order),
        (err) =>
          err.status === 400 &&
          err.code === 'VALIDATION_ERROR' &&
          err.fields['items.0.quantity'] === 'Quantity must be between 1 and 10.'
      );
    });

    it('rejects three duplicate lines whose combined quantity exceeds 10 (e.g. 4 + 4 + 3 = 11)', () => {
      const order = {
        ...validOrder,
        items: [
          { productId: 1, quantity: 4 },
          { productId: 1, quantity: 4 },
          { productId: 1, quantity: 3 },
        ],
      };
      assert.throws(
        () => validateOrderInput(order),
        (err) =>
          err.status === 400 &&
          err.code === 'VALIDATION_ERROR' &&
          err.fields['items.0.quantity'] === 'Quantity must be between 1 and 10.'
      );
    });

    it('canonical request hash is identical for duplicate lines vs pre-merged single line', () => {
      const orderWithDuplicates = {
        ...validOrder,
        items: [
          { productId: 1, quantity: 4 },
          { productId: 9, quantity: 1 },
          { productId: 1, quantity: 5 },
        ],
      };
      const orderPreMerged = {
        ...validOrder,
        items: [
          { productId: 9, quantity: 1 },
          { productId: 1, quantity: 9 },
        ],
      };
      const res1 = validateOrderInput(orderWithDuplicates);
      const res2 = validateOrderInput(orderPreMerged);
      assert.equal(Buffer.compare(res1.requestHash, res2.requestHash), 0);
    });
  });

  describe('Shipping validation', () => {
    it('validates fullName rules', () => {
      assert.throws(
        () =>
          validateOrderInput({
            ...validOrder,
            shipping: { ...validOrder.shipping, fullName: '' },
          }),
        (err) => err.fields['shipping.fullName'] === "Enter the recipient's name."
      );
      assert.throws(
        () =>
          validateOrderInput({
            ...validOrder,
            shipping: { ...validOrder.shipping, fullName: 'Alex\u0000Morgan' },
          }),
        (err) => err.fields['shipping.fullName'] === "Enter the recipient's name."
      );
    });

    it('normalises phone and enforces 10 to 15 digit rule', () => {
      // Valid formatting with spaces, parens, hyphens, leading plus
      const res = validateOrderInput({
        ...validOrder,
        shipping: { ...validOrder.shipping, phone: '+1 (555) 010-0199' },
      });
      assert.equal(res.shipping.phone, '15550100199');

      // Too short (<10 digits)
      assert.throws(
        () =>
          validateOrderInput({
            ...validOrder,
            shipping: { ...validOrder.shipping, phone: '123456789' },
          }),
        (err) => err.fields['shipping.phone'] === 'Enter a phone number with 10 to 15 digits.'
      );

      // Too long (>15 digits)
      assert.throws(
        () =>
          validateOrderInput({
            ...validOrder,
            shipping: { ...validOrder.shipping, phone: '1234567890123456' },
          }),
        (err) => err.fields['shipping.phone'] === 'Enter a phone number with 10 to 15 digits.'
      );
    });

    it('enforces addressLine1 rule', () => {
      assert.throws(
        () =>
          validateOrderInput({
            ...validOrder,
            shipping: { ...validOrder.shipping, addressLine1: '   ' },
          }),
        (err) => err.fields['shipping.addressLine1'] === 'Enter a street address.'
      );
    });

    it('normalises empty addressLine2 to null and enforces length limit', () => {
      const res1 = validateOrderInput({
        ...validOrder,
        shipping: { ...validOrder.shipping, addressLine2: '' },
      });
      assert.equal(res1.shipping.addressLine2, null);

      const res2 = validateOrderInput({
        ...validOrder,
        shipping: { ...validOrder.shipping, addressLine2: '   ' },
      });
      assert.equal(res2.shipping.addressLine2, null);

      assert.throws(
        () =>
          validateOrderInput({
            ...validOrder,
            shipping: { ...validOrder.shipping, addressLine2: 'a'.repeat(151) },
          }),
        (err) => err.fields['shipping.addressLine2'] === 'Use 150 characters or fewer.'
      );
    });

    it('enforces city and region rules', () => {
      assert.throws(
        () =>
          validateOrderInput({
            ...validOrder,
            shipping: { ...validOrder.shipping, city: '' },
          }),
        (err) => err.fields['shipping.city'] === 'Enter a city.'
      );
      assert.throws(
        () =>
          validateOrderInput({
            ...validOrder,
            shipping: { ...validOrder.shipping, region: '' },
          }),
        (err) => err.fields['shipping.region'] === 'Enter a state or region.'
      );
    });

    it('enforces postal code rules', () => {
      assert.throws(
        () =>
          validateOrderInput({
            ...validOrder,
            shipping: { ...validOrder.shipping, postalCode: '12' },
          }),
        (err) => err.fields['shipping.postalCode'] === 'Enter a valid postal code.'
      );
      assert.throws(
        () =>
          validateOrderInput({
            ...validOrder,
            shipping: { ...validOrder.shipping, postalCode: '-641001' },
          }),
        (err) => err.fields['shipping.postalCode'] === 'Enter a valid postal code.'
      );
    });
  });

  describe('Idempotency-Key validation', () => {
    it('accepts valid UUID v4', () => {
      const key = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      assert.equal(validateIdempotencyKey(key), key);
    });

    it('rejects missing or non-UUID Idempotency-Key with 400 MISSING_IDEMPOTENCY_KEY', () => {
      assert.throws(() => validateIdempotencyKey(undefined), { code: 'MISSING_IDEMPOTENCY_KEY' });
      assert.throws(() => validateIdempotencyKey(''), { code: 'MISSING_IDEMPOTENCY_KEY' });
      assert.throws(() => validateIdempotencyKey('not-a-uuid'), { code: 'MISSING_IDEMPOTENCY_KEY' });
      assert.throws(() => validateIdempotencyKey('12345'), { code: 'MISSING_IDEMPOTENCY_KEY' });
    });
  });
});

describe('UT-09: Request hash determinism', () => {
  it('produces the identical request hash regardless of item order, duplicate merging, or JSON key order', () => {
    // Request 1: Item 1 then Item 9
    const req1 = {
      items: [
        { productId: 1, quantity: 2 },
        { productId: 9, quantity: 1 },
      ],
      shipping: {
        fullName: 'Alex Morgan',
        phone: '+91 98765 43210',
        addressLine1: '221 Example Street',
        addressLine2: '',
        city: 'Springfield',
        region: 'Example State',
        postalCode: '641001',
      },
    };

    // Request 2: Item 9 then Item 1 split in duplicates, different key order
    const req2 = {
      shipping: {
        postalCode: '641001',
        region: 'Example State',
        city: 'Springfield',
        addressLine2: '   ',
        addressLine1: '221 Example Street',
        phone: '91-98765-43210',
        fullName: 'Alex Morgan',
      },
      items: [
        { quantity: 1, productId: 9 },
        { quantity: 1, productId: 1 },
        { productId: 1, quantity: 1 },
      ],
    };

    const res1 = validateOrderInput(req1);
    const res2 = validateOrderInput(req2);

    assert.equal(res1.requestHash.toString('hex'), res2.requestHash.toString('hex'));
  });

  it('changes the hash when quantity changes', () => {
    const req1 = {
      items: [{ productId: 1, quantity: 2 }],
      shipping: {
        fullName: 'Alex Morgan',
        phone: '919876543210',
        addressLine1: '221 Example Street',
        city: 'Springfield',
        region: 'Example State',
        postalCode: '641001',
      },
    };
    const req2 = {
      items: [{ productId: 1, quantity: 3 }],
      shipping: {
        fullName: 'Alex Morgan',
        phone: '919876543210',
        addressLine1: '221 Example Street',
        city: 'Springfield',
        region: 'Example State',
        postalCode: '641001',
      },
    };

    const res1 = validateOrderInput(req1);
    const res2 = validateOrderInput(req2);
    assert.notEqual(res1.requestHash.toString('hex'), res2.requestHash.toString('hex'));
  });

  it('changes the hash when shipping details change', () => {
    const baseReq = {
      items: [{ productId: 1, quantity: 2 }],
      shipping: {
        fullName: 'Alex Morgan',
        phone: '919876543210',
        addressLine1: '221 Example Street',
        city: 'Springfield',
        region: 'Example State',
        postalCode: '641001',
      },
    };

    const changedShippingReq = {
      ...baseReq,
      shipping: {
        ...baseReq.shipping,
        city: 'Metropolis',
      },
    };

    const res1 = validateOrderInput(baseReq);
    const res2 = validateOrderInput(changedShippingReq);
    assert.notEqual(res1.requestHash.toString('hex'), res2.requestHash.toString('hex'));
  });
});

