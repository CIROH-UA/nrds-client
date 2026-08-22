import { normalizeValue } from 'features/DataStream/lib/layers';

/**
 * The colours the animated reaches are drawn in.
 *
 * Split out of lib/layers.js so the ramp has somewhere to live that is about colour. The value
 * maths it depends on -- normalizeValue, and computeBounds behind it -- stays there, because
 * getWidth shares it: a reach's width and its colour ride the same curve on purpose, so a reach
 * cannot read wide and cool at once.
 *
 * The ramp itself is theme data, read from tokens by readMapTheme and passed in. It used to be a
 * module constant, which is why the same six colours were drawn over a near-white basemap and a
 * near-black one.
 */

// Hoisted to module scope: writeColorInto runs once per flowpath per animation frame, and
// rebuilding these seven arrays on every call cost about half its runtime.
export const COLOR_SCALE = [
  [0, 119, 187],
  [0, 180, 216],
  [144, 224, 239],
  [255, 186, 8],
  [255, 107, 53],
  [208, 0, 0],
];
const MISSING_COLOR = [100, 100, 100, 150];

/**
 * Writes the color for one value into ``target`` and returns it.
 *
 * deck.gl hands every accessor a reusable ``target`` array precisely so colors can be
 * produced without allocating (see the performance guide, "avoid creating new objects in
 * accessors"). This is called once per flowpath per animation frame, so returning a fresh
 * array meant tens of thousands of short-lived arrays per second.
 *
 * Alpha is always written. The array deck.gl supplies is reused between calls, so leaving
 * the fourth slot alone would inherit the previous path's alpha.
 */
export function writeColorInto(value, bounds, target) {
  if (value === null || value === undefined || value <= -9998) {
    target[0] = MISSING_COLOR[0];
    target[1] = MISSING_COLOR[1];
    target[2] = MISSING_COLOR[2];
    target[3] = MISSING_COLOR[3];
    return target;
  }
  const t = normalizeValue(value, bounds);
  const idx = t * (COLOR_SCALE.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const frac = idx - lower;
  const from = COLOR_SCALE[lower];
  const to = COLOR_SCALE[upper];
  target[0] = Math.round(from[0] + (to[0] - from[0]) * frac);
  target[1] = Math.round(from[1] + (to[1] - from[1]) * frac);
  target[2] = Math.round(from[2] + (to[2] - from[2]) * frac);
  target[3] = 255;
  return target;
}
