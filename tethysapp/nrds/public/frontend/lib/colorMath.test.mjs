import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  hexToRgb,
  lightness,
  contrastRatio,
  perceptualDistance,
  isMonotonic,
} from './colorMath.js';

const closeTo = (actual, expected, digits) =>
  assert.ok(
    Math.abs(actual - expected) < 0.5 * 10 ** -digits,
    `expected ${actual} to be within ${digits} digits of ${expected}`
  );

test('contrastRatio gives 21 for black on white, the defined maximum', () => {
  closeTo(contrastRatio(hexToRgb('#000000'), hexToRgb('#ffffff')), 21, 5);
});

test('contrastRatio gives 1 for a colour against itself', () => {
  closeTo(contrastRatio(hexToRgb('#4a7fb5'), hexToRgb('#4a7fb5')), 1, 10);
});

test('contrastRatio is symmetric', () => {
  const a = hexToRgb('#1f1f1f');
  const b = hexToRgb('#e2dfda');
  closeTo(contrastRatio(a, b), contrastRatio(b, a), 10);
});

test('contrastRatio matches a WCAG figure computed elsewhere', () => {
  closeTo(contrastRatio(hexToRgb('#767676'), hexToRgb('#ffffff')), 4.54, 2);
});

test('lightness is 0 for black and 1 for white', () => {
  closeTo(lightness(hexToRgb('#000000')), 0, 6);
  closeTo(lightness(hexToRgb('#ffffff')), 1, 6);
});

test('lightness is perceptual, not HSL', () => {
  const yellow = lightness(hexToRgb('#ffff00'));
  const blue = lightness(hexToRgb('#0000ff'));
  assert.ok(yellow > 0.9);
  assert.ok(blue < 0.5);
});

test('hexToRgb parses the three channels', () => {
  assert.deepEqual(hexToRgb('#1f74b0'), [31, 116, 176]);
  assert.deepEqual(hexToRgb('#ffffff'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('#000000'), [0, 0, 0]);
});

test('isMonotonic accepts a run that only rises, and one that only falls', () => {
  assert.equal(isMonotonic([0.2, 0.4, 0.6]), true);
  assert.equal(isMonotonic([0.6, 0.4, 0.2]), true);
});

test('isMonotonic rejects an arch', () => {
  assert.equal(isMonotonic([0.55, 0.71, 0.86, 0.83, 0.70, 0.54]), false);
});

test('isMonotonic rejects a plateau, because two stops the same are two stops wasted', () => {
  assert.equal(isMonotonic([0.2, 0.4, 0.4, 0.6]), false);
});

test('perceptualDistance is zero for a colour against itself', () => {
  closeTo(perceptualDistance(hexToRgb('#1f9ec7'), hexToRgb('#1f9ec7')), 0, 10);
});

test('perceptualDistance is symmetric', () => {
  const a = hexToRgb('#1f9ec7');
  const b = hexToRgb('#e2dfda');
  closeTo(perceptualDistance(a, b), perceptualDistance(b, a), 10);
});

test('perceptualDistance sees a difference that contrast cannot', () => {
  const cyan = hexToRgb('#1f9ec7');
  const olive = hexToRgb('#8f8f52');
  assert.ok(contrastRatio(cyan, olive) < 1.4);
  assert.ok(perceptualDistance(cyan, olive) > 0.1);
});

test('perceptualDistance scales with how far apart things actually look', () => {
  const white = hexToRgb('#ffffff');
  assert.ok(
    perceptualDistance(white, hexToRgb('#000000')) >
      perceptualDistance(white, hexToRgb('#888888'))
  );
});
