import { normalizeValue } from 'features/DataStream/lib/layers';
import { hexToRgb } from 'features/DataStream/lib/colorMath';

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

/**
 * One ramp per theme, because one ramp cannot serve both.
 *
 * Solving for the lightness band that clears 3:1 against every surface the basemaps paint gives
 * L 0.08-0.55 on the light one and L 0.60-0.98 on the dark one. Those bands do not overlap, so
 * no single set of colours can stay visible on both, whatever its hues -- which is what the
 * shipped ramp tried to do, and why half of it disappeared in each theme.
 *
 * Within its band each ramp is monotonic in lightness, low flow to high. That is what makes a
 * reach's value readable at all on a line two pixels wide, where lightness is most of what the
 * eye resolves, and it doubles as the colour-blind safety net: adjacent stops differ by about
 * 0.07 in lightness, which survives any hue confusion.
 *
 * The hue path runs blue to violet to magenta to red, skipping the green and olive band that
 * makes spectral ramps read as camouflage, and keeping the cool-low warm-high convention readers
 * of flow maps expect.
 *
 * These live in JS rather than in App.scss with the other map colours, deliberately. Every stop
 * is load-bearing against measured constraints, and the test next door checks all of them; a
 * six-colour ramp is not something to hand-edit in a stylesheet without re-running that audit.
 */
export const LIGHT_RAMP = Object.freeze(
  ['#2272b9', '#5f27d5', '#721878', '#62103a', '#4a090b', '#260f03'].map(hexToRgb).map(Object.freeze)
);

export const DARK_RAMP = Object.freeze(
  ['#2a8ade', '#9788f3', '#ee79f5', '#f8a8c7', '#faccc7', '#fdeae1'].map(hexToRgb).map(Object.freeze)
);

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
 *
 * ``scale`` is required rather than defaulted. A default would be one theme's ramp, and a caller
 * that forgot to pass one would silently draw the wrong theme -- the exact failure mapTheme.js
 * was written to end, where every fallback happened to be the light value.
 */
export function writeColorInto(value, bounds, target, scale) {
  if (value === null || value === undefined || value <= -9998) {
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

/**
 * The ramp as a CSS gradient, for the legend bar.
 *
 * Here rather than in the legend so the bar and the reaches are drawn from one array. The legend
 * used to import the ramp as a constant, which is how it spent its whole life showing the light
 * colours over the dark basemap.
 *
 * Not asserted through the DOM: jsdom's CSS parser drops linear-gradient outright, so a test
 * that read the rendered style attribute would find nothing and pass for the wrong reason.
 */
export const rampGradient = (ramp) => {
  if (!ramp?.length) return '';
  const last = ramp.length - 1 || 1;
  const stops = ramp
    .map(([r, g, b], i) => `rgb(${r},${g},${b}) ${((i / last) * 100).toFixed(1)}%`)
    .join(', ');
  return `linear-gradient(to right, ${stops})`;
};
