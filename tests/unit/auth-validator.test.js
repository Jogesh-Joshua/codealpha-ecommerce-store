/**
 * tests/unit/auth-validator.test.js
 *
 * UT-04: validators/auth.js unit tests (§4.7, §6.2, SEC-09, UT-04).
 *
 * Must verify:
 * - Email trimmed and lower-cased.
 * - Invalid emails rejected.
 * - Name rules (1..80, trimmed, no control chars).
 * - Password rules (7 characters fails, 8 passes, 72 bytes passes, 73 fails, equals email fails).
 * - Unknown fields rejected (strict schema).
 * - Login validation rules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRegister,
  validateLogin,
} from '../../src/validators/auth.js';

describe('UT-04: validators/auth.js', () => {
  describe('validateRegister — valid inputs & normalization', () => {
    it('normalizes valid input (trims name, trims and lowercases email)', () => {
      const result = validateRegister({
        name: '   Jane Doe   ',
        email: '   Jane.DOE@Example.COM   ',
        password: 'ValidPassword123!',
      });

      assert.deepEqual(result, {
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        password: 'ValidPassword123!',
      });
    });

    it('accepts password of exactly 8 characters', () => {
      const result = validateRegister({
        name: 'Alex Morgan',
        email: 'alex@example.com',
        password: '12345678',
      });
      assert.equal(result.password, '12345678');
    });

    it('accepts password of exactly 72 UTF-8 bytes', () => {
      const pass72 = 'a'.repeat(72);
      const result = validateRegister({
        name: 'Alex Morgan',
        email: 'alex@example.com',
        password: pass72,
      });
      assert.equal(result.password, pass72);
    });
  });

  describe('validateRegister — field rejection rules', () => {
    it('rejects password shorter than 8 characters (7 chars fails, 8 passes)', () => {
      assert.throws(
        () => {
          validateRegister({
            name: 'Alex Morgan',
            email: 'alex@example.com',
            password: '1234567',
          });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.equal(err.fields.password, 'Use at least 8 characters.');
          return true;
        }
      );
    });

    it('rejects password longer than 72 UTF-8 bytes (73 fails)', () => {
      const pass73 = 'a'.repeat(73);
      assert.throws(
        () => {
          validateRegister({
            name: 'Alex Morgan',
            email: 'alex@example.com',
            password: pass73,
          });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.equal(err.fields.password, 'Use 72 characters or fewer.');
          return true;
        }
      );
    });

    it('rejects multi-byte password exceeding 72 UTF-8 bytes', () => {
      // Euro sign '€' is 3 bytes: 24 * 3 + 1 = 73 bytes
      const pass73Multi = '€'.repeat(24) + '!';
      assert.throws(
        () => {
          validateRegister({
            name: 'Alex Morgan',
            email: 'alex@example.com',
            password: pass73Multi,
          });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.equal(err.fields.password, 'Use 72 characters or fewer.');
          return true;
        }
      );
    });

    it('rejects password equal to email (exact and case-insensitive)', () => {
      assert.throws(
        () => {
          validateRegister({
            name: 'Alex Morgan',
            email: 'alex.morgan@example.com',
            password: 'alex.morgan@example.com',
          });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.equal(err.fields.password, 'Password cannot equal email.');
          return true;
        }
      );

      assert.throws(
        () => {
          validateRegister({
            name: 'Alex Morgan',
            email: 'ALEX@example.com',
            password: 'alex@example.com',
          });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.equal(err.fields.password, 'Password cannot equal email.');
          return true;
        }
      );
    });

    it('rejects invalid names (empty, whitespace-only, >80 chars, control characters)', () => {
      const invalidNames = ['', '   ', 'a'.repeat(81), 'Alex\x00Morgan', 'Jane\nDoe'];
      for (const name of invalidNames) {
        assert.throws(
          () => {
            validateRegister({
              name,
              email: 'valid@example.com',
              password: 'ValidPassword123!',
            });
          },
          (err) => {
            assert.equal(err.status, 400);
            assert.equal(err.fields.name, 'Enter your name.');
            return true;
          }
        );
      }
    });

    it('rejects invalid email formats', () => {
      const invalidEmails = ['', 'notanemail', '@example.com', 'user@', 'user@domain', 'a'.repeat(255)];
      for (const email of invalidEmails) {
        assert.throws(
          () => {
            validateRegister({
              name: 'Valid Name',
              email,
              password: 'ValidPassword123!',
            });
          },
          (err) => {
            assert.equal(err.status, 400);
            assert.equal(err.fields.email, 'Enter a valid email address, like name@example.com.');
            return true;
          }
        );
      }
    });

    it('rejects unknown fields (confirmPassword, role, isAdmin, etc.)', () => {
      assert.throws(
        () => {
          validateRegister({
            name: 'Valid Name',
            email: 'valid@example.com',
            password: 'ValidPassword123!',
            confirmPassword: 'ValidPassword123!',
            role: 'admin',
            isAdmin: true,
          });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.ok(err.fields.confirmPassword);
          assert.ok(err.fields.role);
          assert.ok(err.fields.isAdmin);
          return true;
        }
      );
    });
  });

  describe('validateLogin — rules and normalization', () => {
    it('normalizes valid login input', () => {
      const result = validateLogin({
        email: '   User@Example.COM   ',
        password: 'AnyPasswordSecret',
      });
      assert.deepEqual(result, {
        email: 'user@example.com',
        password: 'AnyPasswordSecret',
      });
    });

    it('rejects missing or empty email/password without revealing password rules', () => {
      assert.throws(
        () => {
          validateLogin({});
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.equal(err.fields.email, 'Enter a valid email address, like name@example.com.');
          assert.equal(err.fields.password, 'Enter your password.');
          return true;
        }
      );
    });

    it('rejects unknown fields in login body', () => {
      assert.throws(
        () => {
          validateLogin({
            email: 'user@example.com',
            password: 'SecretPassword',
            rememberMe: true,
          });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.ok(err.fields.rememberMe);
          return true;
        }
      );
    });
  });
});

