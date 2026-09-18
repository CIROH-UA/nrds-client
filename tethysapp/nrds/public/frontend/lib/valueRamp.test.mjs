import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lightness } from './colorMath.js';
import {
  DARK_RAMP,
  DEFAULT_RAMP_NAME,
  LIGHT_RAMP,
  NO_DATA_VALUE,
  orientRamp,
  RAMPS,
  rampFor,
  rampGradient,
  resolveRamp,
  writeColorInto,
} from './valueRamp.js';
import { computeBounds, normalizeValue } from './flowpathValues.js';

const B = { min: 0, max: 50 };
const color = (value, bounds = B) => writeColorInto(value, bounds, [0, 0, 0, 0], LIGHT_RAMP);
const LOW = [...LIGHT_RAMP[0]];
const HIGH = [...LIGHT_RAMP[LIGHT_RAMP.length - 1]];

test('NO_DATA_VALUE is the sentinel ngen writes', () => {
  assert.equal(NO_DATA_VALUE, -9998);
});

test('writeColorInto returns the ramp ends at min and max', () => {
  assert.deepEqual(color(0, B), [...LOW, 255]);
  assert.deepEqual(color(50, B), [...HIGH, 255]);
});

test('writeColorInto returns the low end for degenerate and missing bounds', () => {
  assert.deepEqual(color(5, { min: 3, max: 3 }), [...LOW, 255]);
  assert.deepEqual(color(5, null), [...LOW, 255]);
});

test('writeColorInto draws null, undefined and the sentinels as the missing colour', () => {
  assert.deepEqual(color(null), [100, 100, 100, 150]);
  assert.deepEqual(color(undefined), [100, 100, 100, 150]);
  assert.deepEqual(color(-9999), [100, 100, 100, 150]);
  assert.deepEqual(color(-9998), [100, 100, 100, 150]);
});

test('writeColorInto clamps out-of-range values instead of throwing', () => {
  assert.doesNotThrow(() => color(60));
  assert.deepEqual(color(60), [...HIGH, 255]);
  assert.deepEqual(color(-5), [...LOW, 255]);
  assert.deepEqual(color(NaN), [...LOW, 255]);
});

test('writeColorInto writes into the array it is given rather than allocating', () => {
  const target = [0, 0, 0, 0];
  assert.equal(writeColorInto(25, B, target, LIGHT_RAMP), target);
  assert.equal(target[3], 255);
  assert.notDeepEqual(target.slice(0, 3), LOW);
  assert.notDeepEqual(target.slice(0, 3), HIGH);
});

test('writeColorInto always writes alpha, so a reused target cannot leak the previous value', () => {
  const target = [0, 0, 0, 0];
  writeColorInto(-9999, B, target, LIGHT_RAMP);
  assert.equal(target[3], 150);
  writeColorInto(25, B, target, LIGHT_RAMP);
  assert.equal(target[3], 255);
});

test('writeColorInto never produces a non-finite channel across the range', () => {
  const bounds = computeBounds(Float32Array.from([0, 10, 25, 50, -9999]));
  const target = [0, 0, 0, 0];
  for (let v = -20; v <= 70; v += 0.5) {
    writeColorInto(v, bounds, target, LIGHT_RAMP);
    assert.equal(target.every((channel) => Number.isFinite(channel)), true);
  }
});

test('rampGradient renders each stop as a percentage colour stop', () => {
  const gradient = rampGradient([[0, 0, 0], [255, 255, 255]]);
  assert.equal(gradient, 'linear-gradient(to right, rgb(0,0,0) 0.0%, rgb(255,255,255) 100.0%)');
});

test('rampGradient returns an empty string for an empty ramp', () => {
  assert.equal(rampGradient([]), '');
  assert.equal(rampGradient(null), '');
  assert.equal(rampGradient(undefined), '');
});

test('rampGradient renders the light ramp as a six-stop gradient', () => {
  const gradient = rampGradient(LIGHT_RAMP);
  assert.ok(gradient.startsWith('linear-gradient(to right, '));
  assert.equal(gradient.split('%,').length, LIGHT_RAMP.length);
});

