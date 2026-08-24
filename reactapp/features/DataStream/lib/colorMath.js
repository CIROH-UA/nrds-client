/** Colour arithmetic, so a claim about a colour can be a test rather than an opinion. */

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

/** [r, g, b] from whatever notation a token happens to use, or null. */
export const parseColor = (value) => {
  const v = String(value).trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return hexToRgb(v);
  const oklch = v.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (oklch) return oklchToRgb(...oklch.slice(1, 4).map(Number));
  const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return rgb.slice(1, 4).map(Number);
  return null;
};

/** An sRGB colour in OKLab: [L, a, b]. */
const toOklab = ([r, g, b]) => {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
};

/** Perceptual lightness, 0 to 1. */
export const lightness = (rgb) => toOklab(rgb)[0];

const relativeLuminance = ([r, g, b]) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

/** WCAG contrast ratio between two [r, g, b] colours, 1 to 21. */
export const contrastRatio = (a, b) => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** How far apart two colours look, in OKLab. */
export const perceptualDistance = (a, b) => {
  const [al, aa, ab] = toOklab(a);
  const [bl, ba, bb] = toOklab(b);
  return Math.hypot(al - bl, aa - ba, ab - bb);
};

/** Whether a run of lightnesses only ever goes one way. */
export const isMonotonic = (values) =>
  values.every((v, i) => i === 0 || v > values[i - 1]) ||
  values.every((v, i) => i === 0 || v < values[i - 1]);
