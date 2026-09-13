import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FEATURE_PROPERTIES, getVariableUnits } from './data.js';

test('getVariableUnits returns empty string for missing input', () => {
  assert.equal(getVariableUnits(), '');
  assert.equal(getVariableUnits(''), '');
  assert.equal(getVariableUnits(null), '');
});

test('getVariableUnits returns the known unit for a variable', () => {
  assert.equal(getVariableUnits('flow'), 'm³/s');
  assert.equal(getVariableUnits('velocity'), 'm/s');
  assert.equal(getVariableUnits('depth'), 'm');
  assert.equal(getVariableUnits('rain_rate'), 'mm/h');
});

test('getVariableUnits is case-insensitive', () => {
  assert.equal(getVariableUnits('FLOW'), 'm³/s');
  assert.equal(getVariableUnits('Streamflow'), 'm³/s');
});

test('getVariableUnits returns empty string for a known unitless variable', () => {
  assert.equal(getVariableUnits('q_out'), '');
});

test('getVariableUnits returns empty string for an unknown variable', () => {
  assert.equal(getVariableUnits('not_a_variable'), '');
});

test('FEATURE_PROPERTIES maps keys to labels', () => {
  assert.equal(FEATURE_PROPERTIES.areasqkm, 'Area (km2)');
  assert.equal(FEATURE_PROPERTIES.toid, 'To ID');
  assert.equal(FEATURE_PROPERTIES.vpuid, 'VPU ID');
});
