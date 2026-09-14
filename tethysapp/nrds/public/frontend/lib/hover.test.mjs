import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HOVER_TARGET_ORDER,
  mapFeatureId,
  pickHoverFeature,
  hoveredFeatureOf,
  hoverReading,
} from './hover.js';

const feat = (layerId, properties = {}, id) => ({ layer: { id: layerId }, id, properties });

test('pickHoverFeature returns null for empty input', () => {
  assert.equal(pickHoverFeature(null), null);
  assert.equal(pickHoverFeature([]), null);
});

test('pickHoverFeature prefers the smallest target under the pointer', () => {
  const gauge = feat('conus-gauges', { id: 'g1' });
  const flow = feat('flowpaths-line', { divide_id: 5 }, 5);
  const divide = feat('divides', { divide_id: 7 });
  // Order is gauge < flowpath < divide regardless of input order.
  assert.equal(pickHoverFeature([divide, flow, gauge]), gauge);
  assert.equal(pickHoverFeature([divide, flow]), flow);
  assert.equal(pickHoverFeature([divide]), divide);
});

test('HOVER_TARGET_ORDER is gauge, flowpath, divide', () => {
  assert.deepEqual(HOVER_TARGET_ORDER, ['conus-gauges', 'flowpaths-line', 'divides']);
});

test('mapFeatureId falls back through id, properties.id, then divide_id', () => {
  assert.equal(mapFeatureId(feat('flowpaths-line', { divide_id: 9 }, 9)), 9);
  assert.equal(mapFeatureId(feat('flowpaths-line', { id: 'p', divide_id: 9 })), 'p');
  assert.equal(mapFeatureId(feat('flowpaths-line', { divide_id: 9 })), 9);
  assert.equal(mapFeatureId(feat('flowpaths-line', {})), null);
});

test('hoveredFeatureOf keys a divide by divide_id and carries the pointer position', () => {
  const hovered = hoveredFeatureOf(feat('divides', { divide_id: 'cat-3', areasqkm: 12 }), {
    lng: -96.1,
    lat: 40.2,
  });
  assert.equal(hovered.hoverId, 'cat-3');
  assert.equal(hovered._id, 'cat-3');
  assert.equal(hovered.layerId, 'divides');
  assert.equal(hovered.areasqkm, 12);
  assert.equal(hovered.longitude, -96.1);
  assert.equal(hovered.latitude, 40.2);
});

test('hoveredFeatureOf keys a flowpath by its promoted id', () => {
  const hovered = hoveredFeatureOf(feat('flowpaths-line', { divide_id: 42 }, 42), { lng: 0, lat: 0 });
  assert.equal(hovered.hoverId, 42);
});

test('hoveredFeatureOf returns null when there is no feature or no id', () => {
  assert.equal(hoveredFeatureOf(null, { lng: 0, lat: 0 }), null);
  assert.equal(hoveredFeatureOf(feat('flowpaths-line', {}), { lng: 0, lat: 0 }), null);
});

test('hoveredFeatureOf keeps a zero id (0 is a valid divide_id)', () => {
  const hovered = hoveredFeatureOf(feat('divides', { divide_id: 0 }), { lng: 1, lat: 2 });
  assert.notEqual(hovered, null);
  assert.equal(hovered.hoverId, 0);
});

// varData is feature-major: featureIndex * numTimes + timeIndex. Feature index 1 over 3 frames
// reads 10, 20, 30.
const readingInput = (currentTimeIndex) => ({
  variable: 'flow',
  times: [0, 3_600_000, 7_200_000],
  varData: [0, 0, 0, 10, 20, 30],
  featureIdToIndex: { 5: 1 },
  currentTimeIndex,
  hoverId: 5,
});

test('hoverReading tracks currentTimeIndex so the value advances with the animation', () => {
  const first = hoverReading(readingInput(0));
  const last = hoverReading(readingInput(2));
  assert.notEqual(first, null);
  assert.notEqual(last, null);
  assert.notEqual(first.value, last.value);
});

test('hoverReading resolves the id through its numeric part when keyed that way', () => {
  const r = hoverReading({ ...readingInput(1), featureIdToIndex: { 5: 1 }, hoverId: 'wb-5' });
  assert.notEqual(r, null);
});

test('hoverReading reports no data for the ngen sentinel', () => {
  const r = hoverReading({ ...readingInput(0), varData: [0, 0, 0, -9999, -9999, -9999] });
  assert.equal(r.value, 'no data');
});

test('hoverReading returns null for an unknown reach or missing data', () => {
  assert.equal(hoverReading({ ...readingInput(0), hoverId: 999 }), null);
  assert.equal(hoverReading({ ...readingInput(0), varData: null }), null);
  assert.equal(hoverReading({ ...readingInput(0), times: [] }), null);
});
