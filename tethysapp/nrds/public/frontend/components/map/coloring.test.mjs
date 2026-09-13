import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  valueToBin,
  widthFactor,
  reachIdOf,
  frameStates,
  changedStates,
  colorMatchExpression,
  widthExpression,
  NODATA_BIN,
  UNSET_BIN,
} from './coloring.js';
import { NO_DATA_VALUE } from '../../lib/valueRamp.js';

// A near-linear bounds: a curve this small makes normalizeValue's log1p mapping effectively linear,
// so a value's fraction of the 0..100 span lands it in a predictable ramp bucket.
const LINEAR_BOUNDS = { min: 0, max: 100, curve: 1e-9 };
const CLASSES = 6;

test('valueToBin puts a value from each bucket in the matching ramp class', () => {
  // Six equal buckets over 0..100: [0,16.7) -> 1, [16.7,33.3) -> 2, ... [83.3,100] -> 6.
  assert.equal(valueToBin(5, LINEAR_BOUNDS, CLASSES), 1);
  assert.equal(valueToBin(25, LINEAR_BOUNDS, CLASSES), 2);
  assert.equal(valueToBin(45, LINEAR_BOUNDS, CLASSES), 3);
  assert.equal(valueToBin(60, LINEAR_BOUNDS, CLASSES), 4);
  assert.equal(valueToBin(75, LINEAR_BOUNDS, CLASSES), 5);
  assert.equal(valueToBin(95, LINEAR_BOUNDS, CLASSES), 6);
});

test('valueToBin clamps the top of the range into the last class', () => {
  assert.equal(valueToBin(100, LINEAR_BOUNDS, CLASSES), CLASSES);
  assert.equal(valueToBin(1000, LINEAR_BOUNDS, CLASSES), CLASSES);
});

test('valueToBin maps every kind of missing value to bin 0', () => {
  assert.equal(valueToBin(null, LINEAR_BOUNDS, CLASSES), NODATA_BIN);
  assert.equal(valueToBin(undefined, LINEAR_BOUNDS, CLASSES), NODATA_BIN);
  assert.equal(valueToBin(NO_DATA_VALUE, LINEAR_BOUNDS, CLASSES), NODATA_BIN);
  assert.equal(valueToBin(NO_DATA_VALUE - 1, LINEAR_BOUNDS, CLASSES), NODATA_BIN);
  assert.equal(valueToBin(NaN, LINEAR_BOUNDS, CLASSES), NODATA_BIN);
});

test('widthFactor is the normalized position for a value and 0 for no data', () => {
  assert.equal(widthFactor(NO_DATA_VALUE, LINEAR_BOUNDS), 0);
  assert.equal(widthFactor(null, LINEAR_BOUNDS), 0);
  const wf = widthFactor(50, LINEAR_BOUNDS);
  assert.ok(wf > 0 && wf < 1);
});

test('reachIdOf yields the numeric divide id from either an id number or a wb- string', () => {
  assert.equal(reachIdOf(12345), 12345);
  assert.equal(reachIdOf('12345'), 12345);
  assert.equal(reachIdOf('wb-12345'), 12345);
});

test('frameStates reads each reach value by its index and quantises it', () => {
  // Two reaches, two times, flat ordered (feature_id, time): [f0t0, f0t1, f1t0, f1t1].
  const values = [5, 95, NO_DATA_VALUE, 45];
  const featureIds = [10, 20];
  const featureIdToIndex = { 10: 0, 20: 1 };

  const t0 = frameStates({
    values,
    numTimes: 2,
    timeIndex: 0,
    featureIds,
    featureIdToIndex,
    bounds: LINEAR_BOUNDS,
    classes: CLASSES,
  });
  assert.deepEqual(t0.get(10), { bin: 1, wf: widthFactor(5, LINEAR_BOUNDS) });
  assert.deepEqual(t0.get(20), { bin: NODATA_BIN, wf: 0 });

  const t1 = frameStates({
    values,
    numTimes: 2,
    timeIndex: 1,
    featureIds,
    featureIdToIndex,
    bounds: LINEAR_BOUNDS,
    classes: CLASSES,
  });
  assert.equal(t1.get(10).bin, 6);
  assert.equal(t1.get(20).bin, 3);
});

const mkStates = (obj) => new Map(Object.entries(obj).map(([id, bin]) => [id, { bin, wf: 0 }]));

test('changedStates reports every reach on the first paint', () => {
  const next = mkStates({ a: 1, b: 2, c: 3 });
  const changed = changedStates(new Map(), next);
  assert.deepEqual(
    changed.map((c) => c.id).sort(),
    ['a', 'b', 'c']
  );
});

test('changedStates reports nothing when no bin moved', () => {
  const prev = mkStates({ a: 1, b: 2 });
  const next = mkStates({ a: 1, b: 2 });
  assert.deepEqual(changedStates(prev, next), []);
});

test('changedStates reports only the reaches whose bin changed or are new', () => {
  const prev = mkStates({ a: 1, b: 2 });
  const next = mkStates({ a: 3, b: 2, c: 1 });
  const changed = changedStates(prev, next);
  assert.deepEqual(
    changed.map((c) => c.id).sort(),
    ['a', 'c']
  );
  assert.equal(changed.find((c) => c.id === 'a').bin, 3);
  assert.equal(changed.find((c) => c.id === 'c').bin, 1);
});

test('colorMatchExpression maps unset to base, bin 0 to grey, and each bin to its ramp stop', () => {
  const ramp = [
    [1, 2, 3],
    [4, 5, 6],
  ];
  const expr = colorMatchExpression(ramp, '#000000');
  assert.equal(expr[0], 'match');
  assert.deepEqual(expr[1], ['coalesce', ['feature-state', 'bin'], UNSET_BIN]);
  // input, [coalesce], UNSET->base, 0->grey, 1->ramp0, 2->ramp1, default.
  assert.equal(expr[2], UNSET_BIN);
  assert.equal(expr[3], '#000000');
  assert.equal(expr[4], NODATA_BIN);
  assert.equal(expr[6], 1);
  assert.equal(expr[7], 'rgb(1, 2, 3)');
  assert.equal(expr[8], 2);
  assert.equal(expr[9], 'rgb(4, 5, 6)');
  assert.equal(expr[expr.length - 1], '#000000');
});

test('widthExpression multiplies a zoom curve by a feature-state factor', () => {
  const expr = widthExpression([[2, 0.6], [10, 2]]);
  assert.equal(expr[0], '*');
  assert.deepEqual(expr[1], ['interpolate', ['linear'], ['zoom'], 2, 0.6, 10, 2]);
  assert.equal(expr[2][0], 'match');
});
