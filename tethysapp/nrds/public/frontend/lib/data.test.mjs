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

const CFE_OUTPUTS_IN_METRES = [
  'infiltration_excess',
  'direct_runoff',
  'nash_lateral_runoff',
  'deep_gw_to_channel_flux',
  'soil_to_gw_flux',
  'q_out',
  'potential_et',
  'actual_et',
  'soil_storage_change',
  'nwm_ponded_depth',
];

test("getVariableUnits reports every CFE output in metres, as CFE's BMI declares", () => {
  for (const name of CFE_OUTPUTS_IN_METRES) {
    assert.equal(getVariableUnits(name), 'm', `${name} should be m`);
    assert.equal(getVariableUnits(name.toUpperCase()), 'm', `${name} should be case-insensitive`);
  }
});

test('getVariableUnits leaves surf_runoff_scheme (CFE none) and the categorical type unitless', () => {
  assert.equal(getVariableUnits('surf_runoff_scheme'), '');
  assert.equal(getVariableUnits('type'), '');
});

test('getVariableUnits returns empty string for an unknown variable', () => {
  assert.equal(getVariableUnits('not_a_variable'), '');
});

test('FEATURE_PROPERTIES maps keys to labels', () => {
  assert.equal(FEATURE_PROPERTIES.areasqkm, 'Area (km2)');
  assert.equal(FEATURE_PROPERTIES.toid, 'To ID');
  assert.equal(FEATURE_PROPERTIES.vpuid, 'VPU ID');
});
