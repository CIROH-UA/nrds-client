import { test } from 'node:test';
import assert from 'node:assert/strict';

import { featureFields, curatedFeatureFields } from './featureFields.js';

test('featureFields returns [] for a missing feature', () => {
  assert.deepEqual(featureFields(null), []);
  assert.deepEqual(featureFields(undefined), []);
});

test('featureFields renders lat/long as a single formatted row', () => {
  const fields = featureFields({ lat: 40.123456789, lon: -111.987654321 });
  assert.deepEqual(fields[0], { label: 'Lat/Long', value: '40.123457, -111.987654' });
});

test('featureFields accepts latitude/longitude aliases', () => {
  const fields = featureFields({ latitude: 1, longitude: 2 });
  assert.equal(fields[0].label, 'Lat/Long');
  assert.equal(fields[0].value, '1.000000, 2.000000');
});

test('featureFields formats booleans and numbers and skips empties', () => {
  const fields = featureFields({
    has_flowline: true,
    lengthkm: 3.14159,
    empty: '',
    missing: null,
    undef: undefined,
  });
  const byLabel = Object.fromEntries(fields.map((f) => [f.label, f.value]));
  assert.equal(byLabel['Has Flowline'], 'Yes');
  assert.equal(byLabel['Length (km)'], '3.1416');
  assert.ok(!('' in byLabel));
});

test('featureFields uses FEATURE_PROPERTIES labels where available', () => {
  const fields = featureFields({ toid: 'wb-1' });
  assert.deepEqual(fields, [{ label: 'To ID', value: 'wb-1' }]);
});

test('curatedFeatureFields returns [] for a missing feature', () => {
  assert.deepEqual(curatedFeatureFields(null), []);
});

test('curatedFeatureFields leads with the id row', () => {
  const rows = curatedFeatureFields({ id: 'cat-42' });
  assert.deepEqual(rows[0], { label: 'ID', value: 'cat-42' });
});

test('curatedFeatureFields prefers _id over id', () => {
  const rows = curatedFeatureFields({ _id: 'wb-7', id: 'cat-42' });
  assert.equal(rows[0].value, 'wb-7');
});

test('curatedFeatureFields keeps only header attributes and caps at max', () => {
  const rows = curatedFeatureFields({
    id: 'cat-1',
    areasqkm: 5,
    tot_drainage_areasqkm: 10,
    stream_order: 3,
    toid: 'wb-2',
  });
  const labels = rows.map((r) => r.label);
  assert.equal(labels[0], 'ID');
  assert.ok(labels.includes('Area (km2)'));
  assert.ok(labels.includes('Total Drainage Area (km2)'));
  assert.ok(!labels.includes('To ID'));
  assert.ok(rows.length <= 4);
});

test('curatedFeatureFields honors a custom max', () => {
  const rows = curatedFeatureFields(
    { id: 'cat-1', areasqkm: 5, stream_order: 3 },
    { max: 2 }
  );
  assert.equal(rows.length, 2);
});
