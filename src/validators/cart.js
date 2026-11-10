/**
 * src/validators/cart.js
 *
 * Input validation for cart endpoints (§4.6, API-28).
 *
 * Enforces:
 * - Strict object validation (no unknown root or item fields).
 * - Maximum 50 submitted lines.
 * - Empty items array is valid (200).
 * - Product ID and quantity must be positive safe integers.
 * - Non-integer, negative, zero, float, or malformed inputs return 400 VALIDATION_ERROR.
 */

import { z } from 'zod';

export const cartItemSchema = z
  .object({
    productId: z.number().int().positive().max(2147483647),
    quantity: z.number().int().positive(),
  })
  .strict();

export const cartValidateSchema = z
  .object({
    items: z.array(cartItemSchema).max(50),
  })
  .strict();

/**
 * Validate and normalize cart validation request body.
 *
 * @param {unknown} body
 * @returns {{ items: Array<{ productId: number, quantity: number }> }}
 */
export function validateCartValidate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const err = new Error('Request body must be a JSON object.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.fields = { _root: 'Request body must be a JSON object.' };
    throw err;
  }

  const fields = {};
  const allowedRootKeys = new Set(['items']);

  // Strict check: reject unknown fields on the root body
  for (const key of Object.keys(body)) {
    if (!allowedRootKeys.has(key)) {
      fields[key] = `Unknown field: ${key}.`;
    }
  }

  if (!('items' in body)) {
    fields.items = 'Items must be an array.';
  } else if (!Array.isArray(body.items)) {
    fields.items = 'Items must be an array.';
  } else if (body.items.length > 50) {
    fields.items = 'Cart cannot exceed 50 items.';
  } else {
    const allowedItemKeys = new Set(['productId', 'quantity']);
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        fields[`items.${i}`] = 'Item must be an object.';
        continue;
      }

      for (const itemKey of Object.keys(item)) {
        if (!allowedItemKeys.has(itemKey)) {
          fields[`items.${i}.${itemKey}`] = `Unknown field: ${itemKey}.`;
        }
      }

      // Check productId: positive safe integer within PostgreSQL integer bounds
      if (
        typeof item.productId !== 'number' ||
        !Number.isSafeInteger(item.productId) ||
        item.productId < 1 ||
        item.productId > 2147483647
      ) {
        fields[`items.${i}.productId`] = 'Product ID must be a positive integer.';
      }

      // Check quantity: positive safe integer >= 1
      if (
        typeof item.quantity !== 'number' ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1
      ) {
        fields[`items.${i}.quantity`] = 'Quantity must be a positive integer.';
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    const err = new Error('Some fields need attention.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.fields = fields;
    throw err;
  }

  return { items: body.items };
}

