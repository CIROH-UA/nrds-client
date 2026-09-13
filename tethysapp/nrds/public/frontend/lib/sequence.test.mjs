import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSequence } from './sequence.js';

test('createSequence hands out rising tickets, only the latest current', () => {
  const seq = createSequence();
  const a = seq.next();
  const b = seq.next();
  assert.equal(b > a, true);
  assert.equal(seq.isCurrent(a), false);
  assert.equal(seq.isCurrent(b), true);
});

test('separate sequences count independently', () => {
  const one = createSequence();
  const two = createSequence();
  one.next();
  const t = two.next();
  assert.equal(two.isCurrent(t), true);
  assert.equal(one.isCurrent(t), true);
});
