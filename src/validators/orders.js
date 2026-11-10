/**
 * src/validators/orders.js
 *
 * Strict input validation and canonical request hashing for orders (§4.8, §4.9, UT-06, UT-09).
 *
 * Enforces:
 * - Strict schema rejecting unknown root and item fields (e.g. priceMinor, totalMinor, userId, *Cents).
 * - Maximum 50 submitted lines; empty array rejected with "Your cart is empty.".
 * - Duplicate product IDs merged by summing quantities; rejected if merged quantity exceeds 10.
 * - Quantity must be an integer between 1 and 10; rejects floats, negative, zero, strings, null.
 * - Shipping field rules and exact contract error messages.
 * - Phone normalized to 10-15 digits only.
 * - Empty addressLine2 normalized to null.
 * - Deterministic canonical request hashing via SHA-256 (UT-09).
 * - Idempotency-Key UUID v4 validation (API-45).
 */

import crypto from 'node:crypto';

export const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORBIDDEN_FIELDS = [
  'priceMinor',
  'totalMinor',
  'subtotalMinor',
  'shippingMinor',
  'userId',
  'confirmPassword',
  'priceCents',
  'subtotalCents',
  'totalCents',
  'shippingCents',
  'unitPriceCents',
  'lineTotalCents',
  'unitPriceMinor',
  'lineTotalMinor',
];

/**
 * Validate and normalize Idempotency-Key header value.
 *
 * @param {unknown} key
 * @returns {string} Lowercase UUID v4 string
 */
export function validateIdempotencyKey(key) {
  if (typeof key !== 'string' || !UUID_V4_REGEX.test(key.trim())) {
    const err = new Error('A valid Idempotency-Key header (UUID v4) is required.');
    err.status = 400;
    err.code = 'MISSING_IDEMPOTENCY_KEY';
    throw err;
  }
  return key.trim().toLowerCase();
}

/**
 * Validate order request body, merge duplicate lines, normalize shipping, and compute request hash.
 *
 * @param {unknown} body
 * @returns {{
 *   canonicalItems: Array<{ productId: number, quantity: number }>,
 *   shipping: {
 *     fullName: string,
 *     phone: string,
 *     addressLine1: string,
 *     addressLine2: string|null,
 *     city: string,
 *     region: string,
 *     postalCode: string
 *   },
 *   canonicalRequest: {
 *     items: Array<{ productId: number, quantity: number }>,
 *     shipping: Record<string, unknown>
 *   },
 *   requestHash: Buffer
 * }}
 */
