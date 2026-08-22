/**
 * The flowpath colour ramp.
 *
 * deck.gl calls this once per flowpath per animation frame, so it writes into the reusable
 * target array deck.gl supplies rather than returning a new one.
 *
 * The interior of the ramp is asserted by behaviour rather than by pinned RGB values. It used to
 * pin numbers captured from the original square-root scale, which said nothing about whether the
 * ramp was legible: over a real vpu it put roughly every reach in the bottom fifth, and the map
 * drew as one flat blue with a handful of coloured lines through it. What matters is that the
 * ramp is ordered, that a small value is visibly off the bottom, and that a typical reach lands
 * somewhere in the middle. Endpoints stay pinned, since those are the ramp's definition.
 */
import { computeBounds, normalizeValue } from 'features/DataStream/lib/layers';
import { writeColorInto } from 'features/DataStream/lib/valueRamp';

const B = { min: 0, max: 50 };
const color = (value, bounds = B) => writeColorInto(value, bounds, [0, 0, 0, 0]);

describe('writeColorInto', () => {
  // [name, value, bounds, expected rgb] -- alpha is asserted separately below.
  const cases = [
    ['at min', 0, B, [0, 119, 187]],
    ['at max', 50, B, [208, 0, 0]],
    ['degenerate bounds', 5, { min: 3, max: 3 }, [0, 119, 187]],
    ['no bounds', 5, null, [0, 119, 187]],
  ];

  it.each(cases)('%s', (_name, value, bounds, rgb) => {
    expect(color(value, bounds)).toEqual([...rgb, 255]);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['missing sentinel', -9999],
    ['the sentinel boundary', -9998],
  ])('draws %s as the missing color', (_name, value) => {
    expect(color(value)).toEqual([100, 100, 100, 150]);
  });

  // Out of range used to index past the end of the scale and throw inside a deck.gl accessor.
  it.each([
    ['above max', 60, [208, 0, 0]],
    ['below min', -5, [0, 119, 187]],
    ['NaN', NaN, [0, 119, 187]],
  ])('clamps %s instead of throwing', (_name, value, rgb) => {
    expect(() => color(value)).not.toThrow();
    expect(color(value)).toEqual([...rgb, 255]);
  });

  it('writes into the array it is given rather than allocating', () => {
    const target = [0, 0, 0, 0];
    expect(writeColorInto(25, B, target)).toBe(target);
    expect(target[3]).toBe(255);
    // Somewhere in the ramp rather than at either end, which is all this test is about.
    expect(target.slice(0, 3)).not.toEqual([0, 119, 187]);
    expect(target.slice(0, 3)).not.toEqual([208, 0, 0]);
  });

  it('always writes alpha, so a reused target cannot leak the previous value', () => {
    const target = [0, 0, 0, 0];
    writeColorInto(-9999, B, target);
    expect(target[3]).toBe(150);
    writeColorInto(25, B, target);
    expect(target[3]).toBe(255);
  });

  it('never produces a non-finite channel across the range', () => {
    const bounds = computeBounds(Float32Array.from([0, 10, 25, 50, -9999]));
    const target = [0, 0, 0, 0];
    for (let v = -20; v <= 70; v += 0.5) {
      writeColorInto(v, bounds, target);
      expect(target.every((channel) => Number.isFinite(channel))).toBe(true);
    }
  });
});

describe('the ramp is usable across a skewed distribution', () => {
  // What a vpu of streamflow actually looks like: most reaches tiny, a few main stems huge.
  const skewed = Float32Array.from(
    Array.from({ length: 4000 }, (_, i) => Math.exp((i / 4000) * 8) / 10)
  );
  const bounds = computeBounds(skewed);
  const fifth = (v) => Math.min(4, Math.floor(normalizeValue(v, bounds) * 5));

  it('spreads the reaches across the ramp instead of piling them at the bottom', () => {
    const counts = [0, 0, 0, 0, 0];
    for (const v of skewed) counts[fifth(v)] += 1;
    const share = counts.map((n) => n / skewed.length);

    // The defect: the bottom fifth held nearly everything. No fifth should now hold half.
    expect(Math.max(...share)).toBeLessThan(0.5);
    // And every band should be doing some work.
    share.forEach((s) => expect(s).toBeGreaterThan(0.02));
  });

  it('is ordered', () => {
    let previous = -1;
    for (let v = bounds.min; v <= bounds.max; v += (bounds.max - bounds.min) / 200) {
      const t = normalizeValue(v, bounds);
      expect(t).toBeGreaterThanOrEqual(previous);
      previous = t;
    }
  });

  it('puts a small but real value clearly off the bottom', () => {
    // A reach an order of magnitude below the trimmed maximum should not read as "no flow".
    expect(normalizeValue(bounds.max / 10, bounds)).toBeGreaterThan(0.15);
  });

  it('saturates rather than running off the end of the scale', () => {
    expect(normalizeValue(bounds.max * 1000, bounds)).toBe(1);
    expect(normalizeValue(bounds.min - 1000, bounds)).toBe(0);
  });
});

describe('computeBounds', () => {
  it('ignores the missing-value sentinel', () => {
    expect(computeBounds(Float32Array.from([-9999, 4, 8, -9998]))).toMatchObject({ min: 4, max: 8 });
  });

  it('falls back to 0..1 when nothing is valid', () => {
    expect(computeBounds(Float32Array.from([-9999, -9999]))).toMatchObject({ min: 0, max: 1 });
    expect(computeBounds(new Float32Array())).toMatchObject({ min: 0, max: 1 });
  });

  it('trims the ends, so one main stem cannot flatten the ramp', () => {
    // 99 ordinary reaches and one three orders of magnitude above them.
    const values = Float32Array.from([...Array.from({ length: 99 }, (_, i) => i + 1), 100000]);
    expect(computeBounds(values).max).toBeLessThan(1000);
  });

  it('reports the curve it fitted, so colour and width can share it', () => {
    expect(computeBounds(Float32Array.from([1, 2, 3, 40, 500])).curve).toBeGreaterThan(0);
  });
});
