import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FLOWPATHS_MIN_ZOOM,
  DIVIDES_MIN_ZOOM,
  boundsFor,
  computeBounds,
  getCentroid,
  getValueAtTimeFlat,
  mapFeatureId,
  normalizeValue,
  selectionLngLat,
  valueAtRampPosition,
} from './flowpathValues.js';

const closeTo = (actual, expected, digits) =>
  assert.ok(
    Math.abs(actual - expected) < 0.5 * 10 ** -digits,
    `expected ${actual} to be within ${digits} digits of ${expected}`
  );

const feature = (type, coordinates) => ({ geometry: { type, coordinates } });
const RING = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];

test('the min-zoom constants match the configured tilesets', () => {
  assert.equal(FLOWPATHS_MIN_ZOOM, 1);
  assert.equal(DIVIDES_MIN_ZOOM, 7);
});

test('getCentroid reads a point straight off', () => {
  assert.deepEqual(getCentroid(feature('Point', [-96.5, 40.25])), { lon: -96.5, lat: 40.25 });
});

test('getCentroid averages a polygon outer ring', () => {
  const { lon, lat } = getCentroid(feature('Polygon', [RING]));
  closeTo(lon, 0.8, 5);
  closeTo(lat, 0.8, 5);
});

test('getCentroid places a multipolygon instead of giving up on it', () => {
  const shifted = RING.map(([x, y]) => [x + 10, y + 10]);
  const { lon, lat } = getCentroid(feature('MultiPolygon', [[RING], [shifted]]));
  assert.equal(Number.isFinite(lon), true);
  assert.equal(Number.isFinite(lat), true);
  closeTo(lon, 5.8, 5);
  closeTo(lat, 5.8, 5);
});

test('getCentroid ignores polygon holes when centring', () => {
  const hole = [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5], [0.5, 0.5]];
  assert.deepEqual(
    getCentroid(feature('Polygon', [RING, hole])),
    getCentroid(feature('Polygon', [RING]))
  );
});

test('getCentroid handles the line geometries too', () => {
  assert.deepEqual(getCentroid(feature('LineString', [[0, 0], [4, 4]])), { lon: 2, lat: 2 });
  assert.deepEqual(
    getCentroid(feature('MultiLineString', [[[0, 0], [2, 2]], [[2, 2], [4, 4]]])),
    { lon: 2, lat: 2 }
  );
  assert.deepEqual(getCentroid(feature('MultiPoint', [[0, 0], [2, 2]])), { lon: 1, lat: 1 });
});

for (const [name, geometry] of [
  ['no geometry', undefined],
  ['an unknown type', { type: 'GeometryCollection', coordinates: [] }],
  ['empty coordinates', { type: 'Polygon', coordinates: [] }],
  ['coordinates that are not positions', { type: 'Polygon', coordinates: [[[null, null]]] }],
]) {
  test(`getCentroid returns nulls rather than a wrong place for ${name}`, () => {
    assert.deepEqual(getCentroid({ geometry }), { lon: null, lat: null });
  });
}

test('getCentroid keeps a real zero coordinate', () => {
  assert.deepEqual(getCentroid(feature('Point', [0, 0])), { lon: 0, lat: 0 });
});

test('selectionLngLat reads lon/lat and the latitude/longitude aliases', () => {
  assert.deepEqual(selectionLngLat({ lon: -111, lat: 40 }), [-111, 40]);
  assert.deepEqual(selectionLngLat({ longitude: 2, latitude: 1 }), [2, 1]);
});

test('selectionLngLat returns null when a coordinate cannot be placed', () => {
  assert.equal(selectionLngLat({ lon: -111 }), null);
  assert.equal(selectionLngLat({}), null);
  assert.equal(selectionLngLat(null), null);
});

test('computeBounds ignores the missing-value sentinel', () => {
  const b = computeBounds(Float32Array.from([-9999, 4, 8, -9998]));
  assert.equal(b.min, 4);
  assert.equal(b.max, 8);
});

