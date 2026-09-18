import { NO_DATA_VALUE } from './valueRamp.js';

/** How a reach's value is reshaped before it is mapped onto the colour ramp. */

/** The scale a fresh view uses, and the one every existing test assumes. */
export const DEFAULT_SCALE = 'linear';

/** The scales the reader can pick, in the order the dropdown lists them. */
export const SCALE_OPTIONS = Object.freeze([
  { value: 'linear', label: 'Linear' },
  { value: 'log', label: 'Log' },
  { value: 'sqrt', label: 'Square root (√)' },
  { value: 'cbrt', label: 'Cube root (∛)' },
  { value: 'symlog', label: 'Symlog' },
  { value: 'quantile', label: 'Quantile (rank)' },
  { value: 'jenks', label: 'Natural breaks (Jenks)' },
].map(Object.freeze));

/** The short name the legend appends when the scale is not the plain linear one. */
export const SCALE_LABELS = Object.freeze({
  linear: '',
  log: 'log',
  sqrt: '√',
  cbrt: '∛',
  symlog: 'symlog',
  quantile: 'rank',
  jenks: 'natural breaks',
});

/** The number of classes a class scale carves the data into, one per ramp stop. */
const DEFAULT_CLASSES = 6;

const QUANTILE_SAMPLE_CAP = 4000;
const JENKS_SAMPLE_CAP = 1000;

/** A strided, finite, sentinel-free sample of a flat value array, at most ``cap`` long. */
function sampleValues(values, cap) {
  const length = values?.length ?? 0;
  if (!length) return [];
  const stride = Math.max(1, Math.ceil(length / cap));
  const out = [];
  for (let i = 0; i < length; i += stride) {
    const v = values[i];
    if (v > NO_DATA_VALUE && Number.isFinite(v)) out.push(v);
  }
  return out;
}

const clamp01 = (t) => Math.min(Math.max(t, 0), 1);

/** The rank fraction of ``value`` within a sorted sample, 0 to 1. */
export function quantileOf(value, sorted) {
  const n = sorted?.length ?? 0;
  if (!n) return 0;
  if (value <= sorted[0]) return 0;
  if (value >= sorted[n - 1]) return 1;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo / n;
}

/** Nudge each break above the one before it, so no bucket collapses to zero width. */
export function strictlyIncreasing(breaks) {
  const out = [];
  let prev = -Infinity;
  for (const b of breaks) {
    let next = b;
    if (!(next > prev)) next = prev + Math.abs(prev) * 1e-9 + 1e-9;
    out.push(next);
    prev = next;
  }
  return out;
}

/** The Jenks dynamic-programming table of class lower limits. */
function jenksMatrices(data, nClasses) {
  const n = data.length;
  const lowerClassLimits = [];
  const varianceCombinations = [];
  for (let i = 0; i <= n; i++) {
    lowerClassLimits.push(new Array(nClasses + 1).fill(0));
    varianceCombinations.push(new Array(nClasses + 1).fill(0));
  }
  for (let i = 1; i <= nClasses; i++) {
    lowerClassLimits[1][i] = 1;
    varianceCombinations[1][i] = 0;
    for (let j = 2; j <= n; j++) varianceCombinations[j][i] = Infinity;
  }
  for (let l = 2; l <= n; l++) {
    let sum = 0;
    let sumSquares = 0;
    let w = 0;
    let variance = 0;
    for (let m = 1; m <= l; m++) {
      const lowerClassLimit = l - m + 1;
      const val = data[lowerClassLimit - 1];
      w += 1;
      sum += val;
      sumSquares += val * val;
      variance = sumSquares - (sum * sum) / w;
      const i4 = lowerClassLimit - 1;
      if (i4 !== 0) {
        for (let j = 2; j <= nClasses; j++) {
          if (varianceCombinations[l][j] >= variance + varianceCombinations[i4][j - 1]) {
            lowerClassLimits[l][j] = lowerClassLimit;
            varianceCombinations[l][j] = variance + varianceCombinations[i4][j - 1];
          }
        }
      }
    }
    lowerClassLimits[l][1] = 1;
    varianceCombinations[l][1] = variance;
  }
  return lowerClassLimits;
}

/**
 * The Jenks natural-breaks interior boundaries for ``data`` split into ``nClasses`` classes.
 *
 * Returns ``nClasses - 1`` strictly increasing break values; the class a value falls in is the
 * count of breaks it exceeds.
 */