export function validateOrderInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const err = new Error('Request body must be a JSON object.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.fields = { _root: 'Request body must be a JSON object.' };
    throw err;
  }

  const fields = {};
  const allowedRootKeys = new Set(['items', 'shipping']);

  // 1. Strict check: reject unknown or forbidden root fields
  for (const key of Object.keys(body)) {
    if (!allowedRootKeys.has(key)) {
      fields[key] = `Unknown field: ${key}.`;
    }
  }

  // 2. Validate items array
  let rawItems = [];
  if (!('items' in body)) {
    fields.items = 'Your cart is empty.';
  } else if (!Array.isArray(body.items)) {
    fields.items = 'Items must be an array.';
  } else if (body.items.length === 0) {
    fields.items = 'Your cart is empty.';
  } else if (body.items.length > 50) {
    fields.items = 'Cart cannot exceed 50 items.';
  } else {
    rawItems = body.items;
  }

  const allowedItemKeys = new Set(['productId', 'quantity']);
  const validLines = [];

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fields[`items.${i}`] = 'Item must be an object.';
      continue;
    }

    // Check unknown or forbidden keys in line items
    for (const itemKey of Object.keys(item)) {
      if (!allowedItemKeys.has(itemKey)) {
        fields[`items.${i}.${itemKey}`] = `Unknown field: ${itemKey}.`;
      }
    }

    let lineOk = true;

    // Check productId: positive safe integer within PostgreSQL integer bounds
    if (
      typeof item.productId !== 'number' ||
      !Number.isSafeInteger(item.productId) ||
      item.productId < 1 ||
      item.productId > 2147483647
    ) {
      fields[`items.${i}.productId`] = 'Product ID must be a positive integer.';
      lineOk = false;
    }

    // Check quantity: integer 1 to 10
    if (
      typeof item.quantity !== 'number' ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 10
    ) {
      fields[`items.${i}.quantity`] = 'Quantity must be between 1 and 10.';
      lineOk = false;
    }

    if (lineOk) {
      validLines.push({ index: i, productId: item.productId, quantity: item.quantity });
    }
  }

  // 3. Merge duplicate lines and check merged quantity cap of 10
  const mergedQuantityMap = new Map();
  const firstIndexMap = new Map();

  for (const line of validLines) {
    const current = mergedQuantityMap.get(line.productId) || 0;
    mergedQuantityMap.set(line.productId, current + line.quantity);
    if (!firstIndexMap.has(line.productId)) {
      firstIndexMap.set(line.productId, line.index);
    }
  }

  for (const [productId, totalQty] of mergedQuantityMap.entries()) {
    if (totalQty > 10) {
      const idx = firstIndexMap.get(productId);
      fields[`items.${idx}.quantity`] = 'Quantity must be between 1 and 10.';
    }
  }

  // 4. Validate shipping object
  let normalizedShipping = null;

  if (!('shipping' in body)) {
    fields.shipping = 'Enter shipping details.';
  } else if (!body.shipping || typeof body.shipping !== 'object' || Array.isArray(body.shipping)) {
    fields.shipping = 'Shipping details must be an object.';
  } else {
    const shipping = body.shipping;
    const allowedShippingKeys = new Set([
      'fullName',
      'phone',
      'addressLine1',
      'addressLine2',
      'city',
      'region',
      'postalCode',
    ]);

    for (const key of Object.keys(shipping)) {
      if (!allowedShippingKeys.has(key)) {
        fields[`shipping.${key}`] = `Unknown field: ${key}.`;
      }
    }

    // shipping.fullName: trim, 1-100, no control characters
    let cleanFullName = '';
    if (typeof shipping.fullName !== 'string') {
      fields['shipping.fullName'] = "Enter the recipient's name.";
    } else {
      cleanFullName = shipping.fullName.trim();
      if (cleanFullName.length < 1 || cleanFullName.length > 100 || /[\x00-\x1F\x7F]/.test(cleanFullName)) {
        fields['shipping.fullName'] = "Enter the recipient's name.";
      }
    }

    // shipping.phone: remove spaces, hyphens, parentheses, and leading plus; 10 to 15 digits
    let cleanPhone = '';
    if (typeof shipping.phone !== 'string') {
      fields['shipping.phone'] = 'Enter a phone number with 10 to 15 digits.';
    } else {
      cleanPhone = shipping.phone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
      if (!/^[0-9]{10,15}$/.test(cleanPhone)) {
        fields['shipping.phone'] = 'Enter a phone number with 10 to 15 digits.';
      }
    }

    // shipping.addressLine1: trim, 1-150
    let cleanAddress1 = '';
    if (typeof shipping.addressLine1 !== 'string') {
      fields['shipping.addressLine1'] = 'Enter a street address.';
    } else {
      cleanAddress1 = shipping.addressLine1.trim();
      if (cleanAddress1.length < 1 || cleanAddress1.length > 150) {
        fields['shipping.addressLine1'] = 'Enter a street address.';
      }
    }

    // shipping.addressLine2: optional, trim, 0-150, empty becomes null
    let cleanAddress2 = null;
    if (shipping.addressLine2 !== undefined && shipping.addressLine2 !== null) {
      if (typeof shipping.addressLine2 !== 'string') {
        fields['shipping.addressLine2'] = 'Use 150 characters or fewer.';
      } else {
        const trimmed = shipping.addressLine2.trim();
        if (trimmed.length > 150) {
          fields['shipping.addressLine2'] = 'Use 150 characters or fewer.';
        } else {
          cleanAddress2 = trimmed.length > 0 ? trimmed : null;
        }
      }
    }

    // shipping.city: trim, 1-80
    let cleanCity = '';
    if (typeof shipping.city !== 'string') {
      fields['shipping.city'] = 'Enter a city.';
    } else {
      cleanCity = shipping.city.trim();
      if (cleanCity.length < 1 || cleanCity.length > 80) {
        fields['shipping.city'] = 'Enter a city.';
      }
    }

    // shipping.region: trim, 1-80
    let cleanRegion = '';
    if (typeof shipping.region !== 'string') {
      fields['shipping.region'] = 'Enter a state or region.';
    } else {
      cleanRegion = shipping.region.trim();
      if (cleanRegion.length < 1 || cleanRegion.length > 80) {
        fields['shipping.region'] = 'Enter a state or region.';
      }
    }

    // shipping.postalCode: trim, 3-10 chars, letters, digits, spaces, hyphens; starts with letter or digit
    let cleanPostal = '';
    if (typeof shipping.postalCode !== 'string') {
      fields['shipping.postalCode'] = 'Enter a valid postal code.';
    } else {
      cleanPostal = shipping.postalCode.trim();
      if (
        cleanPostal.length < 3 ||
        cleanPostal.length > 10 ||
        !/^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(cleanPostal)
      ) {
        fields['shipping.postalCode'] = 'Enter a valid postal code.';
      }
    }

    if (
      !fields['shipping.fullName'] &&
      !fields['shipping.phone'] &&
      !fields['shipping.addressLine1'] &&
      !fields['shipping.addressLine2'] &&
      !fields['shipping.city'] &&
      !fields['shipping.region'] &&
      !fields['shipping.postalCode']
    ) {
      normalizedShipping = {
        fullName: cleanFullName,
        phone: cleanPhone,
        addressLine1: cleanAddress1,
        addressLine2: cleanAddress2,
        city: cleanCity,
        region: cleanRegion,
        postalCode: cleanPostal,
      };
    }
  }

  // 5. If any validation errors occurred, abort with 400 VALIDATION_ERROR
  if (Object.keys(fields).length > 0) {
    const err = new Error('Some fields need attention.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.fields = fields;
    throw err;
  }

  // 6. Build canonical items sorted by productId
  const canonicalItems = Array.from(mergedQuantityMap.entries())
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId - b.productId);

  // 7. Build deterministic canonical request (UT-09)
  const canonicalRequest = {
    items: canonicalItems,
    shipping: {
      addressLine1: normalizedShipping.addressLine1,
      addressLine2: normalizedShipping.addressLine2,
      city: normalizedShipping.city,
      fullName: normalizedShipping.fullName,
      phone: normalizedShipping.phone,
      postalCode: normalizedShipping.postalCode,
      region: normalizedShipping.region,
    },
  };

  const canonicalJson = JSON.stringify(canonicalRequest);
  const requestHash = crypto.createHash('sha256').update(canonicalJson).digest();

  return {
    canonicalItems,
    shipping: normalizedShipping,
    canonicalRequest,
    requestHash,
  };
}

/**
 * Compute SHA-256 hash of a canonical order payload.
 *
 * @param {object} canonicalRequest
 * @returns {Buffer} 32-byte hash buffer
 */
export function hashCanonicalRequest(canonicalRequest) {
  const json = JSON.stringify(canonicalRequest);
  return crypto.createHash('sha256').update(json).digest();
}

