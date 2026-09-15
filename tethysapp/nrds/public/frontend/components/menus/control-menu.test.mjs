import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  currentScaleOption,
  legendTicks,
  legendTitle,
  shouldShowLegend,
  summarizeRun,
  LEGEND_TICKS,
} from './control-menu.js';
import { SCALE_OPTIONS } from '../../lib/colorScale.js';

test('summarizeRun renders model, forecast code, and date.cycle', () => {
  assert.equal(
    summarizeRun({ model: 'cfe_nom', date: 'ngen.20260915', forecast: 'short_range', cycle: '00' }),
    'cfe_nom SR 20260915.00'
  );
  assert.equal(
    summarizeRun({ model: 'lstm_0', date: 'ngen.20260101', forecast: 'medium_range', cycle: '06' }),
    'lstm_0 MR 20260101.06'
  );
});

test('summarizeRun prompts when nothing is selected', () => {
  assert.equal(summarizeRun({}), 'Select a run');
  assert.equal(summarizeRun(), 'Select a run');
});

test('summarizeRun abbreviates a forecast that is not in the known-code table', () => {
  assert.equal(
    summarizeRun({ model: 'cfe', date: 'ngen.20260101', forecast: 'long_range', cycle: '00' }),
    'cfe LON 20260101.00'
  );
});

test('summarizeRun omits the cycle when none is selected', () => {
  assert.equal(
    summarizeRun({ model: 'cfe', date: 'ngen.20260101', forecast: 'short_range' }),
    'cfe SR 20260101'
  );
});

test('summarizeRun joins only the parts that are present for a partial selection', () => {
  assert.equal(summarizeRun({ model: 'cfe' }), 'cfe');
  assert.equal(summarizeRun({ date: 'ngen.20260101' }), '20260101');
});

test('currentScaleOption returns the option matching the scale value', () => {
  assert.deepEqual(currentScaleOption('log'), SCALE_OPTIONS.find((o) => o.value === 'log'));
  assert.deepEqual(currentScaleOption('jenks'), SCALE_OPTIONS.find((o) => o.value === 'jenks'));
});

test('currentScaleOption falls back to the first option for an unknown scale', () => {
  assert.equal(currentScaleOption('nope'), SCALE_OPTIONS[0]);
  assert.equal(currentScaleOption(undefined), SCALE_OPTIONS[0]);
  assert.equal(SCALE_OPTIONS[0].value, 'linear');
});

test('legendTicks maps the three ramp positions to formatted labels', () => {
  const bounds = { min: 0, max: 100, curve: 1 };
  const ticks = legendTicks(bounds);
  assert.equal(ticks.length, 3);
  assert.equal(ticks.length, LEGEND_TICKS.length);
  // The ends are the bounds themselves (valueAtRampPosition is the inverse of the ramp mapping).
  assert.equal(ticks[0], '0');
  assert.equal(ticks[2], '100');
  // The middle tick sits strictly between the ends.
  const mid = Number(ticks[1]);
  assert.ok(mid > 0 && mid < 100, `middle tick ${ticks[1]} is between the bounds`);
});

test('legendTicks is empty without bounds', () => {
  assert.deepEqual(legendTicks(null), []);
  assert.deepEqual(legendTicks(undefined), []);
});

test('legendTitle appends units and a non-linear scale name', () => {
  assert.equal(legendTitle('flow', 'linear'), 'flow (m³/s)');
  assert.equal(legendTitle('flow', 'log'), 'flow (m³/s) · log');
  assert.equal(legendTitle('flow', 'jenks'), 'flow (m³/s) · natural breaks');
});

test('legendTitle omits empty units and the linear scale name', () => {
  // q_out has no units in the units table, and linear has no scale-name suffix.
  assert.equal(legendTitle('q_out', 'linear'), 'q_out');
  assert.equal(legendTitle('q_out', 'log'), 'q_out · log');
});

test('legendTitle is empty without a variable', () => {
  assert.equal(legendTitle('', 'linear'), '');
  assert.equal(legendTitle(undefined, 'log'), '');
});

test('shouldShowLegend requires flowpaths on, data present, bounds, a variable, and a ramp', () => {
  const base = {
    flowpathsVisible: true,
    timesLength: 5,
    bounds: { min: 0, max: 1 },
    variable: 'flow',
    ramp: [[0, 0, 0], [255, 255, 255]],
  };
  assert.equal(shouldShowLegend(base), true);
  assert.equal(shouldShowLegend({ ...base, flowpathsVisible: false }), false);
  assert.equal(shouldShowLegend({ ...base, timesLength: 0 }), false);
  assert.equal(shouldShowLegend({ ...base, bounds: null }), false);
  assert.equal(shouldShowLegend({ ...base, variable: '' }), false);
  assert.equal(shouldShowLegend({ ...base, ramp: [] }), false);
});

test('shouldShowLegend tolerates missing counts', () => {
  assert.equal(
    shouldShowLegend({ flowpathsVisible: true, bounds: { min: 0, max: 1 }, variable: 'flow', ramp: [[0, 0, 0]] }),
    false
  );
});
