/**
 * tests/unit/safe-redirect.test.js
 *
 * UT-10: public/js/safe-redirect.js
 * Accepts /cart, /checkout; rejects //evil.com, https://evil.com, /\evil,
 * javascript:alert(1), paths with control characters, unknown paths, non-strings.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirect, isSafeRedirect } from '../../public/js/safe-redirect.js';

describe('UT-10: safe-redirect.js', () => {
  it('accepts legitimate local paths (/cart, /checkout, /, /shop, /orders)', () => {
    assert.strictEqual(isSafeRedirect('/cart'), true);
    assert.strictEqual(isSafeRedirect('/checkout'), true);
    assert.strictEqual(isSafeRedirect('/'), true);
    assert.strictEqual(isSafeRedirect('/shop'), true);
    assert.strictEqual(isSafeRedirect('/order'), true);
    assert.strictEqual(isSafeRedirect('/orders'), true);
    assert.strictEqual(isSafeRedirect('/login'), true);
    assert.strictEqual(isSafeRedirect('/register'), true);

    assert.strictEqual(safeRedirect('/cart'), '/cart');
    assert.strictEqual(safeRedirect('/checkout'), '/checkout');
    assert.strictEqual(safeRedirect('/order?id=DL-100001'), '/order?id=DL-100001');
  });

  it('accepts valid paths with query parameters', () => {
    assert.strictEqual(isSafeRedirect('/shop?search=stand'), true);
    assert.strictEqual(isSafeRedirect('/product?slug=felt-desk-mat'), true);
    assert.strictEqual(isSafeRedirect('/order?id=42'), true);
    assert.strictEqual(isSafeRedirect('/order?id=DL-100001&source=history'), true);
    assert.strictEqual(safeRedirect('/shop?search=stand'), '/shop?search=stand');
    assert.strictEqual(safeRedirect('/order?id=42'), '/order?id=42');
  });

  it('rejects protocol-relative URLs (//evil.com)', () => {
    assert.strictEqual(isSafeRedirect('//evil.com'), false);
    assert.strictEqual(isSafeRedirect('//google.com/test'), false);
    assert.strictEqual(safeRedirect('//evil.com'), '/');
  });

  it('rejects external protocol URLs (https://evil.com, http://evil.com)', () => {
    assert.strictEqual(isSafeRedirect('https://evil.com'), false);
    assert.strictEqual(isSafeRedirect('http://evil.com/cart'), false);
    assert.strictEqual(safeRedirect('https://evil.com'), '/');
  });

  it('rejects backslash bypasses (/\\evil, \\evil.com)', () => {
    assert.strictEqual(isSafeRedirect('/\\evil.com'), false);
    assert.strictEqual(isSafeRedirect('\\evil.com'), false);
    assert.strictEqual(isSafeRedirect('/cart\\test'), false);
    assert.strictEqual(safeRedirect('/\\evil'), '/');
  });

  it('rejects javascript: and data: schemes', () => {
    assert.strictEqual(isSafeRedirect('javascript:alert(1)'), false);
    assert.strictEqual(isSafeRedirect('data:text/html,<script>alert(1)</script>'), false);
    assert.strictEqual(safeRedirect('javascript:alert(1)'), '/');
  });

  it('rejects paths with control characters or whitespace', () => {
    assert.strictEqual(isSafeRedirect('/cart\r\nSet-Cookie:admin=true'), false);
    assert.strictEqual(isSafeRedirect('/cart\x00'), false);
    assert.strictEqual(isSafeRedirect('/cart evil'), false);
    assert.strictEqual(safeRedirect('/cart\x00'), '/');
  });

  it('rejects unknown or arbitrary paths outside the application', () => {
    assert.strictEqual(isSafeRedirect('/admin'), false);
    assert.strictEqual(isSafeRedirect('/unknown-path'), false);
    assert.strictEqual(isSafeRedirect('/etc/passwd'), false);
    assert.strictEqual(safeRedirect('/admin'), '/');
  });

  it('rejects non-strings, null, undefined, empty strings, and objects', () => {
    assert.strictEqual(isSafeRedirect(null), false);
    assert.strictEqual(isSafeRedirect(undefined), false);
    assert.strictEqual(isSafeRedirect(123), false);
    assert.strictEqual(isSafeRedirect({}), false);
    assert.strictEqual(isSafeRedirect(''), false);

    assert.strictEqual(safeRedirect(null), '/');
    assert.strictEqual(safeRedirect(undefined), '/');
    assert.strictEqual(safeRedirect(123), '/');
    assert.strictEqual(safeRedirect(''), '/');
  });

  it('respects a custom fallback if provided and valid', () => {
    assert.strictEqual(safeRedirect('//evil.com', '/shop'), '/shop');
    // If custom fallback is also invalid, defaults to '/'
    assert.strictEqual(safeRedirect('//evil.com', '//bad-fallback.com'), '/');
  });
});

