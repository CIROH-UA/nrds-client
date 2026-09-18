import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startVpuLoad,
  endVpuLoad,
  vpuLoadInFlight,
  currentVpuGeneration,
  cancelVpuLoads,
  resetLoadState,
} from './loadState.js';

test('startVpuLoad hands out a rising generation that reads as current', () => {
  resetLoadState();
  const g1 = startVpuLoad();
  assert.equal(currentVpuGeneration(), g1);
  assert.equal(g1 === currentVpuGeneration(), true);
});

test('a superseded load is not the current generation', () => {
  resetLoadState();
  const older = startVpuLoad();
  const newer = startVpuLoad();
  assert.equal(newer > older, true);
  assert.equal(older === currentVpuGeneration(), false);
  assert.equal(newer === currentVpuGeneration(), true);
});

test('cancelVpuLoads supersedes the in-flight generation without starting one', () => {
  resetLoadState();
  const g = startVpuLoad();
  const bumped = cancelVpuLoads();
  assert.equal(bumped > g, true);
  assert.equal(g === currentVpuGeneration(), false);
  assert.equal(vpuLoadInFlight(), true);
});

test('vpuLoadInFlight tracks outstanding loads and never goes negative', () => {
  resetLoadState();
  assert.equal(vpuLoadInFlight(), false);
  startVpuLoad();
  startVpuLoad();
  assert.equal(vpuLoadInFlight(), true);
  endVpuLoad();
  assert.equal(vpuLoadInFlight(), true);
  endVpuLoad();
  assert.equal(vpuLoadInFlight(), false);
  endVpuLoad();
  assert.equal(vpuLoadInFlight(), false);
});
