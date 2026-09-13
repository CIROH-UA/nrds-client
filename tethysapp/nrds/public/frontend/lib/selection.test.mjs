import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  divideIdOf,
  dividesHighlightFilter,
  flowpathsHighlightFilter,
  layerIdToFeatureType,
  pickClickedFeature,
  resolveVpuName,
  selectionPayload,
} from './selection.js';

const divide = (overrides = {}) => ({
  layer: { id: 'divides' },
  geometry: { type: 'Point', coordinates: [-96.5, 40.25] },
  properties: { divide_id: 'cat-42', vpuid: '01', ...overrides },
});

test('layerIdToFeatureType names the divide id property for divides only', () => {
  assert.equal(layerIdToFeatureType('divides'), 'divide_id');
  assert.equal(layerIdToFeatureType('flowpaths-line'), null);
  assert.equal(layerIdToFeatureType('conus-gauges'), null);
});

test('selectionPayload flattens a clicked divide into a stored selection', () => {
  const { featureId, payload } = selectionPayload(divide(), 'divides');

  assert.equal(featureId, 'cat-42');
  assert.deepEqual(payload, {
    latitude: 40.25,
    longitude: -96.5,
    layerId: 'divides',
    _id: 'cat-42',
    divide_id: 'cat-42',
    vpuid: '01',
  });
});

test('selectionPayload reads the id property that matches the layer, not a stray id', () => {
  // A divide carries both id and divide_id; only divide_id names the catchment the reader means.
  const feature = divide({ id: 'wb-should-be-ignored', divide_id: 'cat-7' });
  assert.equal(selectionPayload(feature, 'divides').featureId, 'cat-7');
});

test('selectionPayload is null when the layer gives the feature no id', () => {
  assert.equal(selectionPayload(divide({ divide_id: undefined }), 'divides'), null);
  assert.equal(selectionPayload(divide(), 'flowpaths-line'), null);
});

test('resolveVpuName builds VPU_<id>, or null when the feature carries none', () => {
  assert.equal(resolveVpuName(divide()), 'VPU_01');
  assert.equal(resolveVpuName(divide({ vpuid: '16' })), 'VPU_16');
  assert.equal(resolveVpuName(divide({ vpuid: undefined })), null);
  assert.equal(resolveVpuName(divide({ vpuid: '' })), null);
  assert.equal(resolveVpuName(null), null);
});

test('divideIdOf reads a flattened selection, a raw feature, or nothing', () => {
  assert.equal(divideIdOf({ divide_id: 'cat-42' }), 'cat-42');
  assert.equal(divideIdOf({ properties: { divide_id: 'cat-9' } }), 'cat-9');
  assert.equal(divideIdOf({}), null);
  assert.equal(divideIdOf(null), null);
});

test('dividesHighlightFilter matches the selected divide, or nothing when none is selected', () => {
  assert.deepEqual(dividesHighlightFilter('cat-42'), [
    'any',
    ['==', ['get', 'divide_id'], 'cat-42'],
  ]);
  // A filter that can match no real divide, so the highlight clears on deselect.
  assert.deepEqual(dividesHighlightFilter(null), ['==', ['get', 'divide_id'], '']);
});

test('flowpathsHighlightFilter keys on the numeric part of the id, or nothing when none is selected', () => {
  assert.deepEqual(flowpathsHighlightFilter('cat-42'), ['==', ['get', 'divide_id'], 42]);
  assert.deepEqual(flowpathsHighlightFilter('wb-1057'), ['==', ['get', 'divide_id'], 1057]);
  assert.deepEqual(flowpathsHighlightFilter(null), ['==', ['get', 'divide_id'], -1]);
});

test('pickClickedFeature prefers a chartable divide over a flowpath drawn above it', () => {
  const flowpath = { layer: { id: 'flowpaths-line' }, properties: {} };
  const catchment = divide();
  // queryRenderedFeatures returns top-first; the flowpath is on top but cannot be charted.
  assert.equal(pickClickedFeature([flowpath, catchment]), catchment);
});

test('pickClickedFeature falls back to the topmost when none can be charted', () => {
  const flowpath = { layer: { id: 'flowpaths-line' }, properties: {} };
  const gauge = { layer: { id: 'conus-gauges' }, properties: {} };
  assert.equal(pickClickedFeature([flowpath, gauge]), flowpath);
});

test('pickClickedFeature is null when nothing was under the click', () => {
  assert.equal(pickClickedFeature([]), null);
  assert.equal(pickClickedFeature(undefined), null);
});
