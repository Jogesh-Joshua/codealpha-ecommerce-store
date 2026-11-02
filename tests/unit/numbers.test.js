/**
 * tests/unit/numbers.test.js
 *
 * UT-13: numerical boundary serialisation helpers (src/lib/numbers.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toSafeMinor, toSafeCount } from '../../src/lib/numbers.js';

describe('UT-13: toSafeMinor and toSafeCount', () => {
  const validInputs = [
    { input: 0, expected: 0 },
    { input: '0', expected: 0 },
    { input: 549700, expected: 549700 },
    { input: '549700', expected: 549700 },
    { input: 9007199254740991, expected: 9007199254740991 },
    { input: '9007199254740991', expected: 9007199254740991 },
  ];

  const invalidInputs = [
    -1,
    '-1',
    1.5,
    '1.5',
    '1e3',
    ' 12',
    '012',
    '',
    null,
    undefined,
    NaN,
    Infinity,
    'Infinity',
    9007199254740992,
    '9007199254740992',
    true,
    false,
    {},
    [],
    { value: 100 },
    [100],
  ];

  describe('toSafeMinor', () => {
    for (const { input, expected } of validInputs) {
      it(`accepts valid value: ${JSON.stringify(input)} (${typeof input})`, () => {
        assert.equal(toSafeMinor(input, 'subtotalMinor'), expected);
      });
    }

    for (const bad of invalidInputs) {
      it(`rejects invalid value: ${JSON.stringify(bad)} (${typeof bad})`, () => {
        assert.throws(
          () => toSafeMinor(bad, 'priceMinor'),
          (err) => {
            assert.equal(err.code, 'INVALID_MONEY_VALUE');
            assert.ok(err.message.includes('priceMinor'));
            if (bad !== null && bad !== undefined && typeof bad !== 'object') {
              const strVal = String(bad);
              if (strVal.length > 0) {
                assert.ok(
                  !err.message.includes(strVal),
                  `Error message must not contain the bad value: ${strVal}`,
                );
              }
            }
            return true;
          },
        );
      });
    }
  });

  describe('toSafeCount', () => {
    for (const { input, expected } of validInputs) {
      it(`accepts valid value: ${JSON.stringify(input)} (${typeof input})`, () => {
        assert.equal(toSafeCount(input, 'itemCount'), expected);
      });
    }

    for (const bad of invalidInputs) {
      it(`rejects invalid value: ${JSON.stringify(bad)} (${typeof bad})`, () => {
        assert.throws(
          () => toSafeCount(bad, 'quantity'),
          (err) => {
            assert.equal(err.code, 'INVALID_COUNT_VALUE');
            assert.ok(err.message.includes('quantity'));
            if (bad !== null && bad !== undefined && typeof bad !== 'object') {
              const strVal = String(bad);
              if (strVal.length > 0) {
                assert.ok(
                  !err.message.includes(strVal),
                  `Error message must not contain the bad value: ${strVal}`,
                );
              }
            }
            return true;
          },
        );
      });
    }
  });
});

