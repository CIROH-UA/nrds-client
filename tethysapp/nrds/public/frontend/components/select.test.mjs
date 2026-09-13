import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toOptions, valueOf, optionIndexOf, moveIndex, typeAheadIndex } from './select.js';

test('toOptions turns bare strings into { value, label } pairs', () => {
  assert.deepEqual(toOptions(['flow', 'velocity']), [
    { value: 'flow', label: 'flow' },
    { value: 'velocity', label: 'velocity' },
  ]);
});

test('toOptions keeps object options and fills a missing label from the value', () => {
  assert.deepEqual(toOptions([{ value: 1, label: 'One' }, { value: 2 }]), [
    { value: 1, label: 'One' },
    { value: 2, label: '2' },
  ]);
});

test('toOptions returns an empty array for a non-array', () => {
  assert.deepEqual(toOptions(null), []);
  assert.deepEqual(toOptions(undefined), []);
});

test('valueOf unwraps an option object but passes a bare value through', () => {
  assert.equal(valueOf({ value: 'flow', label: 'flow' }), 'flow');
  assert.equal(valueOf('flow'), 'flow');
  assert.equal(valueOf(3), 3);
});

test('optionIndexOf finds by value, whether given a value or an option', () => {
  const opts = toOptions(['a', 'b', 'c']);
  assert.equal(optionIndexOf(opts, 'b'), 1);
  assert.equal(optionIndexOf(opts, { value: 'c' }), 2);
});

test('optionIndexOf returns -1 for an absent or empty value', () => {
  const opts = toOptions(['a', 'b']);
  assert.equal(optionIndexOf(opts, 'z'), -1);
  assert.equal(optionIndexOf(opts, null), -1);
  assert.equal(optionIndexOf(opts, undefined), -1);
});

test('moveIndex clamps within range and does not wrap', () => {
  assert.equal(moveIndex(0, -1, 3), 0);
  assert.equal(moveIndex(2, 1, 3), 2);
  assert.equal(moveIndex(1, 1, 3), 2);
  assert.equal(moveIndex(1, -1, 3), 0);
});

test('moveIndex from nothing active lands on an end depending on direction', () => {
  assert.equal(moveIndex(-1, 1, 3), 0);
  assert.equal(moveIndex(-1, -1, 3), 2);
});

test('moveIndex returns -1 for an empty list', () => {
  assert.equal(moveIndex(0, 1, 0), -1);
});

test('typeAheadIndex finds the next label starting with the buffer, wrapping', () => {
  const opts = toOptions(['alpha', 'beta', 'bravo', 'gamma']);
  // From alpha, "b" reaches beta.
  assert.equal(typeAheadIndex(opts, 'b', 0), 1);
  // From beta, "b" reaches bravo (searches after the current index).
  assert.equal(typeAheadIndex(opts, 'b', 1), 2);
  // From bravo, "b" wraps back to beta.
  assert.equal(typeAheadIndex(opts, 'b', 2), 1);
});

test('typeAheadIndex is case-insensitive and matches multi-character buffers', () => {
  const opts = toOptions(['Flow', 'Velocity', 'Depth']);
  assert.equal(typeAheadIndex(opts, 'vel', -1), 1);
  assert.equal(typeAheadIndex(opts, 'DEP', 0), 2);
});

test('typeAheadIndex can re-match the current option (a stuck key)', () => {
  const opts = toOptions(['flow', 'velocity']);
  assert.equal(typeAheadIndex(opts, 'f', 0), 0);
});

test('typeAheadIndex returns -1 when nothing matches or the buffer is empty', () => {
  const opts = toOptions(['flow', 'velocity']);
  assert.equal(typeAheadIndex(opts, 'z', 0), -1);
  assert.equal(typeAheadIndex(opts, '', 0), -1);
  assert.equal(typeAheadIndex([], 'f', 0), -1);
});
