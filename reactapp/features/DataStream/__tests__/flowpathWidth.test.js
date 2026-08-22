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
import { FLOWPATHS_WIDTH_STOPS, widthAtZoom } from 'features/DataStream/lib/layers';

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
