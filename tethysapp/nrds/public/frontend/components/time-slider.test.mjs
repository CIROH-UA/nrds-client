import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sliderMax, clampIndex, frameDelayMs } from './time-slider.js';

test('sliderMax is one less than the frame count, never below zero', () => {
  assert.equal(sliderMax(10), 9);
  assert.equal(sliderMax(1), 0);
  assert.equal(sliderMax(0), 0);
  assert.equal(sliderMax(undefined), 0);
});

test('clampIndex holds a frame index inside the current range', () => {
  assert.equal(clampIndex(5, 10), 5);
  assert.equal(clampIndex(-3, 10), 0);
  assert.equal(clampIndex(99, 10), 9);
  assert.equal(clampIndex(0, 0), 0);
});

test('clampIndex rounds and treats a non-number as zero', () => {
  assert.equal(clampIndex(4.6, 10), 5);
  assert.equal(clampIndex('7', 10), 7);
  assert.equal(clampIndex(NaN, 10), 0);
  assert.equal(clampIndex(undefined, 10), 0);
});

test('frameDelayMs divides the base frame time by the speed, floored, at least 1ms', () => {
  assert.equal(frameDelayMs(2500, 1), 2500);
  assert.equal(frameDelayMs(2500, 10), 250);
  assert.equal(frameDelayMs(2500, 16), 156);
});

test('frameDelayMs never returns less than 1ms and treats bad speed as 1', () => {
  assert.equal(frameDelayMs(1, 1000), 1);
  assert.equal(frameDelayMs(2500, 0), 2500);
  assert.equal(frameDelayMs(2500, -4), 2500);
  assert.equal(frameDelayMs(2500, NaN), 2500);
});
