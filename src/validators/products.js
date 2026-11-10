/**
 * src/validators/products.js
 *
 * Query and parameter validation for products and categories (§4.1, §4.5, UT-05, API-06, API-11, API-13, API-20).
 */

import { z } from 'zod';

export const SORT_OPTIONS = [
  'featured',
  'price_asc',
  'price_desc',
  'newest',
  'name_asc',
];

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Check if a product slug matches the required format.
 *
 * @param {unknown} slug
 * @returns {boolean}
 */
export function isValidProductSlug(slug) {
  if (typeof slug !== 'string') return false;
  return slug.length >= 1 && slug.length <= 120 && SLUG_REGEX.test(slug);
}

/**
 * Check if a category slug matches the required format.
 *
 * @param {unknown} slug
 * @returns {boolean}
 */
export function isValidCategorySlug(slug) {
  if (typeof slug !== 'string') return false;
  return slug.length >= 1 && slug.length <= 60 && SLUG_REGEX.test(slug);
}

/**
 * Zod schema for validated product query parameters.
 */
export const productQuerySchema = z.object({
  page: z.number().int().min(1).max(10000).default(1),
  limit: z.number().int().min(1).max(48).default(12),
  sort: z.enum(SORT_OPTIONS).default('featured'),
  category: z.string().regex(SLUG_REGEX).max(60).optional(),
  search: z.string().max(80).optional(),
});

/**
 * Validate and normalize product listing query parameters (§4.5, UT-05).
 *
 * Enforces:
 * - Rejection of repeated parameters (Contract 4.1)
 * - Page bounds (1 to 10000, integer)
 * - Limit bounds (1 to 48, integer)
 * - Sort enum (featured, price_asc, price_desc, newest, name_asc)
 * - Category slug format (lowercase hyphenated up to 60 chars)
 * - Search query (trimmed, collapsed whitespace, 1 to 80 chars; empty becomes absent)
 * - Unknown query-string parameters are ignored (Contract 4.1)
 *
 * @param {Record<string, unknown>} rawQuery
 * @returns {{
 *   page: number,
 *   limit: number,
 *   sort: 'featured' | 'price_asc' | 'price_desc' | 'newest' | 'name_asc',
 *   category?: string,
 *   search?: string
 * }}
 */
export function validateProductQuery(rawQuery = {}) {
  const fields = {};

  // 1. Contract 4.1: A query parameter repeated twice is a 400 VALIDATION_ERROR
  for (const [key, value] of Object.entries(rawQuery)) {
    if (Array.isArray(value)) {
      fields[key] = `Query parameter "${key}" cannot be repeated.`;
    }
  }

  if (Object.keys(fields).length > 0) {
    const err = new Error('Some fields need attention.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.fields = fields;
    throw err;
  }

  // 2. Validate page (default 1, 1..10000)
  let page = 1;
  if (rawQuery.page !== undefined && rawQuery.page !== null && rawQuery.page !== '') {
    const pageStr = String(rawQuery.page);
    if (!/^(0|[1-9][0-9]*)$/.test(pageStr)) {
      fields.page = 'Page must be an integer between 1 and 10000.';
    } else {
      const pageNum = Number(pageStr);
      if (pageNum < 1 || pageNum > 10000) {
        fields.page = 'Page must be an integer between 1 and 10000.';
      } else {
        page = pageNum;
      }
    }
  }

  // 3. Validate limit (default 12, 1..48)
  let limit = 12;
  if (rawQuery.limit !== undefined && rawQuery.limit !== null && rawQuery.limit !== '') {
    const limitStr = String(rawQuery.limit);
    if (!/^(0|[1-9][0-9]*)$/.test(limitStr)) {
      fields.limit = 'Limit must be an integer between 1 and 48.';
    } else {
      const limitNum = Number(limitStr);
      if (limitNum < 1 || limitNum > 48) {
        fields.limit = 'Limit must be an integer between 1 and 48.';
      } else {
        limit = limitNum;
      }
    }
  }

  // 4. Validate sort (default 'featured')
  let sort = 'featured';
  if (rawQuery.sort !== undefined && rawQuery.sort !== null && rawQuery.sort !== '') {
    const sortStr = String(rawQuery.sort);
    if (!SORT_OPTIONS.includes(sortStr)) {
      fields.sort = `Sort must be one of: ${SORT_OPTIONS.join(', ')}.`;
    } else {
      sort = sortStr;
    }
  }

  // 5. Validate category slug
  let category;
  if (rawQuery.category !== undefined && rawQuery.category !== null && rawQuery.category !== '') {
    const categoryStr = String(rawQuery.category);
    if (!isValidCategorySlug(categoryStr)) {
      fields.category = 'Category must be a lowercase hyphenated slug up to 60 characters.';
    } else {
      category = categoryStr;
    }
  }

  // 6. Validate search term (trim, collapse whitespace, max 80 chars, empty -> absent)
  let search;
  if (rawQuery.search !== undefined && rawQuery.search !== null) {
    const searchStr = String(rawQuery.search).trim().replace(/\s+/g, ' ');
    if (searchStr.length > 80) {
      fields.search = 'Search query must be 80 characters or fewer.';
    } else if (searchStr.length > 0) {
      search = searchStr;
    }
  }

  if (Object.keys(fields).length > 0) {
    const err = new Error('Some fields need attention.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.fields = fields;
    throw err;
  }

  return {
    page,
    limit,
    sort,
    ...(category !== undefined ? { category } : {}),
    ...(search !== undefined ? { search } : {}),
  };
}

/**
 * Validate product slug parameter.
 *
 * @param {unknown} slug
 * @returns {string}
 */
export function validateProductSlug(slug) {
  if (!isValidProductSlug(slug)) {
    const err = new Error('Product not found.');
    err.status = 404;
    err.code = 'PRODUCT_NOT_FOUND';
    throw err;
  }
  return slug;
}

