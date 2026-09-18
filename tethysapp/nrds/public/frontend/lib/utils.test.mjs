import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getCacheKey,
  cacheFailureReason,
  makeFeatureTitle,
  makeRunLabel,
} from './utils.js';

test('getCacheKey joins the selection and appends the output file', () => {
  assert.equal(
    getCacheKey('cfe_nom', 'ngen.20260913', 'short_range', '00', null, 'VPU_01', 'troute.parquet'),
    'cfe_nom_ngen_20260913_short_range_00_VPU_01_troute.parquet'
  );
});

test('getCacheKey includes the ensemble when one is given', () => {
  assert.equal(
    getCacheKey('cfe_nom', 'ngen.20260913', 'medium_range', '06', 'ens01', 'VPU_16', 'out.parquet'),
    'cfe_nom_ngen_20260913_medium_range_06_ens01_VPU_16_out.parquet'
  );
});

test('getCacheKey flattens dots and slashes so the key names one duckdb table', () => {
  const key = getCacheKey('m', '2026.09.13', 'f/x', 'c', null, 'v', 'o.parquet');
  assert.equal(key.includes('.'), true);
  assert.equal(key, 'm_2026_09_13_f_x_c_v_o.parquet');
});

test('cacheFailureReason maps a missing file and a stall to reader-facing text', () => {
  assert.equal(cacheFailureReason({ response: { status: 404 } }), 'the file is not there');
  assert.equal(cacheFailureReason({ name: 'TimeoutError' }), 'the download stopped');
  assert.equal(cacheFailureReason({ name: 'AbortError' }), 'the download stopped');
  assert.equal(cacheFailureReason({ name: 'DatabaseTimeoutError' }), 'the database is not responding');
  assert.equal(cacheFailureReason({ name: 'SomethingElse' }), null);
});

test('makeFeatureTitle turns a hyphenated id into a capitalised title', () => {
  assert.equal(makeFeatureTitle('cat-123'), 'Cat 123');
  assert.equal(makeFeatureTitle('wb-42'), 'Wb 42');
  assert.equal(makeFeatureTitle(null), '');
});

test('makeRunLabel names the forecast run for the caption', () => {
  assert.equal(makeRunLabel('analysis_assim_extend'), 'Analysis Assim Extend Forecast');
  assert.equal(makeRunLabel('short_range'), 'Short Range Forecast');
});
