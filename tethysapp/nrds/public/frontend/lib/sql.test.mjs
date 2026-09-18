import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sqlIdent, sqlStr } from './sql.js';

test('sqlIdent wraps in double quotes', () => {
  assert.equal(sqlIdent('feature_id'), '"feature_id"');
});

test('sqlIdent doubles embedded double quotes', () => {
  assert.equal(sqlIdent('a"b'), '"a""b"');
});

test('sqlIdent coerces non-strings', () => {
  assert.equal(sqlIdent(42), '"42"');
});

test('sqlStr wraps in single quotes', () => {
  assert.equal(sqlStr('hello'), "'hello'");
});

test('sqlStr doubles embedded single quotes', () => {
  assert.equal(sqlStr("O'Brien"), "'O''Brien'");
});

test('sqlStr coerces non-strings', () => {
  assert.equal(sqlStr(7), "'7'");
});
