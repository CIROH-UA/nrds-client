import { normalizeValue } from './flowpathValues.js';
import { hexToRgb } from './colorMath.js';

/** The colours the animated reaches are drawn in. */

/** One ramp per theme, because one ramp cannot serve both. */
export const LIGHT_RAMP = Object.freeze(
  ['#1f74b0', '#18609f', '#104a97', '#2b18a4', '#480729', '#2f0502'].map(hexToRgb).map(Object.freeze)
);

export const DARK_RAMP = Object.freeze(
  ['#2991e5', '#31a9ea', '#38c1f0', '#40daf2', '#fbd189', '#fde7d5'].map(hexToRgb).map(Object.freeze)
);

/** The user-selectable colour ramps, each a name plus its six hex stops (low value -> high). */
export const RAMPS = Object.freeze({
  datastream: { label: 'Datastream', hex: ['#0077b6', '#00b4d8', '#90e0ef', '#ffba08', '#ff6b35', '#d00000'] },
  viridis: { label: 'Viridis', hex: ['#440154', '#3b528b', '#21918c', '#5ec962', '#addc30', '#fde725'] },
  turbo: { label: 'Turbo', hex: ['#30123b', '#4669db', '#26d07c', '#d2e935', '#fb8022', '#7a0403'] },
  blues: { label: 'Blues', hex: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c', '#08306b'] },
  reds: { label: 'Reds', hex: ['#fff5f0', '#fcbba1', '#fb6a4a', '#de2d26', '#a50f15', '#67000d'] },
});

/** The default ramp a fresh view colours with. */
export const DEFAULT_RAMP_NAME = 'datastream';

const RAMP_RGB = Object.freeze(
  Object.fromEntries(
    Object.entries(RAMPS).map(([name, { hex }]) => [
      name,
      Object.freeze(hex.map(hexToRgb).map(Object.freeze)),
    ])
  )
);

/** The rgb ramp for a name, or null when the name is unknown (callers fall back to the theme ramp). */
export const rampFor = (name) => RAMP_RGB[name] ?? null;

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
