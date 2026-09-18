import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  beginSelection,
  isCurrentSelection,
  cancelSelections,
} from './selectionGeneration.js';

test('the newest selection is the current one and older ones are superseded', () => {
  const older = beginSelection();
  assert.equal(isCurrentSelection(older), true);

  const newer = beginSelection();
  assert.equal(newer > older, true);
  assert.equal(isCurrentSelection(older), false);
  assert.equal(isCurrentSelection(newer), true);
});

test('cancelSelections supersedes the in-flight chain', () => {
  const ticket = beginSelection();
  assert.equal(isCurrentSelection(ticket), true);
  cancelSelections();
  assert.equal(isCurrentSelection(ticket), false);
});
