/**
 * deck.gl gates drawing on `visible` but not attribute updates, so a hidden layer fed a live
 * frame index would recompute colour and width for every path on every step of a playback
 * nobody can see. The props builder is separated from the component so that can be asserted
 * without a canvas or a deck.gl instance.
 */
import { flowPathLayerProps } from 'features/DataStream/components/map/flowPathLayer';

const base = {
  visible: true,
  valuesByVar: Float32Array.from([1, 2, 3, 4]),
  timesArr: ['t0', 't1'],
  variable: 'flow',
  bounds: { min: 0, max: 4 },
  pathData: [{ path: [[0, 0], [1, 1]], featureIndex: 0 }],
  currentTimeIndex: 0,
  pathTick: 0,
  zoom: 10,
};

const triggersOf = (overrides) => flowPathLayerProps({ ...base, ...overrides }).updateTriggers;

describe('flowPathLayerProps', () => {
  it('has nothing to draw without values, times or paths', () => {
    expect(flowPathLayerProps({ ...base, valuesByVar: null })).toBe(null);
    expect(flowPathLayerProps({ ...base, timesArr: [] })).toBe(null);
    expect(flowPathLayerProps({ ...base, pathData: [] })).toBe(null);
  });

  it('advances the triggers with the frame while visible', () => {
    expect(triggersOf({ currentTimeIndex: 4 })).not.toEqual(triggersOf({ currentTimeIndex: 5 }));
  });

  it('freezes the triggers while hidden, so no frame causes a recompute', () => {
    const atFour = triggersOf({ visible: false, currentTimeIndex: 4 });
    const atFive = triggersOf({ visible: false, currentTimeIndex: 5 });

    expect(atFour).toEqual(atFive);
    expect(atFour.getColor).toEqual(atFive.getColor);
    expect(atFour.getWidth).toEqual(atFive.getWidth);
  });

  it('recomputes once when the layer is shown again', () => {
    const hidden = triggersOf({ visible: false, currentTimeIndex: 7 });
    const shown = triggersOf({ visible: true, currentTimeIndex: 7 });

    // A changed trigger is what makes deck.gl rebuild the attributes it skipped while hidden.
    expect(hidden).not.toEqual(shown);
  });

  it('keeps the layer mounted when hidden rather than dropping it', () => {
    const props = flowPathLayerProps({ ...base, visible: false });

    expect(props).not.toBe(null);
    expect(props.visible).toBe(false);
  });

  it('still varies with the variable and the path tick while visible', () => {
    expect(triggersOf({ variable: 'precipitation' })).not.toEqual(triggersOf({ variable: 'flow' }));
    expect(triggersOf({ pathTick: 1 })).not.toEqual(triggersOf({ pathTick: 0 }));
  });

  /**
   * The animation is drawn over the static flowpaths, and used to ignore zoom entirely: a fixed
   * 1-4.5 px whatever the scale, against a network that is 0.6 px at zoom 2 and 2 px at zoom 10.
   * Zoomed out it read as several times heavier than the reaches it follows.
   *
   * The value still varies the width, but now as a multiple of the static curve rather than an
   * independent range, so the animation reads as the same network at every scale. The multiple
   * lives in getWidth and the curve in widthScale, which is what keeps a zoom from recomputing
   * every path's width: widthScale is a uniform, and only updateTriggers rebuild attributes.
   */
  describe('width against the static curve', () => {
    const propsAt = (overrides) => flowPathLayerProps({ ...base, ...overrides });
    const widthOf = (props, featureIndex = 0) =>
      props.getWidth({ featureIndex }, { target: [] });

    it('scales by the static width at the current zoom', () => {
      // The published stops: 0.6 at zoom 2, 1 at zoom 7, 2 at zoom 10.
      expect(propsAt({ zoom: 2 }).widthScale).toBeCloseTo(0.6, 10);
      expect(propsAt({ zoom: 7 }).widthScale).toBeCloseTo(1, 10);
      expect(propsAt({ zoom: 10 }).widthScale).toBeCloseTo(2, 10);
    });

    it('multiplies that curve by the value, never going under it', () => {
      // bounds are 0-4 and feature 0 holds the minimum, so it sits at the bottom of the ramp.
      const props = propsAt({ bounds: { min: 0, max: 4 }, currentTimeIndex: 0 });
      expect(widthOf(props)).toBeGreaterThanOrEqual(1);
      expect(widthOf(props)).toBeLessThanOrEqual(3);
    });

    it('keeps the 4.5 px ceiling the old constants encoded', () => {
      // At zoom 10 the curve alone reaches 2, and a maximum value would take it to 6. The cap is
      // why the animation stopped burying the basemap, and nothing here supersedes that.
      expect(propsAt({ zoom: 10 }).widthMaxPixels).toBe(4.5);
    });

    it('draws a reach with nothing to report thinner than the network', () => {
      // Sentinel and null both mean no value; it should recede rather than assert a low one.
      const props = propsAt({ valuesByVar: Float32Array.from([-9999, -9999, -9999, -9999]) });
      expect(widthOf(props)).toBeLessThan(1);
      expect(props.widthMinPixels).toBeGreaterThan(0);
    });

    it('does not rebuild every path just because the view moved', () => {
      // The whole reason the curve is a scale and not part of getWidth. A zoom that changed the
      // triggers would recompute the width attribute for every reach on every frame of a pinch.
      expect(propsAt({ zoom: 2 }).updateTriggers.getWidth)
        .toEqual(propsAt({ zoom: 10 }).updateTriggers.getWidth);
      expect(propsAt({ zoom: 2 }).updateTriggers.getColor)
        .toEqual(propsAt({ zoom: 10 }).updateTriggers.getColor);
    });
  });
});
