import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SCALE,
  SCALE_OPTIONS,
  SCALE_LABELS,
  jenksBreaks,
  quantileOf,
  scaleTransform,
  scaledBounds,
  strictlyIncreasing,
} from './colorScale.js';
import { normalizeValue } from './flowpathValues.js';
import { LIGHT_RAMP, writeColorInto } from './valueRamp.js';

const closeTo = (actual, expected, digits) =>
  assert.ok(
    Math.abs(actual - expected) < 0.5 * 10 ** -digits,
    `expected ${actual} to be within ${digits} digits of ${expected}`
  );

test('the scale catalogue defaults to linear, the scale the rest of the suite assumes', () => {
  assert.equal(DEFAULT_SCALE, 'linear');
  assert.equal(SCALE_OPTIONS[0].value, 'linear');
});

test('the scale catalogue offers exactly the seven scales the selector lists', () => {
  assert.deepEqual(SCALE_OPTIONS.map((o) => o.value), [
    'linear',
    'log',
    'sqrt',
    'cbrt',
    'symlog',
    'quantile',
    'jenks',
  ]);
});

test('the scale catalogue names every scale for the legend, linear being the empty one', () => {
  assert.equal(SCALE_LABELS.linear, '');
  SCALE_OPTIONS.slice(1).forEach((o) => assert.ok(SCALE_LABELS[o.value]));
});

test('sqrt maps a quarter of the range to the middle', () => {
  closeTo(scaleTransform(25, { scale: 'sqrt', min: 0, max: 100 }), 0.5, 10);
});

test('cbrt maps an eighth of the range to the middle', () => {
  closeTo(scaleTransform(12.5, { scale: 'cbrt', min: 0, max: 100 }), 0.5, 10);
});

test('log maps the geometric middle of the range to the middle', () => {
  closeTo(scaleTransform(10, { scale: 'log', min: 1, max: 100 }), 0.5, 10);
});

test('symlog maps its log-region midpoint to the middle', () => {
  closeTo(scaleTransform(Math.sqrt(10), { scale: 'symlog', min: 0, max: 100 }), 0.5, 6);
});

test('the continuous transforms clamp out-of-range values to the ends', () => {
  assert.equal(scaleTransform(1000, { scale: 'sqrt', min: 0, max: 100 }), 1);
  assert.equal(scaleTransform(-50, { scale: 'sqrt', min: 0, max: 100 }), 0);
});

test('the continuous transforms fall back (return null) when the range is degenerate', () => {
  assert.equal(scaleTransform(5, { scale: 'sqrt', min: 3, max: 3 }), null);
  assert.equal(scaleTransform(5, { scale: 'log', min: 3, max: 3 }), null);
});

test('quantileOf returns the fraction of samples at or below the value', () => {
  const sorted = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  closeTo(quantileOf(45, sorted), 0.5, 10);
  assert.equal(quantileOf(-1, sorted), 0);
  assert.equal(quantileOf(1000, sorted), 1);
});

test('the quantile scale uses quantileOf, so the median sample lands mid-ramp', () => {
  const sorted = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  closeTo(scaleTransform(45, { scale: 'quantile', sortedSamples: sorted }), 0.5, 10);
});

test('the quantile scale falls back when there is no sampled distribution', () => {
  assert.equal(scaleTransform(5, { scale: 'quantile', sortedSamples: [] }), null);
});

test('jenksBreaks produces one fewer break than classes, strictly increasing', () => {
  const data = [1, 2, 3, 10, 11, 12, 50, 51, 52, 100, 101, 102, 200, 201, 500, 501];
  const breaks = jenksBreaks(data, 6);
  assert.equal(breaks.length, 5);
  for (let i = 1; i < breaks.length; i++) assert.ok(breaks[i] > breaks[i - 1]);
});

test('the jenks scale steps a value to the bucket its value falls in', () => {
  const data = [1, 2, 3, 10, 11, 12, 50, 51, 52, 100, 101, 102, 200, 201, 500, 501];
  const breaks = jenksBreaks(data, 6);
  const bounds = { scale: 'jenks', breaks };
  assert.equal(scaleTransform(-100, bounds), 0);
  assert.equal(scaleTransform(1e9, bounds), 1);
  let prev = -1;
  for (const v of [...data].sort((a, b) => a - b)) {
    const t = scaleTransform(v, bounds);
    assert.ok(t >= prev);
    prev = t;
  }
});

test('jenksBreaks returns nothing usable for empty data', () => {
  assert.deepEqual(jenksBreaks([], 6), []);
});

