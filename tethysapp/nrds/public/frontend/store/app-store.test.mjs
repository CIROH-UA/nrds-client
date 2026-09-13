import { test } from 'node:test';
import assert from 'node:assert/strict';

/** A minimal element that records the attributes the theme signal writes to the document root. */
function makeElement() {
  const attrs = new Map();
  return {
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
  };
}

/** A minimal localStorage backed by a Map. */
function makeStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

const documentElement = makeElement();
globalThis.document = { documentElement };
globalThis.window = {
  localStorage: makeStorage({ 'nrds-theme': 'dark' }),
  matchMedia: () => ({ matches: false, addEventListener() {} }),
};
globalThis.localStorage = globalThis.window.localStorage;
globalThis.matchMedia = globalThis.window.matchMedia;

const { store, actions } = await import('./app-store.js');

test('theme seeds from localStorage and toggle flips data-theme and the effective theme', () => {
  assert.equal(store.get().theme.preference, 'dark');
  assert.equal(store.get().theme.theme, 'dark');
  assert.equal(documentElement.getAttribute('data-theme'), 'dark');

  actions.toggle();
  assert.equal(store.get().theme.theme, 'light');
  assert.equal(documentElement.getAttribute('data-theme'), 'light');

  actions.toggle();
  assert.equal(store.get().theme.theme, 'dark');
  assert.equal(documentElement.getAttribute('data-theme'), 'dark');

  actions.setPreference('system');
  assert.equal(store.get().theme.preference, 'system');
  assert.equal(store.get().theme.theme, 'light');
  assert.equal(documentElement.getAttribute('data-theme'), null);
});

test('VPU LRU evicts the least-recently-used variable at the cap of 3', () => {
  actions.resetVPU();

  actions.setVarData('a', new Float32Array([1]));
  actions.setVarData('b', new Float32Array([2]));
  actions.setVarData('c', new Float32Array([3]));
  actions.setVarData('d', new Float32Array([4]));

  let vpu = store.get().vpu;
  assert.deepEqual(vpu.varDataOrder, ['b', 'c', 'd']);
  assert.equal(actions.getVarData('a'), undefined);
  assert.ok(actions.getVarData('d'));

  actions.setVarData('b', new Float32Array([22]));
  actions.setVarData('e', new Float32Array([5]));

  vpu = store.get().vpu;
  assert.deepEqual(vpu.varDataOrder, ['d', 'b', 'e']);
  assert.equal(actions.getVarData('c'), undefined);
  assert.ok(actions.getVarData('b'));
  assert.ok(actions.getVarData('e'));
});

test('setAnimationIndex builds the flat index with wb- aliases', () => {
  actions.resetVPU();
  actions.setAnimationIndex(['101', '202'], [0, 3600000]);
  const { featureIdToIndex } = store.get().vpu;
  assert.equal(featureIdToIndex['101'], 0);
  assert.equal(featureIdToIndex['wb-101'], 0);
  assert.equal(featureIdToIndex['202'], 1);
  assert.equal(featureIdToIndex['wb-202'], 1);
});

test('the animation index clamps when the series shrinks', () => {
  actions.resetVPU();
  actions.reset_timeseries();

  actions.set_series([{ time: 0 }, { time: 1 }, { time: 2 }, { time: 3 }, { time: 4 }]);
  actions.setCurrentTimeIndex(3);
  assert.equal(store.get().timeseries.currentTimeIndex, 3);

  actions.set_series([{ time: 0 }, { time: 1 }]);
  assert.equal(store.get().timeseries.currentTimeIndex, 1);
});

test('stepForward and stepBackward wrap exactly as the source does', () => {
  actions.resetVPU();
  actions.reset_timeseries();

  actions.set_series([{ time: 0 }, { time: 1 }, { time: 2 }]);
  actions.setCurrentTimeIndex(2);

  actions.stepForward();
  assert.equal(store.get().timeseries.currentTimeIndex, 0);

  actions.stepBackward();
  assert.equal(store.get().timeseries.currentTimeIndex, 2);

  actions.stepForward();
  assert.equal(store.get().timeseries.currentTimeIndex, 0);
});

test('setCurrentTimeIndex clamps to the VPU-driven step count', () => {
  actions.resetVPU();
  actions.reset_timeseries();
  actions.set_series([{ time: 0 }]);
  actions.setAnimationIndex(['a', 'b'], [0, 3600000, 7200000]);

  actions.setCurrentTimeIndex(99);
  assert.equal(store.get().timeseries.currentTimeIndex, 2);
});

test('hiding the flowpaths stops playback', () => {
  actions.resetVPU();
  actions.reset_timeseries();
  actions.set_flowpaths_visibility(true);
  actions.setAnimationIndex(['a'], [0, 3600000]);

  actions.toggleIsPlaying();
  assert.equal(store.get().timeseries.isPlaying, true);

  actions.set_flowpaths_visibility(false);
  assert.equal(store.get().timeseries.isPlaying, false);
});

test('emptying the VPU times stops playback', () => {
  actions.resetVPU();
  actions.reset_timeseries();
  actions.set_flowpaths_visibility(true);
  actions.setAnimationIndex(['a'], [0, 3600000]);

  actions.toggleIsPlaying();
  assert.equal(store.get().timeseries.isPlaying, true);

  actions.setAnimationIndex([], []);
  assert.equal(store.get().timeseries.isPlaying, false);
});

test('set_vpu teardown stops playback, drops VPU arrays, and runs registered cancellers', () => {
  actions.resetVPU();
  actions.reset_timeseries();
  actions.set_flowpaths_visibility(true);
  actions.setAnimationIndex(['a'], [0, 3600000]);
  actions.setVarData('flow', new Float32Array([1, 2]));
  actions.toggleIsPlaying();

  let cancelled = 0;
  const unregister = actions.registerVpuCanceller(() => {
    cancelled += 1;
  });

  actions.set_vpu('16');

  assert.equal(cancelled, 1);
  assert.equal(store.get().timeseries.isPlaying, false);
  assert.equal(store.get().datastream.vpu, '16');
  assert.deepEqual(store.get().vpu.times, []);
  assert.deepEqual(store.get().vpu.featureIds, []);
  assert.deepEqual(store.get().vpu.varDataOrder, []);

  unregister();
});

test('selection identity guard drops an unchanged feature but keeps a null-keyed one', () => {
  actions.set_selected_feature(null);

  const first = { _id: 'cat-1', name: 'first' };
  actions.set_selected_feature(first);
  assert.equal(store.get().feature.selected_feature, first);

  const sameKey = { _id: 'cat-1', name: 'second' };
  actions.set_selected_feature(sameKey);
  assert.equal(store.get().feature.selected_feature, first);

  const noKey = { name: 'unidentifiable' };
  actions.set_selected_feature(noKey);
  assert.equal(store.get().feature.selected_feature, noKey);
});
