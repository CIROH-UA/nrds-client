/**
 * The instrument, checked before anything is measured with it.
 *
 * This whole unit rests on contrast and lightness numbers, and an earlier session in this repo
 * read oklch() values as if they were RGB and concluded a theme was broken when the measurement
 * was. So the converter is pinned against pairs whose answers are known independently.
 */
import { hexToRgb, lightness, contrastRatio, isMonotonic } from 'features/DataStream/lib/colorMath';

describe('contrastRatio', () => {
  it('gives 21 for black on white, the defined maximum', () => {
    expect(contrastRatio(hexToRgb('#000000'), hexToRgb('#ffffff'))).toBeCloseTo(21, 5);
  });

  it('gives 1 for a colour against itself', () => {
    expect(contrastRatio(hexToRgb('#4a7fb5'), hexToRgb('#4a7fb5'))).toBeCloseTo(1, 10);
  });

  it('is symmetric', () => {
    const a = hexToRgb('#1f1f1f');
    const b = hexToRgb('#e2dfda');
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it('matches a WCAG figure computed elsewhere', () => {
    // #767676 on white is the canonical 4.54:1 example -- the darkest grey that passes AA.
    expect(contrastRatio(hexToRgb('#767676'), hexToRgb('#ffffff'))).toBeCloseTo(4.54, 2);
  });
});

describe('lightness', () => {
  it('is 0 for black and 1 for white', () => {
    expect(lightness(hexToRgb('#000000'))).toBeCloseTo(0, 6);
    expect(lightness(hexToRgb('#ffffff'))).toBeCloseTo(1, 6);
  });

  it('is perceptual, not HSL', () => {
    // HSL calls both of these L=0.5. They are nothing like equally light, and mistaking one for
    // the other is exactly how a ramp ends up with an invisible middle.
    const yellow = lightness(hexToRgb('#ffff00'));
    const blue = lightness(hexToRgb('#0000ff'));
    expect(yellow).toBeGreaterThan(0.9);
    expect(blue).toBeLessThan(0.5);
  });
});

describe('isMonotonic', () => {
  it('accepts a run that only rises, and one that only falls', () => {
    expect(isMonotonic([0.2, 0.4, 0.6])).toBe(true);
    expect(isMonotonic([0.6, 0.4, 0.2])).toBe(true);
  });

  it('rejects an arch', () => {
    // The shape the shipped ramp had.
    expect(isMonotonic([0.55, 0.71, 0.86, 0.83, 0.70, 0.54])).toBe(false);
  });

  it('rejects a plateau, because two stops the same are two stops wasted', () => {
    expect(isMonotonic([0.2, 0.4, 0.4, 0.6])).toBe(false);
  });
});