test('computeBounds falls back to 0..1 when nothing is valid', () => {
  assert.deepEqual(computeBounds(Float32Array.from([-9999, -9999])), { min: 0, max: 1 });
  assert.deepEqual(computeBounds(new Float32Array()), { min: 0, max: 1 });
});

test('computeBounds trims the ends, so one main stem cannot flatten the ramp', () => {
  const values = Float32Array.from([...Array.from({ length: 99 }, (_, i) => i + 1), 100000]);
  assert.ok(computeBounds(values).max < 1000);
});

test('computeBounds reports the curve it fitted, so colour and width can share it', () => {
  assert.ok(computeBounds(Float32Array.from([1, 2, 3, 40, 500])).curve > 0);
});

test('boundsFor remembers the bounds for the array it was computed from', () => {
  const values = Float32Array.from([1, 2, 3, 40, 500]);
  const first = boundsFor(values);
  assert.equal(boundsFor(values), first);
  assert.equal(boundsFor(null), null);
});

test('normalizeValue maps min to 0 and max to 1', () => {
  const bounds = { min: 0, max: 50, curve: 1 };
  assert.equal(normalizeValue(0, bounds), 0);
  closeTo(normalizeValue(50, bounds), 1, 10);
});

test('normalizeValue returns 0 for a non-finite value or missing bounds', () => {
  assert.equal(normalizeValue(NaN, { min: 0, max: 50 }), 0);
  assert.equal(normalizeValue(25, null), 0);
});

test('normalizeValue is ordered across a skewed distribution', () => {
  const bounds = computeBounds(
    Float32Array.from(Array.from({ length: 4000 }, (_, i) => Math.exp((i / 4000) * 8) / 10))
  );
  let previous = -1;
  for (let v = bounds.min; v <= bounds.max; v += (bounds.max - bounds.min) / 200) {
    const t = normalizeValue(v, bounds);
    assert.ok(t >= previous);
    previous = t;
  }
});

test('normalizeValue saturates rather than running off the end of the scale', () => {
  const bounds = computeBounds(
    Float32Array.from(Array.from({ length: 4000 }, (_, i) => Math.exp((i / 4000) * 8) / 10))
  );
  assert.equal(normalizeValue(bounds.max * 1000, bounds), 1);
  assert.equal(normalizeValue(bounds.min - 1000, bounds), 0);
});

test('valueAtRampPosition inverts normalizeValue', () => {
  const bounds = { min: 5, max: 205, curve: 3 };
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const value = valueAtRampPosition(t, bounds);
    closeTo(normalizeValue(value, bounds), t, 6);
  }
});

test('valueAtRampPosition returns the min for degenerate or missing bounds', () => {
  assert.equal(valueAtRampPosition(0.5, { min: 7, max: 7 }), 7);
  assert.equal(valueAtRampPosition(0.5, null), 0);
});

test('valueAtRampPosition clamps its position to the ramp', () => {
  const bounds = { min: 0, max: 100, curve: 1 };
  assert.equal(valueAtRampPosition(-1, bounds), 0);
  closeTo(valueAtRampPosition(2, bounds), 100, 6);
});

test('getValueAtTimeFlat reads a value out of the flat feature-major array', () => {
  const data = [10, 11, 12, 20, 21, 22];
  assert.equal(getValueAtTimeFlat(data, 3, 0, 0), 10);
  assert.equal(getValueAtTimeFlat(data, 3, 1, 2), 22);
});

test('getValueAtTimeFlat returns null for a missing array or an out-of-range index', () => {
  assert.equal(getValueAtTimeFlat(null, 3, 0, 0), null);
  assert.equal(getValueAtTimeFlat([1, 2], 3, undefined, 0), null);
  assert.equal(getValueAtTimeFlat([1, 2], 3, 5, 0), null);
});

test('mapFeatureId prefers id, then properties.id, then divide_id', () => {
  assert.equal(mapFeatureId({ id: 'wb-1' }), 'wb-1');
  assert.equal(mapFeatureId({ properties: { id: 'wb-2' } }), 'wb-2');
  assert.equal(mapFeatureId({ properties: { divide_id: 'cat-3' } }), 'cat-3');
  assert.equal(mapFeatureId({}), null);
});
