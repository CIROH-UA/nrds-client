import { flowPathLayerProps, shouldPromptZoom } from 'features/DataStream/components/map/flowPathLayer';
import { FLOWPATHS_MIN_ZOOM } from 'features/DataStream/lib/layers';
import { LIGHT_RAMP } from 'features/DataStream/lib/valueRamp';

/**
 * The prompt exists because flowpath geometry has a floor: below the tileset's minzoom the
 * tiles carry no flowpath features, queryRenderedFeatures returns nothing, and the animated
 * layer has nothing to build from, so playback drew an empty frame with no explanation.
 *
 * That floor was 7 with merged.pmtiles and is 1 with upstream_index/flowpaths.pmtiles, so the
 * prompt is now nearly unreachable. It stays because the floor is a property of whichever
 * archive is configured, not a constant of the app.
 */
const loaded = {
  visible: true,
  valuesByVar: new Float32Array([1, 2, 3, 4]),
  timesArr: ['2022-08-01T00:00:00Z', '2022-08-01T01:00:00Z'],
};

describe('prompting for zoom instead of animating nothing', () => {
  test('the threshold is read from the tileset, not invented', () => {
    // upstream_index/flowpaths.pmtiles declares its flowpaths layer as zoom 1 to 10.
    expect(FLOWPATHS_MIN_ZOOM).toBe(1);
  });

  test('a CONUS-wide view no longer needs a prompt, because geometry exists there', () => {
    expect(shouldPromptZoom({ ...loaded, zoom: 4 })).toBe(false);
  });

  test('quiet at and above the floor', () => {
    expect(shouldPromptZoom({ ...loaded, zoom: FLOWPATHS_MIN_ZOOM })).toBe(false);
    expect(shouldPromptZoom({ ...loaded, zoom: 11 })).toBe(false);
  });

  test('still prompts below the floor, whatever the configured archive makes that', () => {
    expect(shouldPromptZoom({ ...loaded, zoom: FLOWPATHS_MIN_ZOOM - 0.5 })).toBe(true);
  });

  test('stays quiet with no animation data, rather than sending anyone to an empty map', () => {
    expect(shouldPromptZoom({ ...loaded, valuesByVar: null, zoom: 4 })).toBe(false);
    expect(shouldPromptZoom({ ...loaded, timesArr: [], zoom: 4 })).toBe(false);
  });

  test('stays quiet when the flowpath layer is switched off', () => {
    expect(shouldPromptZoom({ ...loaded, visible: false, zoom: 4 })).toBe(false);
  });
});

describe('animated path width', () => {
  const props = (value) =>
    flowPathLayerProps({
      visible: true,
      // One reach, two times, so index 0 at time 0 is `value`.
      valuesByVar: Float32Array.from([value, value]),
      timesArr: ['t0', 't1'],
      variable: 'flow',
      bounds: { min: 0, max: 100 },
      pathData: [{ id: 'wb-1', featureIndex: 0, path: [[0, 0], [1, 1]] }],
      currentTimeIndex: 0,
      pathTick: 0,
      ramp: LIGHT_RAMP,
    });

  test('stays narrower than the widest static flowpath line at 2 px', () => {
    // The static layer draws 0.6 to 2 px; the animation reading five times heavier than the
    // network it follows was what buried the basemap.
    const widest = props(100).getWidth({ featureIndex: 0 });
    expect(widest).toBeLessThanOrEqual(4.5);
    expect(props(100).widthMaxPixels).toBeLessThanOrEqual(4.5);
  });

  test('still varies with value, since the width is what carries it', () => {
    const low = props(0).getWidth({ featureIndex: 0 });
    const high = props(100).getWidth({ featureIndex: 0 });
    expect(high).toBeGreaterThan(low * 2);
  });

  test('a reach with no data recedes below the minimum', () => {
    const missing = props(-9999).getWidth({ featureIndex: 0 });
    expect(missing).toBeLessThan(props(0).getWidth({ featureIndex: 0 }));
  });
});

/**
 * The prompt counts what is drawn, not what is held.
 *
 * The store keeps every reach ever seen and is never pruned, so once the zoom filter arrived the
 * two stopped meaning the same thing: a store full of reaches collected close up draws nothing
 * at all over a whole vpu. Counting the store there suppresses the one message that explains
 * why -- the reader is told nothing while looking at an empty map.
 */
describe('what shouldPromptZoom counts', () => {
  const base = { visible: true, valuesByVar: { streamflow: {} }, timesArr: [1, 2], zoom: 0.5 };

  it('prompts when the store is full but nothing is visible at this zoom', () => {
    // What the reader sees: an empty map, and a store holding everything they gathered close up.
    const gatheredCloseUp = [{ id: 'wb-1', minZoom: 9 }, { id: 'wb-2', minZoom: 11 }];

    expect(shouldPromptZoom({ ...base, paths: gatheredCloseUp })).toBe(true);
  });

  it('stays quiet once something is actually drawn', () => {
    const drawnHere = [{ id: 'wb-1', minZoom: 9 }, { id: 'wb-2', minZoom: 0 }];

    expect(shouldPromptZoom({ ...base, paths: drawnHere })).toBe(false);
  });

  it('does not scan the store at a zoom that could not show the message', () => {
    const paths = { some: jest.fn(() => false) };

    expect(shouldPromptZoom({ ...base, zoom: 8, paths })).toBe(false);
    expect(paths.some).not.toHaveBeenCalled();
  });
});
