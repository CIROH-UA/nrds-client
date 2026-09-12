/**
 * The value-reshaping scales behind the "Color scale" selector.
 *
 * The default 'linear' scale must stay the bent-log mapping every other ramp test assumes, so the
 * new work is behaviour-preserving there. Each other scale is asserted by sending a value chosen to
 * land on a known ramp position, so the maths is pinned rather than eyeballed. The class scales
 * (quantile, jenks) are asserted through the distribution they read, since that is the only thing
 * that makes them different from the continuous ones.
 */
import {
  DEFAULT_SCALE,
  SCALE_OPTIONS,
  SCALE_LABELS,
  jenksBreaks,
  quantileOf,
  scaleTransform,
  scaledBounds,
  strictlyIncreasing,
} from 'features/DataStream/lib/colorScale';
import { normalizeValue } from 'features/DataStream/lib/layers';
import { LIGHT_RAMP, writeColorInto } from 'features/DataStream/lib/valueRamp';

describe('the scale catalogue', () => {
  it('defaults to linear, the scale the rest of the suite assumes', () => {
    expect(DEFAULT_SCALE).toBe('linear');
    expect(SCALE_OPTIONS[0].value).toBe('linear');
  });

  it('offers exactly the seven scales the selector lists', () => {
    expect(SCALE_OPTIONS.map((o) => o.value)).toEqual([
      'linear',
      'log',
      'sqrt',
      'cbrt',
      'symlog',
      'quantile',
      'jenks',
    ]);
  });

  it('names every scale for the legend, linear being the empty one', () => {
    expect(SCALE_LABELS.linear).toBe('');
    SCALE_OPTIONS.slice(1).forEach((o) => expect(SCALE_LABELS[o.value]).toBeTruthy());
  });
});

describe('the continuous transforms land a known value on a known ramp position', () => {
  it('sqrt maps a quarter of the range to the middle', () => {
    expect(scaleTransform(25, { scale: 'sqrt', min: 0, max: 100 })).toBeCloseTo(0.5, 10);
  });

  it('cbrt maps an eighth of the range to the middle', () => {
    expect(scaleTransform(12.5, { scale: 'cbrt', min: 0, max: 100 })).toBeCloseTo(0.5, 10);
  });

  it('log maps the geometric middle of the range to the middle', () => {
    expect(scaleTransform(10, { scale: 'log', min: 1, max: 100 })).toBeCloseTo(0.5, 10);
  });

  it('symlog maps its log-region midpoint to the middle', () => {
    // max=100 makes the linear-to-log threshold 1; s(100)=3, so s(v)=1.5 at v=10^0.5.
    expect(scaleTransform(Math.sqrt(10), { scale: 'symlog', min: 0, max: 100 })).toBeCloseTo(0.5, 6);
  });

  it('clamps out-of-range values to the ends rather than running off the ramp', () => {
    expect(scaleTransform(1000, { scale: 'sqrt', min: 0, max: 100 })).toBe(1);
    expect(scaleTransform(-50, { scale: 'sqrt', min: 0, max: 100 })).toBe(0);
  });

  it('falls back (returns null) when the range is degenerate', () => {
    expect(scaleTransform(5, { scale: 'sqrt', min: 3, max: 3 })).toBeNull();
    expect(scaleTransform(5, { scale: 'log', min: 3, max: 3 })).toBeNull();
  });
});

describe('quantile maps by rank', () => {
  const sorted = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

  it('returns the fraction of samples at or below the value', () => {
    expect(quantileOf(45, sorted)).toBeCloseTo(0.5, 10);
    expect(quantileOf(-1, sorted)).toBe(0);
    expect(quantileOf(1000, sorted)).toBe(1);
  });

  it('is what the quantile scale uses, so the median sample lands mid-ramp', () => {
    expect(scaleTransform(45, { scale: 'quantile', sortedSamples: sorted })).toBeCloseTo(0.5, 10);
  });

  it('falls back when there is no sampled distribution', () => {
    expect(scaleTransform(5, { scale: 'quantile', sortedSamples: [] })).toBeNull();
  });
});

