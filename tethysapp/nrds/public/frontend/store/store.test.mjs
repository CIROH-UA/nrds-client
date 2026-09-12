import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from './store.js';

test('get returns a shallow copy, not the live state', () => {
  const store = createStore({ a: 1 });
  const first = store.get();
  first.a = 99;
  assert.equal(store.get().a, 1);
});

test('set shallow-merges the patch', () => {
  const store = createStore({ a: 1, b: 2 });
  store.set({ b: 3 });
  assert.deepEqual(store.get(), { a: 1, b: 3 });
});

test('set notifies every subscriber with the new state', () => {
  const store = createStore({ n: 0 });
  const seen = [];
  store.subscribe((s) => seen.push(s.n));
  store.set({ n: 1 });
  store.set({ n: 2 });
  assert.deepEqual(seen, [1, 2]);
});

test('subscribe returns a working unsubscribe', () => {
  const store = createStore({ n: 0 });
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  store.set({ n: 1 });
  off();
  store.set({ n: 2 });
  assert.equal(calls, 1);
});

test('a subscriber unsubscribing during notification does not skip a sibling', () => {
  const store = createStore({ n: 0 });
  let bCalls = 0;
  const offA = store.subscribe(() => offA());
  store.subscribe(() => { bCalls += 1; });
  store.set({ n: 1 });
  assert.equal(bCalls, 1);
});
