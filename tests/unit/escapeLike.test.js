/**
 * tests/unit/escapeLike.test.js
 *
 * UT-07: lib/escapeLike.js unit tests.
 *
 * - Percent, underscore, and the escape character are escaped.
 * - Normal text is unchanged.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeLike } from '../../src/lib/escapeLike.js';

describe('UT-07: lib/escapeLike.js', () => {
  it('leaves normal alphanumeric text unchanged', () => {
    assert.equal(escapeLike('desk mat'), 'desk mat');
    assert.equal(escapeLike('Deskline 2026'), 'Deskline 2026');
    assert.equal(escapeLike('walnut monitor stand'), 'walnut monitor stand');
  });

  it('escapes percent wildcard (%)', () => {
    assert.equal(escapeLike('50%'), '50\\%');
    assert.equal(escapeLike('%sale%'), '\\%sale\\%');
    assert.equal(escapeLike('100% genuine'), '100\\% genuine');
  });

  it('escapes underscore wildcard (_)', () => {
    assert.equal(escapeLike('item_1'), 'item\\_1');
    assert.equal(escapeLike('_prefix'), '\\_prefix');
    assert.equal(escapeLike('a_b_c'), 'a\\_b\\_c');
  });

  it('escapes backslash escape character (\\)', () => {
    assert.equal(escapeLike('path\\to\\item'), 'path\\\\to\\\\item');
    assert.equal(escapeLike('\\root'), '\\\\root');
  });

  it('escapes combinations of %, _, and \\ without double-escaping', () => {
    assert.equal(escapeLike('50%_off\\today'), '50\\%\\_off\\\\today');
    assert.equal(escapeLike('\\_%'), '\\\\\\_\\%');
    assert.equal(escapeLike('\\%\\_'), '\\\\\\%\\\\\\_');
  });

  it('handles empty and non-string inputs gracefully', () => {
    assert.equal(escapeLike(''), '');
    assert.equal(escapeLike(null), '');
    assert.equal(escapeLike(undefined), '');
    assert.equal(escapeLike(123), '');
  });
});

