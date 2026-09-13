import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pointToSeconds,
  seriesToColumns,
  nearestIndex,
  chartState,
  axisLabel,
  emptyMessage,
  errorMessage,
} from './chartData.js';

test('pointToSeconds converts a Date and an epoch-ms number to epoch seconds', () => {
  const d = new Date('2026-01-02T03:04:05Z');
  assert.equal(pointToSeconds(d), d.getTime() / 1000);
  assert.equal(pointToSeconds(2000), 2);
  assert.equal(pointToSeconds('not a time'), null);
  assert.equal(pointToSeconds(undefined), null);
});

test('seriesToColumns shapes points into [xs, ys] in epoch seconds, preserving order', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t1 = new Date('2026-01-01T01:00:00Z');
  const t2 = new Date('2026-01-01T02:00:00Z');
  const [xs, ys] = seriesToColumns([
    { x: t0, y: 1 },
    { x: t1, y: 2 },
    { x: t2, y: 3 },
  ]);
  assert.deepEqual(xs, [t0.getTime() / 1000, t1.getTime() / 1000, t2.getTime() / 1000]);
  assert.deepEqual(ys, [1, 2, 3]);
  assert.equal(xs[1] - xs[0], 3600);
});

test('seriesToColumns drops a point with no finite time and nulls a non-finite value', () => {
  const good = new Date('2026-01-01T00:00:00Z');
  const [xs, ys] = seriesToColumns([
    { x: good, y: 5 },
    { x: 'bad', y: 9 },
    { x: new Date('2026-01-01T01:00:00Z'), y: NaN },
  ]);
  assert.equal(xs.length, 2);
  assert.equal(ys.length, 2);
  assert.equal(ys[0], 5);
  assert.equal(ys[1], null);
});

test('seriesToColumns returns empty columns for a non-array or empty input', () => {
  assert.deepEqual(seriesToColumns(null), [[], []]);
  assert.deepEqual(seriesToColumns([]), [[], []]);
});

test('nearestIndex finds the nearest time, snapping at and beyond the ends', () => {
  const xs = [0, 10, 20, 30];
  assert.equal(nearestIndex(xs, -5), 0);
  assert.equal(nearestIndex(xs, 0), 0);
  assert.equal(nearestIndex(xs, 4), 0);
  assert.equal(nearestIndex(xs, 6), 1);
  assert.equal(nearestIndex(xs, 14), 1);
  assert.equal(nearestIndex(xs, 16), 2);
  assert.equal(nearestIndex(xs, 100), 3);
  assert.equal(nearestIndex([], 5), -1);
});

test('nearestIndex breaks a tie toward the earlier point', () => {
  assert.equal(nearestIndex([0, 10], 5), 0);
});

test('chartState prefers error when a failure left no data', () => {
  assert.equal(
    chartState({ series: [], featureId: 'cat-1', failed: { kind: 'timeseries' } }),
    'error'
  );
  assert.equal(
    chartState({ series: [{ x: 1, y: 2 }], featureId: 'cat-1', failed: { kind: 'x' } }),
    'chart'
  );
});

test('chartState waits for a feature that is loading or has not answered yet', () => {
  assert.equal(chartState({ series: [], featureId: 'cat-1', loading: true }), 'loading');
  assert.equal(
    chartState({ series: [], featureId: 'cat-1', loading: false, answered: null, failed: null }),
    'loading'
  );
});

test('chartState charts when there is data and is empty otherwise', () => {
  assert.equal(chartState({ series: [{ x: 1, y: 2 }], featureId: 'cat-1' }), 'chart');
  assert.equal(
    chartState({ series: [], featureId: 'cat-1', answered: 'k', failed: null }),
    'empty'
  );
  assert.equal(chartState({ series: [], featureId: null }), 'empty');
});

test('axisLabel appends units when the variable has them', () => {
  assert.equal(axisLabel('streamflow'), 'streamflow (m³/s)');
  assert.equal(axisLabel('q_out'), 'q_out');
  assert.equal(axisLabel(''), '');
  assert.equal(axisLabel(undefined), '');
});

test('emptyMessage names the feature or asks for a selection', () => {
  assert.equal(
    emptyMessage({ featureId: 'cat-9' }),
    'No data to chart for cat-9 in this selection'
  );
  assert.equal(emptyMessage({ featureId: null }), 'Select a catchment to see its timeseries');
});

test('errorMessage has its own wording for a missing output file', () => {
  assert.equal(
    errorMessage({ failed: { kind: 'no-output-file' }, featureId: 'cat-9' }),
    'No output file for this selection.'
  );
  assert.equal(
    errorMessage({ failed: { kind: 'timeseries' }, featureId: 'cat-9' }),
    'Could not load the timeseries for cat-9.'
  );
});
