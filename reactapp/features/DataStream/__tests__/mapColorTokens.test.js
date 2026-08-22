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
  const { contrastRatio, hexToRgb, parseColor } = require('features/DataStream/lib/colorMath');
  const {
    DARK_SURFACES,
    LIGHT_SURFACES,
    MIN_CONTRAST,
  } = require('features/DataStream/lib/basemapSurfaces');

  const light = scss.slice(0, scss.indexOf('/* Dark theme override */'));
  const dark = scss.slice(scss.indexOf('/* Dark theme override */'));
  const tokenIn = (block, name) => parseColor(block.match(new RegExp(`${name}:\\s*([^;]+);`))[1]);

  it.each(Object.entries(LIGHT_SURFACES))(
    'the light-theme flowpaths read over %s',
    (_n, surface) => {
      // They were #0b0e10, which is ink rather than water and at 12:1 was the loudest thing on
      // the map -- louder than the animation drawn on top of it.
      expect(contrastRatio(tokenIn(light, '--map-flowpaths-color'), hexToRgb(surface)))
        .toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  );

  it.each(Object.entries(DARK_SURFACES))(
    'the dark-theme flowpaths read over %s',
    (_n, surface) => {
      // Paul Tol's #0077bb measured 2.48 here, below the bar the rest of the map holds to.
      expect(contrastRatio(tokenIn(dark, '--map-flowpaths-color'), hexToRgb(surface)))
        .toBeGreaterThanOrEqual(MIN_CONTRAST);
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

  it('draws the static network more quietly than the animation over it', () => {
    // Chroma is what separates "structure" from "a value". The ramp stops carry 0.09 and up.
    const { LIGHT_RAMP } = require('features/DataStream/lib/valueRamp');
    const chroma = ([r, g, b]) => {
      const f = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
      const [lr, lg, lb] = [f(r), f(g), f(b)];
      const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
      const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
      const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
      return Math.hypot(
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
      );
    };

    const network = chroma(tokenIn(light, '--map-flowpaths-color'));
    const quietestRampStop = Math.min(...LIGHT_RAMP.map(chroma));
    expect(network).toBeLessThan(quietestRampStop);
  });
});
