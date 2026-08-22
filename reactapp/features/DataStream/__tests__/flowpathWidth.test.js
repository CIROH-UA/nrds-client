/**
 * The zoom curve the static flowpaths are drawn on.
 *
 * Characterisation: these values are what `line-width: { stops: [[2, 0.6], [7, 1], [10, 2]] }`
 * already renders, written down before anything else starts reading them. maplibre's legacy zoom
 * function interpolates linearly between stops with the default base of 1, and clamps outside
 * the range rather than extrapolating, so a reach at zoom 14 is drawn at the zoom-10 width.
 *
 * They are shared because the animated layer is about to follow the same curve, and a second
 * copy of three numbers in another file is how the two would drift apart.
 */
import {
  FLOWPATHS_WIDTH_STOPS,
  animationIsOnMap,
  quantiseZoom,
  widthAtZoom,
} from 'features/DataStream/lib/flowpaths';

describe('widthAtZoom', () => {
  it('returns each published stop exactly', () => {
    expect(widthAtZoom(2)).toBe(0.6);
    expect(widthAtZoom(7)).toBe(1);
    expect(widthAtZoom(10)).toBe(2);
  });

  it('interpolates linearly between stops', () => {
    // Halfway from zoom 2 to zoom 7 is halfway from 0.6 to 1.
    expect(widthAtZoom(4.5)).toBeCloseTo(0.8, 10);
    // And a third of the way from 7 to 10 is a third of the way from 1 to 2.
    expect(widthAtZoom(8)).toBeCloseTo(1 + 1 / 3, 10);
  });

  it('clamps outside the range rather than extrapolating', () => {
    // Extrapolating below the first stop would head towards zero and then negative.
    expect(widthAtZoom(0)).toBe(0.6);
    expect(widthAtZoom(1.9)).toBe(0.6);
    expect(widthAtZoom(12)).toBe(2);
    expect(widthAtZoom(22)).toBe(2);
  });

  it('answers the first stop for a zoom it cannot read', () => {
    // A NaN width draws nothing at all, silently, which is worse than a line of the wrong size.
    expect(widthAtZoom(undefined)).toBe(0.6);
    expect(widthAtZoom(null)).toBe(0.6);
    expect(widthAtZoom(NaN)).toBe(0.6);
  });

  it('cannot be edited by whoever it is handed to', () => {
    // The same array goes into a maplibre paint spec and into the interpolator above. Shared by
    // reference, a mutation anywhere would move the curve for both without touching either file.
    expect(Object.isFrozen(FLOWPATHS_WIDTH_STOPS)).toBe(true);
    expect(Object.isFrozen(FLOWPATHS_WIDTH_STOPS[0])).toBe(true);
  });

  it('publishes the stops in the shape maplibre wants', () => {
    // MapLayers spreads this straight into a paint spec, so the array is the contract.
    expect(FLOWPATHS_WIDTH_STOPS).toEqual([[2, 0.6], [7, 1], [10, 2]]);
  });
});

/**
 * Whether the animation is on the map.
 *
 * The slider docks on this and playback stops on it, and the two had already drifted: the slider
 * was keyed on the vpu and sat over a dead clock after the panel closed, while playback ignored
 * the layer toggle and resumed by itself when the reaches came back. Both ask this now.
 */
describe('animationIsOnMap', () => {
  it('is on the map with a clock and a visible layer', () => {
    expect(animationIsOnMap({ times: [1, 2], flowpathsVisible: true })).toBe(true);
  });

  it('is not on the map once the clock is emptied', () => {
    // What closing the panel does: resetVPU drops the arrays and leaves the vpu selected.
    expect(animationIsOnMap({ times: [], flowpathsVisible: true })).toBe(false);
  });

  it('is not on the map with the layer hidden', () => {
    expect(animationIsOnMap({ times: [1, 2], flowpathsVisible: false })).toBe(false);
  });

  it('answers false rather than undefined before anything is loaded', () => {
    // The slider renders this straight into JSX, where a stray undefined leaks into the DOM.
    expect(animationIsOnMap({})).toBe(false);
    expect(animationIsOnMap({ times: undefined, flowpathsVisible: undefined })).toBe(false);
  });
});

/**
 * How often the animated widths are actually redrawn.
 *
 * maplibre fires 'zoom' continuously through a gesture and the animated layer subscribes to it,
 * so without this a pinch rebuilds the deck.gl layer per frame. What matters is not the number
 * of renders on its own but that quantising them does not visibly separate the animated widths
 * from the static ones they are meant to match, which is what the last case measures.
 */
describe('quantiseZoom', () => {
  it('snaps to quarter steps', () => {
    expect(quantiseZoom(7.06)).toBe(7);
    expect(quantiseZoom(7.13)).toBe(7.25);
    expect(quantiseZoom(7.4)).toBe(7.5);
  });

  it('gives the same answer across a frame-by-frame drift', () => {
    // The point of it: a gesture creeping through a quarter step renders once, not sixteen times.
    const frames = [8.01, 8.02, 8.04, 8.05, 8.07, 8.09, 8.1, 8.11];

    expect(new Set(frames.map(quantiseZoom)).size).toBe(1);
  });

  it('answers a number for a zoom it cannot read', () => {
    // Feeds widthAtZoom, where a NaN draws nothing at all and does it silently.
    expect(quantiseZoom(undefined)).toBe(0);
    expect(quantiseZoom(NaN)).toBe(0);
  });

  it('never moves the animated width a visible distance from the static one', () => {
    // Half a step is the worst case. The steepest stretch of the curve climbs a third of a pixel
    // per zoom level, so the gap has to stay far below anything a reader could see.
    let worst = 0;
    for (let z = 2; z <= 10; z += 0.01) {
      worst = Math.max(worst, Math.abs(widthAtZoom(z) - widthAtZoom(quantiseZoom(z))));
    }

    expect(worst).toBeLessThan(0.05);
  });
});
