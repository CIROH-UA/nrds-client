/**
 * Every map colour is a colour maplibre can read.
 *
 * This exists because of a defect it would have caught. The selection highlight was moved onto
 * the app's accent and written as oklch(), which is valid CSS, renders correctly everywhere else
 * in the interface, and passed a palette test that parsed it with our own converter. maplibre's
 * style-spec parser is CSS Color 3 only: it returned undefined, the paint property was invalid,
 * and the highlight silently stopped drawing. Clicking a catchment and searching for one both
 * looked like they had failed.
 *
 * The lesson is narrower than "test the colour". The colour was right. What was never asked is
 * whether the thing that has to consume it could.
 */
import fs from 'fs';
import path from 'path';

import { Color } from '@maplibre/maplibre-gl-style-spec';

const scss = fs.readFileSync(path.join(__dirname, '../../../App.scss'), 'utf8');

// Only the tokens that end up in a paint property. The interface's own colours are read by the
// browser, which does support CSS Color 4, and several of them are deliberately oklch.
const PAINT_TOKEN = /(--map-[a-z-]*(?:color|fill|outline|stroke)[a-z-]*):\s*([^;]+);/g;

const tokens = [...scss.matchAll(PAINT_TOKEN)].map(([, name, value]) => [name, value.trim()]);

describe('map paint tokens', () => {
  it('finds tokens to check, so a broken pattern cannot pass silently', () => {
    expect(tokens.length).toBeGreaterThanOrEqual(12);
  });

  it.each(tokens)('%s = %s parses', (_name, value) => {
    expect(Color.parse(value)).toBeDefined();
  });

  it('rejects the notation that broke the highlight, so this test can fail', () => {
    // Guarding the guard: if a future maplibre parses oklch, this flips and the comment above
    // becomes history rather than a live constraint.
    expect(Color.parse('oklch(0.520 0.090 175 / 0.28)')).toBeUndefined();
  });
});

describe('the map keeps its contrast promises', () => {
  const {
    contrastRatio,
    hexToRgb,
    parseColor,
    perceptualDistance,
  } = require('features/DataStream/lib/colorMath');
  const {
    DARK_SURFACES,
    LIGHT_SURFACES,
  } = require('features/DataStream/lib/basemapSurfaces');

  const light = scss.slice(0, scss.indexOf('/* Dark theme override */'));
  const dark = scss.slice(scss.indexOf('/* Dark theme override */'));
  const tokenIn = (block, name) => parseColor(block.match(new RegExp(`${name}:\\s*([^;]+);`))[1]);

  /**
   * The network is measured by how different it looks, not by how much lighter or darker it is.
   *
   * It is drawn in water's own colour, which sits near 2:1 against the basemap in WCAG terms --
   * and WCAG contrast is a ratio of relative luminance, so it is blind to hue by construction.
   * That makes it the right instrument for the value ramp, where lightness is what carries the
   * value, and the wrong one here, where the question is only whether a stream reads as a stream.
   *
   * The bar is 0.15 in OKLab, which is around seven times a just-noticeable difference.
   */
  const MIN_SEPARATION = 0.15;

  it.each([['light', LIGHT_SURFACES], ['dark', DARK_SURFACES]])(
    'the %s network is plainly a different colour from every basemap surface',
    (theme, surfaces) => {
      const colour = tokenIn(theme === 'light' ? light : dark, '--map-flowpaths-color');
      Object.entries(surfaces).forEach(([, surface]) => {
        expect(perceptualDistance(colour, hexToRgb(surface)))
          .toBeGreaterThanOrEqual(MIN_SEPARATION);
      });
    }
  );

  it.each([['light', LIGHT_SURFACES, '#80deea'], ['dark', DARK_SURFACES, '#31353f']])(
    'a %s stream still reads as separate from the lake it runs into',
    (_theme, surfaces, water) => {
      // Drawing rivers in water's colour is the convention; drawing them indistinguishably from
      // open water is not.
      const colour = tokenIn(surfaces === LIGHT_SURFACES ? light : dark, '--map-flowpaths-color');
      expect(perceptualDistance(colour, hexToRgb(water))).toBeGreaterThanOrEqual(MIN_SEPARATION);
    }
  );

  /**
   * A ceiling as well as a floor.
   *
   * #0b0e10 measured 12:1 against the basemap -- it cleared the floor by a mile and was still
   * wrong, because the static network is structure and the animation drawn on top of it is the
   * data. Ink that dark made the reaches with nothing to say the loudest thing on the map.
   */
  it.each([['light', LIGHT_SURFACES], ['dark', DARK_SURFACES]])(
    'draws the %s network as structure rather than as ink',
    (theme, surfaces) => {
      const block = theme === 'light' ? light : dark;
      const colour = tokenIn(block, '--map-flowpaths-color');
      const loudest = Math.max(
        ...Object.values(surfaces).map((s2) => contrastRatio(colour, hexToRgb(s2)))
      );
      expect(loudest).toBeLessThanOrEqual(8);
    }
  );

  /**
   * A static reach and an animated one are never the same colour.
   *
   * This used to compare chroma, on the reasoning that the network should be less saturated than
   * the data drawn over it. That held while the network was a blue-grey and stopped holding the
   * moment it became water-coloured -- a saturated cyan is not quieter than a dark red, it is
   * somewhere else entirely. Which is the actual requirement: the two must not be confusable,
   * and separation says that where chroma only said it by accident.
   */
  it.each([['light', 'LIGHT_RAMP'], ['dark', 'DARK_RAMP']])(
    'no %s ramp stop can be mistaken for the static network',
    (theme, rampName) => {
      const ramp = require('features/DataStream/lib/valueRamp')[rampName];
      const network = tokenIn(theme === 'light' ? light : dark, '--map-flowpaths-color');

      ramp.forEach((stop) => {
        expect(perceptualDistance(network, stop)).toBeGreaterThanOrEqual(0.1);
      });
    }
  );

});
