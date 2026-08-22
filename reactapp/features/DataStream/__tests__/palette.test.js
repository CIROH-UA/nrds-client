/**
 * The palette is one family, and the map's selection is the app's accent.
 *
 * App.scss had accumulated neutrals from six design systems -- the intended oklch hue-249 set,
 * Tailwind's at 261-265, pure achromatic greys, Google's #5f6368, Flat UI and Bootstrap. At the
 * chroma some of those carry, a sixteen-degree hue error is visible across a panel, which is
 * most of why the interface read as assembled rather than designed.
 *
 * This reads the stylesheet rather than the rendered tokens: jsdom does not apply App.scss, so
 * there is nothing to read at runtime, and the file is the source anyway.
 */
import fs from 'fs';
import path from 'path';

import {
  contrastRatio,
  hexToRgb,
  lightness,
  parseColor,
} from 'features/DataStream/lib/colorMath';
import { DARK_SURFACES, LIGHT_SURFACES, MIN_CONTRAST } from 'features/DataStream/lib/basemapSurfaces';

const scss = fs.readFileSync(path.join(__dirname, '../../../App.scss'), 'utf8');

const FAMILY_HUE = 249;
// How far a neutral may lean off the family's hue axis, in OKLab chroma. Perceptually nothing;
// an eight-bit rounding artefact sits around 0.001 and a genuine stray around 0.009.
const MAX_OFF_AXIS = 0.004;
// Above this a colour is a deliberate one -- a chart line, a status, the brand -- not a neutral.
const NEUTRAL_MAX_CHROMA = 0.05;

/**
 * Colours this rule does not govern, each for a stated reason.
 *
 * Bootstrap's $theme-colors feed component styles well outside this app's surface, so correcting
 * them is a different task with a different blast radius. Pure white and black have no hue to
 * correct, and a tint at the extremes of the lightness range is imperceptible anyway.
 */
const EXEMPT = new Set(['#f8f9fa', '#2c3e50', '#32465b', '#ffffff', '#000000']);

const chromaOf = ([r, g, b]) => {
  const L = lightness([r, g, b]);
  // Recovering chroma from the same OKLab the lightness came from.
  const srgb = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const [lr, lg, lb] = [srgb(r), srgb(g), srgb(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(a, bb), H: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
};

describe('the neutral family', () => {
  const hexes = [...new Set(scss.match(/#[0-9a-fA-F]{6}\b/g) || [])]
    .map((h) => h.toLowerCase())
    .filter((h) => !EXEMPT.has(h));

  it('finds colours to check, so a broken regex cannot pass silently', () => {
    expect(hexes.length).toBeGreaterThan(20);
  });

  /**
   * Measured as distance from the family's hue axis, not as a hue tolerance.
   *
   * At the chroma a neutral carries -- around 0.008 -- eight-bit rounding moves the reported hue
   * by ten degrees or more, so a tolerance in degrees flags colours that are perceptually
   * identical. What matters is how far the colour leans off the axis, which is C·sin(Δh), and at
   * these chromas that is about 0.001: two orders of magnitude below anything visible. A real
   * stray like Tailwind's #111827 leans 0.009, which is what this catches.
   */
  it('has every neutral on one hue axis', () => {
    const strays = hexes
      .map((hex) => ({ hex, ...chromaOf(hexToRgb(hex)) }))
      .filter(({ C }) => C < NEUTRAL_MAX_CHROMA)
      .map((c) => ({
        ...c,
        offAxis: c.C * Math.abs(Math.sin((((c.H - FAMILY_HUE + 180) % 360) - 180) * (Math.PI / 180))),
      }))
      .filter(({ offAxis }) => offAxis > MAX_OFF_AXIS)
      .map(({ hex, offAxis }) => `${hex} leans ${offAxis.toFixed(4)} off the family axis`);

    expect(strays).toEqual([]);
  });

  it('has no pure grey left in the mid range, where a missing tint shows', () => {
    // #212121, #666666 and #cccccc were the Material and web-safe holdovers.
    const greys = hexes
      .map((hex) => ({ hex, ...chromaOf(hexToRgb(hex)) }))
      .filter(({ C, L }) => C < 0.004 && L > 0.18 && L < 0.95)
      .map(({ hex }) => hex);

    expect(greys).toEqual([]);
  });
});

describe('the selection highlight', () => {
  const tokenIn = (block, name) => {
    const slice = scss.slice(scss.indexOf(block));
    const m = slice.match(new RegExp(`${name}:\\s*([^;]+);`));
    return m && parseColor(m[1].replace(/\s*\/\s*[\d.]+\s*\)/, ')'));
  };

  const lightOutline = tokenIn('/* Base (light) theme */', '--map-divides-highlight-outline');
  const darkOutline = tokenIn('/* Dark theme override */', '--map-divides-highlight-outline');

  it('parses out of the stylesheet, so the rest of this describes something real', () => {
    expect(lightOutline).not.toBeNull();
    expect(darkOutline).not.toBeNull();
  });

  it.each(Object.entries(LIGHT_SURFACES))(
    'is visible on the light basemap over %s',
    (_name, surface) => {
      expect(contrastRatio(lightOutline, hexToRgb(surface))).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  );

  it.each(Object.entries(DARK_SURFACES))(
    'is visible on the dark basemap over %s',
    (_name, surface) => {
      expect(contrastRatio(darkOutline, hexToRgb(surface))).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  );

  it('is the app accent rather than a colour of its own', () => {
    // It was #fd00fd -- a pure magenta, the only place that colour appeared, chosen to be
    // unmissable rather than designed. The point of the change is that the map now uses the
    // same hue as the focus ring and the active nav pill.
    // The hue is what has to match. Each theme's lightness is tuned to the basemap it sits on,
    // so they are the same colour in the sense that matters and not the same value.
    const accentHue = chromaOf(parseColor('oklch(0.540 0.090 175)')).H;
    expect(Math.abs(chromaOf(lightOutline).H - accentHue)).toBeLessThan(2);
    expect(Math.abs(chromaOf(darkOutline).H - accentHue)).toBeLessThan(2);
  });

  it('fills without obscuring, so the catchment underneath still reads', () => {
    const fill = scss.match(/--map-divides-highlight-fill:\s*oklch\([^)]*\/\s*([\d.]+)\s*\)/);
    expect(Number(fill[1])).toBeLessThanOrEqual(0.35);
  });
});