export function jenksBreaks(data, nClasses = DEFAULT_CLASSES) {
  const sorted = [...data].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0 || nClasses < 2) return [];
  const classes = Math.min(nClasses, n);
  if (classes < 2) return [];

  const lowerClassLimits = jenksMatrices(sorted, classes);
  const boundaries = new Array(classes + 1);
  boundaries[classes] = sorted[n - 1];
  boundaries[0] = sorted[0];
  let k = n;
  let countNum = classes;
  while (countNum > 1) {
    boundaries[countNum - 1] = sorted[lowerClassLimits[k][countNum] - 2];
    k = lowerClassLimits[k][countNum] - 1;
    countNum -= 1;
  }
  return strictlyIncreasing(boundaries.slice(1, -1));
}

const scaleCache = new Map();

function classDataFor(variable, scale, values, classes) {
  const key = `${variable}::${scale}`;
  let entry = scaleCache.get(key);
  if (entry && entry.values === values && entry.classes === classes) return entry;

  entry = { values, classes };
  if (scale === 'quantile') {
    const sample = sampleValues(values, QUANTILE_SAMPLE_CAP);
    sample.sort((a, b) => a - b);
    entry.sortedSamples = sample;
  } else if (scale === 'jenks') {
    entry.breaks = jenksBreaks(sampleValues(values, JENKS_SAMPLE_CAP), classes);
  }
  scaleCache.set(key, entry);
  return entry;
}

/**
 * A bounds object carrying the current scale and any data a class scale needs.
 *
 * Linear bounds are returned untouched, so the default path stays byte-for-byte the one every
 * existing test exercises. A class scale with no usable distribution falls back to linear.
 */
export function scaledBounds({ bounds, values, scale, variable, classes = DEFAULT_CLASSES }) {
  if (!bounds || !scale || scale === 'linear') return bounds;

  if (scale === 'quantile') {
    const { sortedSamples } = classDataFor(variable, scale, values, classes);
    if (!sortedSamples?.length) return bounds;
    return { ...bounds, scale, sortedSamples };
  }
  if (scale === 'jenks') {
    const { breaks } = classDataFor(variable, scale, values, classes);
    if (!breaks?.length) return bounds;
    return { ...bounds, scale, breaks };
  }
  return { ...bounds, scale };
}

/**
 * Where ``value`` sits on the ramp, 0 to 1, under the scale carried by ``bounds``.
 *
 * Returns null when the scale cannot be applied (missing data or a degenerate range), so the
 * caller can fall back to the linear mapping.
 */
export function scaleTransform(value, bounds) {
  const { scale, min, max } = bounds;
  const range = max - min;
  switch (scale) {
    case 'log': {
      const lo = Math.max(min, 1e-6);
      const hi = Math.max(max, lo);
      const denom = Math.log10(hi) - Math.log10(lo);
      if (!(denom > 0)) return null;
      return clamp01((Math.log10(Math.max(value, 1e-6)) - Math.log10(lo)) / denom);
    }
    case 'sqrt': {
      if (!(range > 0)) return null;
      const v = Math.min(Math.max(value, min), max);
      return clamp01(((v - min) / range) ** 0.5);
    }
    case 'cbrt': {
      if (!(range > 0)) return null;
      const v = Math.min(Math.max(value, min), max);
      return clamp01(((v - min) / range) ** (1 / 3));
    }
    case 'symlog': {
      const lt = Math.max(max / 100, 1e-6);
      const s = (v) => (v <= lt ? v / lt : 1 + Math.log10(Math.max(v, 1e-9) / lt));
      const sMin = s(min);
      const denom = s(max) - sMin;
      if (!(denom > 0)) return null;
      return clamp01((s(value) - sMin) / denom);
    }
    case 'quantile': {
      const sorted = bounds.sortedSamples;
      if (!sorted?.length) return null;
      return clamp01(quantileOf(value, sorted));
    }
    case 'jenks': {
      const breaks = bounds.breaks;
      if (!breaks?.length) return null;
      let bucket = 0;
      while (bucket < breaks.length && value > breaks[bucket]) bucket += 1;
      return clamp01(bucket / breaks.length);
    }
    default:
      return null;
  }
}
