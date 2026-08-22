/**
 * Colour arithmetic, so a claim about a colour can be a test rather than an opinion.
 *
 * The ramp is required to be monotonic in lightness and to clear a contrast floor against the
 * basemap it is drawn on. Neither is checkable by eye, and both were got wrong: the shipped ramp
 * rose and fell through the same lightness twice, and its middle sat at 1.04 against the light
 * basemap's own water fill.
 *
 * OKLCH rather than HSL for lightness, because HSL's L is not perceptual -- it calls #ffff00 and
 * #0000ff equally light, which is the mistake this file exists to prevent.
 */

const srgbToLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** [r, g, b] from '#rrggbb'. */
export const hexToRgb = (hex) => {
  const h = hex.trim().replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

const linearToSrgb = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};

/** [r, g, b] from oklch components. Out-of-gamut values are clipped, as a browser would. */
export const oklchToRgb = (L, C, hDeg) => {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
};

/**
 * [r, g, b] from whatever notation a token happens to use, or null.
 *
 * The palette is written in three: hex, oklch(), and rgba(). Any audit of it has to read all
 * three or it silently skips the ones it cannot parse and reports that everything passed.
 */
export const parseColor = (value) => {
  const v = String(value).trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return hexToRgb(v);
  const oklch = v.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (oklch) return oklchToRgb(...oklch.slice(1, 4).map(Number));
  const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return rgb.slice(1, 4).map(Number);
  return null;
};

/** Perceptual lightness, 0 to 1. */
export const lightness = ([r, g, b]) => {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
};

const relativeLuminance = ([r, g, b]) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

/** WCAG contrast ratio between two [r, g, b] colours, 1 to 21. */
export const contrastRatio = (a, b) => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * Whether a run of lightnesses only ever goes one way.
 *
 * The shipped ramp went 0.55 up to 0.86 and back down to 0.54, so its two ends were the same
 * weight -- and on a line two pixels wide, weight is most of what the eye has to work with.
 */
export const isMonotonic = (values) =>
  values.every((v, i) => i === 0 || v > values[i - 1]) ||
  values.every((v, i) => i === 0 || v < values[i - 1]);