test('strictlyIncreasing nudges equal or decreasing breaks up so no bucket is empty', () => {
  const out = strictlyIncreasing([1, 1, 1, 0.5]);
  for (let i = 1; i < out.length; i++) assert.ok(out[i] > out[i - 1]);
});

test('scaledBounds returns the bounds untouched for the linear scale', () => {
  const base = { min: 0, max: 100, curve: 2 };
  const values = Float32Array.from([1, 2, 3, 10, 20, 40, 80, -9999, -9998]);
  assert.equal(scaledBounds({ bounds: base, values, scale: 'linear', variable: 'flow' }), base);
  assert.equal(scaledBounds({ bounds: base, values, scale: undefined, variable: 'flow' }), base);
});

test('scaledBounds tags a continuous scale onto a copy of the bounds', () => {
  const base = { min: 0, max: 100, curve: 2 };
  const values = Float32Array.from([1, 2, 3, 10, 20, 40, 80, -9999, -9998]);
  const out = scaledBounds({ bounds: base, values, scale: 'sqrt', variable: 'flow' });
  assert.notEqual(out, base);
  assert.equal(out.scale, 'sqrt');
  assert.equal(out.min, 0);
});

test('scaledBounds carries a sorted, sentinel-free sample for quantile', () => {
  const base = { min: 0, max: 100, curve: 2 };
  const values = Float32Array.from([1, 2, 3, 10, 20, 40, 80, -9999, -9998]);
  const out = scaledBounds({ bounds: base, values, scale: 'quantile', variable: 'flow' });
  assert.equal(out.scale, 'quantile');
  assert.equal(out.sortedSamples.every((v) => v > -9998), true);
  const s = out.sortedSamples;
  for (let i = 1; i < s.length; i++) assert.ok(s[i] >= s[i - 1]);
});

test('scaledBounds carries monotonic breaks for jenks, one per ramp stop boundary', () => {
  const base = { min: 0, max: 100, curve: 2 };
  const many = Float32Array.from(
    Array.from({ length: 200 }, (_, i) => (i % 50) + Math.floor(i / 50) * 100)
  );
  const out = scaledBounds({ bounds: base, values: many, scale: 'jenks', variable: 'flow', classes: 6 });
  assert.equal(out.scale, 'jenks');
  for (let i = 1; i < out.breaks.length; i++) assert.ok(out.breaks[i] > out.breaks[i - 1]);
});

test('scaledBounds falls back to plain linear bounds when a class scale has no data', () => {
  const base = { min: 0, max: 100, curve: 2 };
  const empty = Float32Array.from([-9999, -9998]);
  assert.equal(scaledBounds({ bounds: base, values: empty, scale: 'quantile', variable: 'v' }), base);
  assert.equal(scaledBounds({ bounds: base, values: empty, scale: 'jenks', variable: 'v' }), base);
});

test('normalizeValue is unchanged for the default (no scale) bounds', () => {
  const linear = { min: 0, max: 50 };
  const tagged = { min: 0, max: 50, scale: 'linear' };
  assert.equal(normalizeValue(25, tagged), normalizeValue(25, linear));
});

test('normalizeValue reshapes by the transform when the bounds name a non-linear scale', () => {
  closeTo(normalizeValue(25, { min: 0, max: 100, scale: 'sqrt' }), 0.5, 10);
  closeTo(normalizeValue(10, { min: 1, max: 100, scale: 'log' }), 0.5, 10);
});

test('normalizeValue falls back to the linear mapping when the transform cannot apply', () => {
  const linear = normalizeValue(25, { min: 0, max: 50 });
  assert.equal(normalizeValue(25, { min: 0, max: 50, scale: 'quantile' }), linear);
});

test('writeColorInto still draws no-data as the missing colour under any scale', () => {
  const target = writeColorInto(-9999, { min: 0, max: 100, scale: 'jenks', breaks: [10, 20] }, [0, 0, 0, 0], LIGHT_RAMP);
  assert.deepEqual(target, [100, 100, 100, 150]);
});

test('writeColorInto sends a mid-ramp sqrt value to the interior of the ramp, not an end', () => {
  const target = writeColorInto(25, { min: 0, max: 100, scale: 'sqrt' }, [0, 0, 0, 0], LIGHT_RAMP);
  assert.notDeepEqual(target.slice(0, 3), [...LIGHT_RAMP[0]]);
  assert.notDeepEqual(target.slice(0, 3), [...LIGHT_RAMP[LIGHT_RAMP.length - 1]]);
  assert.equal(target[3], 255);
});