describe('jenks natural breaks', () => {
  const data = [1, 2, 3, 10, 11, 12, 50, 51, 52, 100, 101, 102, 200, 201, 500, 501];

  it('produces one fewer break than classes, strictly increasing', () => {
    const breaks = jenksBreaks(data, 6);
    expect(breaks).toHaveLength(5);
    for (let i = 1; i < breaks.length; i++) expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
  });

  it('steps a value to the bucket its value falls in', () => {
    const breaks = jenksBreaks(data, 6);
    const bounds = { scale: 'jenks', breaks };
    // Below every break -> first stop; above every break -> last stop.
    expect(scaleTransform(-100, bounds)).toBe(0);
    expect(scaleTransform(1e9, bounds)).toBe(1);
    // Monotonic across the data.
    let prev = -1;
    for (const v of [...data].sort((a, b) => a - b)) {
      const t = scaleTransform(v, bounds);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('returns nothing usable for empty data, so the caller can fall back', () => {
    expect(jenksBreaks([], 6)).toEqual([]);
  });
});

describe('strictlyIncreasing', () => {
  it('nudges equal or decreasing breaks up so no bucket is empty', () => {
    const out = strictlyIncreasing([1, 1, 1, 0.5]);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
  });
});

describe('scaledBounds', () => {
  const base = { min: 0, max: 100, curve: 2 };
  const values = Float32Array.from([1, 2, 3, 10, 20, 40, 80, -9999, -9998]);

  it('returns the bounds untouched for the linear scale', () => {
    expect(scaledBounds({ bounds: base, values, scale: 'linear', variable: 'flow' })).toBe(base);
    expect(scaledBounds({ bounds: base, values, scale: undefined, variable: 'flow' })).toBe(base);
  });

  it('tags a continuous scale onto a copy of the bounds', () => {
    const out = scaledBounds({ bounds: base, values, scale: 'sqrt', variable: 'flow' });
    expect(out).not.toBe(base);
    expect(out.scale).toBe('sqrt');
    expect(out.min).toBe(0);
  });

  it('carries a sorted, sentinel-free sample for quantile', () => {
    const out = scaledBounds({ bounds: base, values, scale: 'quantile', variable: 'flow' });
    expect(out.scale).toBe('quantile');
    expect(out.sortedSamples.every((v) => v > -9998)).toBe(true);
    const s = out.sortedSamples;
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1]);
  });

  it('carries monotonic breaks for jenks, one per ramp stop boundary', () => {
    const many = Float32Array.from(
      Array.from({ length: 200 }, (_, i) => (i % 50) + Math.floor(i / 50) * 100)
    );
    const out = scaledBounds({ bounds: base, values: many, scale: 'jenks', variable: 'flow', classes: 6 });
    expect(out.scale).toBe('jenks');
    for (let i = 1; i < out.breaks.length; i++) expect(out.breaks[i]).toBeGreaterThan(out.breaks[i - 1]);
  });

  it('falls back to plain linear bounds when a class scale has no data', () => {
    const empty = Float32Array.from([-9999, -9998]);
    expect(scaledBounds({ bounds: base, values: empty, scale: 'quantile', variable: 'v' })).toBe(base);
    expect(scaledBounds({ bounds: base, values: empty, scale: 'jenks', variable: 'v' })).toBe(base);
  });
});

describe('normalizeValue respects the scale carried by the bounds', () => {
  it('is unchanged for the default (no scale) bounds', () => {
    const linear = { min: 0, max: 50 };
    const tagged = { min: 0, max: 50, scale: 'linear' };
    expect(normalizeValue(25, tagged)).toBe(normalizeValue(25, linear));
  });

  it('reshapes by the transform when the bounds name a non-linear scale', () => {
    expect(normalizeValue(25, { min: 0, max: 100, scale: 'sqrt' })).toBeCloseTo(0.5, 10);
    expect(normalizeValue(10, { min: 1, max: 100, scale: 'log' })).toBeCloseTo(0.5, 10);
  });

  it('falls back to the linear mapping when the transform cannot apply', () => {
    // Missing distribution for a class scale -> linear result, not zero.
    const linear = normalizeValue(25, { min: 0, max: 50 });
    expect(normalizeValue(25, { min: 0, max: 50, scale: 'quantile' })).toBe(linear);
  });

  it('still draws no-data as the missing colour under any scale', () => {
    const target = writeColorInto(-9999, { min: 0, max: 100, scale: 'jenks', breaks: [10, 20] }, [0, 0, 0, 0], LIGHT_RAMP);
    expect(target).toEqual([100, 100, 100, 150]);
  });

  it('sends a mid-ramp sqrt value to the interior of the ramp, not an end', () => {
    const target = writeColorInto(25, { min: 0, max: 100, scale: 'sqrt' }, [0, 0, 0, 0], LIGHT_RAMP);
    expect(target.slice(0, 3)).not.toEqual([...LIGHT_RAMP[0]]);
    expect(target.slice(0, 3)).not.toEqual([...LIGHT_RAMP[LIGHT_RAMP.length - 1]]);
    expect(target[3]).toBe(255);
  });
});
