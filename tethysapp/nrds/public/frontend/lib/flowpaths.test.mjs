import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FLOWPATHS_WIDTH_STOPS,
  animationIsOnMap,
  quantiseZoom,
  widthAtZoom,
} from './flowpaths.js';

const closeTo = (actual, expected, digits) =>
  assert.ok(
    Math.abs(actual - expected) < 0.5 * 10 ** -digits,
    `expected ${actual} to be within ${digits} digits of ${expected}`
  );

test('widthAtZoom returns each published stop exactly', () => {
  assert.equal(widthAtZoom(2), 0.6);
  assert.equal(widthAtZoom(7), 1);
  assert.equal(widthAtZoom(10), 2);
});

test('widthAtZoom interpolates linearly between stops', () => {
  closeTo(widthAtZoom(4.5), 0.8, 10);
  closeTo(widthAtZoom(8), 1 + 1 / 3, 10);
});

test('widthAtZoom clamps outside the range rather than extrapolating', () => {
  assert.equal(widthAtZoom(0), 0.6);
  assert.equal(widthAtZoom(1.9), 0.6);
  assert.equal(widthAtZoom(12), 2);
  assert.equal(widthAtZoom(22), 2);
});

test('widthAtZoom answers the first stop for a zoom it cannot read', () => {
  assert.equal(widthAtZoom(undefined), 0.6);
  assert.equal(widthAtZoom(null), 0.6);
  assert.equal(widthAtZoom(NaN), 0.6);
});

test('FLOWPATHS_WIDTH_STOPS cannot be edited by whoever it is handed to', () => {
  assert.equal(Object.isFrozen(FLOWPATHS_WIDTH_STOPS), true);
  assert.equal(Object.isFrozen(FLOWPATHS_WIDTH_STOPS[0]), true);
});

test('FLOWPATHS_WIDTH_STOPS publishes the stops in the shape maplibre wants', () => {
  assert.deepEqual(FLOWPATHS_WIDTH_STOPS.map((s) => [...s]), [[2, 0.6], [7, 1], [10, 2]]);
});

test('animationIsOnMap is on the map with a clock and a visible layer', () => {
  assert.equal(animationIsOnMap({ times: [1, 2], flowpathsVisible: true }), true);
});

test('animationIsOnMap is not on the map once the clock is emptied', () => {
  assert.equal(animationIsOnMap({ times: [], flowpathsVisible: true }), false);
});

test('animationIsOnMap is not on the map with the layer hidden', () => {
  assert.equal(animationIsOnMap({ times: [1, 2], flowpathsVisible: false }), false);
});

test('animationIsOnMap answers false rather than undefined before anything is loaded', () => {
  assert.equal(animationIsOnMap({}), false);
  assert.equal(animationIsOnMap({ times: undefined, flowpathsVisible: undefined }), false);
});

test('quantiseZoom snaps to quarter steps', () => {
  assert.equal(quantiseZoom(7.06), 7);
  assert.equal(quantiseZoom(7.13), 7.25);
  assert.equal(quantiseZoom(7.4), 7.5);
});

test('quantiseZoom gives the same answer across a frame-by-frame drift', () => {
  const frames = [8.01, 8.02, 8.04, 8.05, 8.07, 8.09, 8.1, 8.11];
  assert.equal(new Set(frames.map(quantiseZoom)).size, 1);
});

test('quantiseZoom answers a number for a zoom it cannot read', () => {
  assert.equal(quantiseZoom(undefined), 0);
  assert.equal(quantiseZoom(NaN), 0);
});

test('quantiseZoom never moves the animated width a visible distance from the static one', () => {
  let worst = 0;
  for (let z = 2; z <= 10; z += 0.01) {
    worst = Math.max(worst, Math.abs(widthAtZoom(z) - widthAtZoom(quantiseZoom(z))));
  }
  assert.ok(worst < 0.05);
});
