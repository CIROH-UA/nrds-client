/**
 * What the animated ramp has to be true of.
 *
 * These are the acceptance criteria from the visual-coherence plan, written as assertions
 * because none of them can be judged by eye. The ramp that shipped before failed all three:
 * its lightness rose and fell through the same values twice, so the driest and the most
 * flooded reach were drawn at the same weight; its middle sat at 1.12 against the light
 * basemap; and that middle was #90e0ef against a water fill of #80deea, a contrast of 1.04.
 *
 * Reaches are drawn between 0.25 and 4.5 px wide, and at that size lightness is most of what
 * the eye resolves. Hue is a label; lightness is the reading.
 */
import { contrastRatio, hexToRgb, isMonotonic, lightness } from 'features/DataStream/lib/colorMath';
import {
  DARK_SURFACES,
  LIGHT_SURFACES,
  MIN_CONTRAST,
} from 'features/DataStream/lib/basemapSurfaces';
import { DARK_RAMP, LIGHT_RAMP } from 'features/DataStream/lib/valueRamp';

// The bands that clear MIN_CONTRAST against every surface of each basemap, solved during
// planning. They do not overlap, which is why there are two ramps rather than one.
const BANDS = {
  light: [0.08, 0.55],
  dark: [0.60, 0.98],
};

const themes = [
  ['light', LIGHT_RAMP, LIGHT_SURFACES, BANDS.light],
  ['dark', DARK_RAMP, DARK_SURFACES, BANDS.dark],
];

describe.each(themes)('the %s ramp', (name, ramp, surfaces, [floor, ceiling]) => {
  const lightnesses = ramp.map(lightness);

  it('reads as a magnitude: lightness only ever goes one way', () => {
    expect(isMonotonic(lightnesses)).toBe(true);
  });

  it('separates its two ends by a distance the eye can use', () => {
    // The specific failure of the ramp this replaced, which ended 0.011 apart.
    expect(Math.abs(lightnesses[0] - lightnesses[ramp.length - 1])).toBeGreaterThan(0.25);
  });

  it('keeps every adjacent pair apart, which is also the colour-blind safety net', () => {
    // Hue confusion cannot merge two stops that differ in lightness.
    ramp.slice(1).forEach((_, i) => {
      expect(Math.abs(lightnesses[i + 1] - lightnesses[i])).toBeGreaterThan(0.04);
    });
  });

  it('stays inside the band that is visible on this basemap', () => {
    lightnesses.forEach((l) => {
      expect(l).toBeGreaterThanOrEqual(floor);
      expect(l).toBeLessThanOrEqual(ceiling);
    });
  });

  it.each(Object.entries(surfaces))(
    `clears ${MIN_CONTRAST}:1 against %s`,
    (_surfaceName, surface) => {
      const bg = hexToRgb(surface);
      ramp.forEach((stop) => {
        expect(contrastRatio(stop, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      });
    }
  );

  it('is frozen, since one mutated stop would move the ramp everywhere it is read', () => {
    expect(Object.isFrozen(ramp)).toBe(true);
    expect(Object.isFrozen(ramp[0])).toBe(true);
  });

  it('has six stops, which is what the legend draws', () => {
    expect(ramp).toHaveLength(6);
  });
});

describe('the water trap', () => {
  it('never draws a reach the colour of the lake it runs into', () => {
    // The defect this test exists for: median flow was #90e0ef, the light basemap paints water
    // #80deea, and the two are 1.04 apart. In a hydrology tool.
    const water = hexToRgb(LIGHT_SURFACES.water);
    LIGHT_RAMP.forEach((stop) => {
      expect(contrastRatio(stop, water)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  });

  it('holds on the dark basemap too', () => {
    const water = hexToRgb(DARK_SURFACES.water);
    DARK_RAMP.forEach((stop) => {
      expect(contrastRatio(stop, water)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  });
});

describe('the two ramps together', () => {
  it('occupy bands that do not overlap', () => {
    // The measurement that decided the design. If these ever met, one ramp would do.
    const lightMax = Math.max(...LIGHT_RAMP.map(lightness));
    const darkMin = Math.min(...DARK_RAMP.map(lightness));
    expect(lightMax).toBeLessThan(darkMin);
  });

  it('run in opposite directions, each away from its own basemap', () => {
    const lightDir = Math.sign(lightness(LIGHT_RAMP[5]) - lightness(LIGHT_RAMP[0]));
    const darkDir = Math.sign(lightness(DARK_RAMP[5]) - lightness(DARK_RAMP[0]));
    expect(lightDir).toBe(-1);
    expect(darkDir).toBe(1);
  });
});