for (const [name, ramp] of [['light', LIGHT_RAMP], ['dark', DARK_RAMP]]) {
  const lightnesses = ramp.map(lightness);

  test(`the ${name} ramp reads as a magnitude: lightness only ever goes one way`, () => {
    const rises = lightnesses.every((v, i) => i === 0 || v > lightnesses[i - 1]);
    const falls = lightnesses.every((v, i) => i === 0 || v < lightnesses[i - 1]);
    assert.ok(rises || falls);
  });

  test(`the ${name} ramp separates its two ends by a distance the eye can use`, () => {
    assert.ok(Math.abs(lightnesses[0] - lightnesses[ramp.length - 1]) > 0.25);
  });

  test(`the ${name} ramp keeps every adjacent pair apart`, () => {
    for (let i = 1; i < lightnesses.length; i++) {
      assert.ok(Math.abs(lightnesses[i] - lightnesses[i - 1]) > 0.04);
    }
  });

  test(`the ${name} ramp is frozen, since one mutated stop would move the ramp everywhere`, () => {
    assert.equal(Object.isFrozen(ramp), true);
    assert.equal(Object.isFrozen(ramp[0]), true);
  });

  test(`the ${name} ramp has six stops, which is what the legend draws`, () => {
    assert.equal(ramp.length, 6);
  });
}

test('the two ramps occupy bands that do not overlap', () => {
  const lightMax = Math.max(...LIGHT_RAMP.map(lightness));
  const darkMin = Math.min(...DARK_RAMP.map(lightness));
  assert.ok(lightMax < darkMin);
});

test('the two ramps run in opposite directions, each away from its own basemap', () => {
  const lightDir = Math.sign(lightness(LIGHT_RAMP[5]) - lightness(LIGHT_RAMP[0]));
  const darkDir = Math.sign(lightness(DARK_RAMP[5]) - lightness(DARK_RAMP[0]));
  assert.equal(lightDir, -1);
  assert.equal(darkDir, 1);
});

test('DEFAULT_RAMP_NAME names a real entry in the catalog', () => {
  assert.ok(Object.prototype.hasOwnProperty.call(RAMPS, DEFAULT_RAMP_NAME));
});

test('every catalog ramp has six hex stops, matching the theme ramps the legend draws', () => {
  for (const [name, { hex }] of Object.entries(RAMPS)) {
    assert.equal(hex.length, 6, `${name} should have six stops`);
  }
});

test('rampFor returns a frozen six-stop rgb ramp for each catalog name', () => {
  for (const name of Object.keys(RAMPS)) {
    const ramp = rampFor(name);
    assert.equal(ramp.length, 6, `${name} rgb ramp length`);
    assert.equal(Object.isFrozen(ramp), true);
    for (const stop of ramp) {
      assert.equal(stop.length, 3);
      assert.ok(stop.every((c) => Number.isInteger(c) && c >= 0 && c <= 255));
    }
  }
});

test('rampFor returns null for an unknown or missing name', () => {
  assert.equal(rampFor('nope'), null);
  assert.equal(rampFor(undefined), null);
  assert.equal(rampFor(''), null);
});

test('resolveRamp picks the named ramp and falls back to the theme ramp when unknown', () => {
  assert.equal(resolveRamp(DEFAULT_RAMP_NAME, LIGHT_RAMP), rampFor(DEFAULT_RAMP_NAME));
  assert.equal(resolveRamp('nope', LIGHT_RAMP), LIGHT_RAMP);
  assert.equal(resolveRamp(undefined, DARK_RAMP), DARK_RAMP);
});

test('orientRamp reverses a copy when reversed and returns the ramp untouched otherwise', () => {
  const ramp = rampFor(DEFAULT_RAMP_NAME);
  assert.equal(orientRamp(ramp, false), ramp);
  const flipped = orientRamp(ramp, true);
  assert.notEqual(flipped, ramp);
  assert.deepEqual(flipped, [...ramp].reverse());
  assert.deepEqual(ramp, rampFor(DEFAULT_RAMP_NAME));
});

test('orientRamp tolerates an empty or missing ramp', () => {
  assert.deepEqual(orientRamp([], true), []);
  assert.equal(orientRamp(null, true), null);
  assert.equal(orientRamp(undefined, false), undefined);
});

test('normalizeValue spreads a skewed distribution across the ramp', () => {
  const skewed = Float32Array.from(
    Array.from({ length: 4000 }, (_, i) => Math.exp((i / 4000) * 8) / 10)
  );
  const bounds = computeBounds(skewed);
  const fifth = (v) => Math.min(4, Math.floor(normalizeValue(v, bounds) * 5));
  const counts = [0, 0, 0, 0, 0];
  for (const v of skewed) counts[fifth(v)] += 1;
  const share = counts.map((n) => n / skewed.length);
  assert.ok(Math.max(...share) < 0.5);
  share.forEach((s) => assert.ok(s > 0.02));
});
