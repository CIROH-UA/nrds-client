import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  hasEnsembles,
  forecastListPrefix,
  cycleListPrefix,
  ensembleListPrefix,
  outputFileListPrefix,
  selectedOption,
  shouldShowNoOutputNotice,
  buildRunKeys,
} from './run-cascade.js';

test('hasEnsembles is true only for medium_range', () => {
  assert.equal(hasEnsembles('medium_range'), true);
  assert.equal(hasEnsembles('short_range'), false);
  assert.equal(hasEnsembles('analysis_assim_extend'), false);
  assert.equal(hasEnsembles(''), false);
});

test('the level listing prefixes match the React dataMenu chain', () => {
  assert.equal(
    forecastListPrefix('cfe_nom', 'ngen.20240101'),
    'outputs/cfe_nom/v2.2_hydrofabric/ngen.20240101/'
  );
  assert.equal(
    cycleListPrefix('cfe_nom', 'ngen.20240101', 'short_range'),
    'outputs/cfe_nom/v2.2_hydrofabric/ngen.20240101/short_range/'
  );
  assert.equal(
    ensembleListPrefix('cfe_nom', 'ngen.20240101', 'medium_range', '00'),
    'outputs/cfe_nom/v2.2_hydrofabric/ngen.20240101/medium_range/00/'
  );
});

test('outputFileListPrefix includes the ensemble segment only when there is an ensemble', () => {
  assert.equal(
    outputFileListPrefix('cfe_nom', 'ngen.20240101', 'medium_range', '00', 'mem1', 'VPU_01'),
    'outputs/cfe_nom/v2.2_hydrofabric/ngen.20240101/medium_range/00/mem1/VPU_01/ngen-run/outputs/troute/'
  );
  assert.equal(
    outputFileListPrefix('cfe_nom', 'ngen.20240101', 'short_range', '00', '', 'VPU_01'),
    'outputs/cfe_nom/v2.2_hydrofabric/ngen.20240101/short_range/00/VPU_01/ngen-run/outputs/troute/'
  );
});

test('selectedOption returns the matching option', () => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];
  assert.deepEqual(selectedOption(options, 'b'), { value: 'b', label: 'B' });
});

test('selectedOption falls back to the first option when the value is absent', () => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];
  assert.deepEqual(selectedOption(options, 'nope'), { value: 'a', label: 'A' });
  assert.deepEqual(selectedOption(options, null), { value: 'a', label: 'A' });
  assert.deepEqual(selectedOption(options, undefined), { value: 'a', label: 'A' });
});

test('selectedOption is null for an empty or missing list', () => {
  assert.equal(selectedOption([], 'a'), null);
  assert.equal(selectedOption(null, 'a'), null);
  assert.equal(selectedOption(undefined, 'a'), null);
});

test('the no-output notice is hidden on the initial and empty state', () => {
  // Nothing selected yet: no vpu, so nothing to complain about.
  assert.equal(
    shouldShowNoOutputNotice({ vpu: null, selecting: false, outputFilesLength: 0 }),
    false
  );
  // A selection is still resolving: the notice waits for it to settle.
  assert.equal(
    shouldShowNoOutputNotice({ vpu: 'VPU_01', selecting: true, outputFilesLength: 0 }),
    false
  );
});

test('the no-output notice shows only once a real selection resolves with no output files', () => {
  assert.equal(
    shouldShowNoOutputNotice({ vpu: 'VPU_01', selecting: false, outputFilesLength: 0 }),
    true
  );
  // With output files there is a run to load, so no notice.
  assert.equal(
    shouldShowNoOutputNotice({ vpu: 'VPU_01', selecting: false, outputFilesLength: 3 }),
    false
  );
});

test('shouldShowNoOutputNotice tolerates a missing output-file count', () => {
  assert.equal(shouldShowNoOutputNotice({ vpu: 'VPU_01', selecting: false }), true);
});

test('buildRunKeys builds the cache key and prefix for a selection with an ensemble', () => {
  const datastream = {
    model: 'cfe_nom',
    date: 'ngen.20240101',
    forecast: 'medium_range',
    cycle: '00',
    ensemble: 'mem1',
    vpu: 'VPU_01',
    outputFile: 'flow.parquet',
  };
  const { cacheKey, prefix } = buildRunKeys(datastream);
  assert.equal(cacheKey, 'cfe_nom_ngen_20240101_medium_range_00_mem1_VPU_01_flow.parquet');
  assert.equal(
    prefix,
    'outputs/cfe_nom/v2.2_hydrofabric/ngen.20240101/medium_range/00/mem1/VPU_01/ngen-run/outputs/troute/flow.parquet'
  );
});

test('buildRunKeys drops the ensemble from both the cache key and the prefix when there is none', () => {
  const datastream = {
    model: 'cfe_nom',
    date: 'ngen.20240101',
    forecast: 'short_range',
    cycle: '00',
    ensemble: null,
    vpu: 'VPU_01',
    outputFile: 'flow.parquet',
  };
  const { cacheKey, prefix } = buildRunKeys(datastream);
  assert.equal(cacheKey, 'cfe_nom_ngen_20240101_short_range_00_VPU_01_flow.parquet');
  assert.equal(
    prefix,
    'outputs/cfe_nom/v2.2_hydrofabric/ngen.20240101/short_range/00/VPU_01/ngen-run/outputs/troute/flow.parquet'
  );
});
