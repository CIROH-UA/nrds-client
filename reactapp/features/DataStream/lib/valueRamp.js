import { normalizeValue } from 'features/DataStream/lib/layers';
import { hexToRgb } from 'features/DataStream/lib/colorMath';

/** The colours the animated reaches are drawn in. */

/** One ramp per theme, because one ramp cannot serve both. */
export const LIGHT_RAMP = Object.freeze(
  ['#1f74b0', '#18609f', '#104a97', '#2b18a4', '#480729', '#2f0502'].map(hexToRgb).map(Object.freeze)
);

export const DARK_RAMP = Object.freeze(
  ['#2991e5', '#31a9ea', '#38c1f0', '#40daf2', '#fbd189', '#fde7d5'].map(hexToRgb).map(Object.freeze)
);

const MISSING_COLOR = [100, 100, 100, 150];

/** Writes the color for one value into ``target`` and returns it. */
/** What ngen writes where a reach has no value at a timestep. */
export const NO_DATA_VALUE = -9998;

export function writeColorInto(value, bounds, target, scale) {
  if (value === null || value === undefined || value <= NO_DATA_VALUE) {
    target[0] = MISSING_COLOR[0];
    target[1] = MISSING_COLOR[1];
    target[2] = MISSING_COLOR[2];
    target[3] = MISSING_COLOR[3];
    return target;
  }
  const t = normalizeValue(value, bounds);
  const idx = t * (scale.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const frac = idx - lower;
  const from = scale[lower];
  const to = scale[upper];
  target[0] = Math.round(from[0] + (to[0] - from[0]) * frac);
  target[1] = Math.round(from[1] + (to[1] - from[1]) * frac);
  target[2] = Math.round(from[2] + (to[2] - from[2]) * frac);
  target[3] = 255;
  return target;
}

/** The ramp as a CSS gradient, for the legend bar. */
export const rampGradient = (ramp) => {
  if (!ramp?.length) return '';
  const last = ramp.length - 1 || 1;
  const stops = ramp
    .map(([r, g, b], i) => `rgb(${r},${g},${b}) ${((i / last) * 100).toFixed(1)}%`)
    .join(', ');
  return `linear-gradient(to right, ${stops})`;
};
