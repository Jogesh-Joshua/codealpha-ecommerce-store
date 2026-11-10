/**
 * tests/unit/products-validator.test.js
 *
 * UT-05: validators/products.js unit tests.
 *
 * Defaults; bounds (limit 1 to 48, page 1 to 10000); enum for sort;
 * slug pattern; repeated query parameter rejected; empty search treated
 * as absent; search over 80 characters rejected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProductQuery,
  validateProductSlug,
  isValidProductSlug,
  isValidCategorySlug,
  SORT_OPTIONS,
} from '../../src/validators/products.js';

describe('UT-05: validators/products.js', () => {
  describe('validateProductQuery — defaults and valid inputs', () => {
    it('applies documented defaults on empty query', () => {
      const result = validateProductQuery({});
      assert.deepEqual(result, {
        page: 1,
        limit: 12,
        sort: 'featured',
      });
    });

    it('accepts valid page and limit boundary values', () => {
      const minBounds = validateProductQuery({ page: '1', limit: '1' });
      assert.equal(minBounds.page, 1);
      assert.equal(minBounds.limit, 1);

      const maxBounds = validateProductQuery({ page: '10000', limit: '48' });
      assert.equal(maxBounds.page, 10000);
      assert.equal(maxBounds.limit, 48);
    });

    it('accepts numeric integer values for page and limit', () => {
      const result = validateProductQuery({ page: 2, limit: 24 });
      assert.equal(result.page, 2);
      assert.equal(result.limit, 24);
    });

    it('accepts all documented sort options', () => {
      for (const sortOption of SORT_OPTIONS) {
        const result = validateProductQuery({ sort: sortOption });
        assert.equal(result.sort, sortOption);
      }
    });

    it('accepts a valid category slug', () => {
      const result = validateProductQuery({ category: 'lighting' });
      assert.equal(result.category, 'lighting');

      const resultMulti = validateProductQuery({ category: 'stands-risers' });
      assert.equal(resultMulti.category, 'stands-risers');
    });

    it('normalizes search query: trims and collapses inner whitespace', () => {
      const result = validateProductQuery({ search: '  felt   desk   mat  ' });
      assert.equal(result.search, 'felt desk mat');
    });

    it('treats whitespace-only or empty search as absent', () => {
      const emptyResult = validateProductQuery({ search: '' });
      assert.equal(emptyResult.search, undefined);

      const whitespaceResult = validateProductQuery({ search: '     ' });
      assert.equal(whitespaceResult.search, undefined);
    });

    it('accepts search string of exactly 80 characters', () => {
      const exact80 = 'a'.repeat(80);
      const result = validateProductQuery({ search: exact80 });
      assert.equal(result.search, exact80);
    });

    it('ignores unknown query parameters without throwing (Contract 4.1)', () => {
      const result = validateProductQuery({
        page: '2',
        unrecognizedParam: 'ignoreMe',
        anotherUnknown: '123',
      });
      assert.equal(result.page, 2);
      assert.equal(result.unrecognizedParam, undefined);
    });
  });

  describe('validateProductQuery — rejection of invalid inputs', () => {
    it('rejects repeated query parameters with 400 VALIDATION_ERROR (Contract 4.1, API-13)', () => {
      assert.throws(
        () => validateProductQuery({ sort: ['featured', 'price_asc'] }),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.ok(err.fields.sort);
          return true;
        },
      );

      assert.throws(
        () => validateProductQuery({ page: ['1', '2'] }),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.ok(err.fields.page);
          return true;
        },
      );
    });

    it('rejects invalid limit values (0, 49, negative, non-integer, strings) (API-06)', () => {
      const invalidLimits = ['0', '49', '-1', 'abc', '1.5', '1e2'];
      for (const lim of invalidLimits) {
        assert.throws(
          () => validateProductQuery({ limit: lim }),
          (err) => {
            assert.equal(err.status, 400);
            assert.equal(err.code, 'VALIDATION_ERROR');
            assert.ok(err.fields.limit, `Expected fields.limit for limit=${lim}`);
            return true;
          },
        );
      }
    });

    it('rejects invalid page values (0, 10001, negative, non-integer, strings)', () => {
      const invalidPages = ['0', '10001', '-1', 'xyz', '2.5'];
      for (const pg of invalidPages) {
        assert.throws(
          () => validateProductQuery({ page: pg }),
          (err) => {
            assert.equal(err.status, 400);
            assert.equal(err.code, 'VALIDATION_ERROR');
            assert.ok(err.fields.page, `Expected fields.page for page=${pg}`);
            return true;
          },
        );
      }
    });

    it('rejects invalid sort enum values (API-13)', () => {
      const invalidSorts = ['unknown', 'PRICE_ASC', 'random', '123'];
      for (const s of invalidSorts) {
        assert.throws(
          () => validateProductQuery({ sort: s }),
          (err) => {
            assert.equal(err.status, 400);
            assert.equal(err.code, 'VALIDATION_ERROR');
            assert.ok(err.fields.sort, `Expected fields.sort for sort=${s}`);
            return true;
          },
        );
      }
    });

    it('rejects malformed category slugs (API-11)', () => {
      const invalidCategories = ['Lighting', 'lighting_lamps', 'desk--mats', '-leading', 'trailing-', 'a'.repeat(61)];
      for (const cat of invalidCategories) {
        assert.throws(
          () => validateProductQuery({ category: cat }),
          (err) => {
            assert.equal(err.status, 400);
            assert.equal(err.code, 'VALIDATION_ERROR');
            assert.ok(err.fields.category, `Expected fields.category for category=${cat}`);
            return true;
          },
        );
      }
    });

    it('rejects search string longer than 80 characters', () => {
      const tooLong = 'a'.repeat(81);
      assert.throws(
        () => validateProductQuery({ search: tooLong }),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.ok(err.fields.search);
          return true;
        },
      );
    });
  });

  describe('Product and Category Slug Validators', () => {
    it('isValidProductSlug validates correct slug format', () => {
      assert.equal(isValidProductSlug('felt-desk-mat-charcoal'), true);
      assert.equal(isValidProductSlug('desk-lamp-1'), true);
      assert.equal(isValidProductSlug('item'), true);

      assert.equal(isValidProductSlug('Felt-Desk-Mat'), false);
      assert.equal(isValidProductSlug('desk_mat'), false);
      assert.equal(isValidProductSlug('desk--mat'), false);
      assert.equal(isValidProductSlug(''), false);
      assert.equal(isValidProductSlug(null), false);
      assert.equal(isValidProductSlug('a'.repeat(121)), false);
    });

    it('isValidCategorySlug validates correct slug format and 60 char limit', () => {
      assert.equal(isValidCategorySlug('desk-mats'), true);
      assert.equal(isValidCategorySlug('stands-risers'), true);
      assert.equal(isValidCategorySlug('a'.repeat(60)), true);

      assert.equal(isValidCategorySlug('Desk-Mats'), false);
      assert.equal(isValidCategorySlug('desk_mats'), false);
      assert.equal(isValidCategorySlug('a'.repeat(61)), false);
    });

    it('validateProductSlug throws 404 PRODUCT_NOT_FOUND on malformed slug (API-20)', () => {
      assert.throws(
        () => validateProductSlug('Invalid_Slug!'),
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(err.code, 'PRODUCT_NOT_FOUND');
          return true;
        },
      );

      assert.equal(validateProductSlug('valid-product-slug'), 'valid-product-slug');
    });
  });
});

