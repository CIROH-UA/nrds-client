import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PEEK_FALLBACK_PX,
  SHEET_MAX_PX,
  isSheetWidth,
  peekFor,
  sheetDataState,
} from './breakpoints.js';

test('isSheetWidth is true at or below the 768px breakpoint', () => {
  assert.equal(SHEET_MAX_PX, 768);
  assert.equal(isSheetWidth(320), true);
  assert.equal(isSheetWidth(768), true);
  assert.equal(isSheetWidth(769), false);
  assert.equal(isSheetWidth(1200), false);
});

test('sheetDataState maps open/collapsed to the body[data-sheet] value', () => {
  assert.equal(sheetDataState({ open: false, collapsed: false }), 'closed');
  assert.equal(sheetDataState({ open: false, collapsed: true }), 'closed');
  assert.equal(sheetDataState({ open: true, collapsed: false }), 'expanded');
  assert.equal(sheetDataState({ open: true, collapsed: true }), 'collapsed');
});

test('sheetDataState defaults to closed with no argument', () => {
  assert.equal(sheetDataState(), 'closed');
  assert.equal(sheetDataState({}), 'closed');
});

test('peekFor keeps at least the measured row (plus padding) on screen', () => {
  const peek = peekFor({ rowHeight: 120, paddingTop: 10, sheetHeight: 600 });
  assert.equal(peek, Math.ceil(120 + 10 + 8));
});

test('peekFor falls back to the default peek when the row is small', () => {
  assert.equal(peekFor({ rowHeight: 10, paddingTop: 0, sheetHeight: 600 }), PEEK_FALLBACK_PX);
});

test('peekFor never exceeds the sheet height', () => {
  assert.equal(peekFor({ rowHeight: 400, paddingTop: 0, sheetHeight: 200 }), 200);
  assert.equal(peekFor({ rowHeight: 10, paddingTop: 0, sheetHeight: 40 }), 40);
});

test('peekFor tolerates missing measurements', () => {
  assert.equal(peekFor(), 0);
  assert.equal(peekFor({}), 0);
});
