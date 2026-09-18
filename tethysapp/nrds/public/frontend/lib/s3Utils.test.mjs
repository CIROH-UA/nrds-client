import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makePrefix, makeOutputUrl } from './s3Utils.js';

test('makePrefix builds the troute output key without an ensemble segment', () => {
  assert.equal(
    makePrefix('cfe_nom', 'ngen.20260913', 'short_range', '00', null, 'VPU_01', 'troute.parquet'),
    'outputs/cfe_nom/v2.2_hydrofabric/ngen.20260913/short_range/00/VPU_01/ngen-run/outputs/troute/troute.parquet'
  );
});

test('makePrefix inserts the ensemble segment when one is given', () => {
  assert.equal(
    makePrefix('cfe_nom', 'ngen.20260913', 'medium_range', '06', 'ens01', 'VPU_16', 'out.parquet'),
    'outputs/cfe_nom/v2.2_hydrofabric/ngen.20260913/medium_range/06/ens01/VPU_16/ngen-run/outputs/troute/out.parquet'
  );
});

test('makeOutputUrl prefixes the datastream bucket for a bare key', () => {
  assert.equal(
    makeOutputUrl('outputs/cfe_nom/x/troute.parquet'),
    'https://ciroh-community-ngen-datastream.s3.us-east-1.amazonaws.com/outputs/cfe_nom/x/troute.parquet'
  );
});

test('makeOutputUrl leaves an absolute url untouched', () => {
  const url = 'https://example.com/troute.parquet';
  assert.equal(makeOutputUrl(url), url);
});
