import { addPaths } from 'features/DataStream/lib/layers';
import { shouldPromptZoom } from 'features/DataStream/components/map/flowPathLayer';

/**
 * The animated geometry came from queryRenderedFeatures, which answers for the current
 * viewport only. Every move replaced the whole set, so moving away from a reach dropped it, and
 * below the tileset's flowpath minzoom of 7 the query returns nothing at all and the animation
 * had no data to draw. deck.gl has no zoom limit of its own: keeping what has been collected is
 * enough to make playback work at any scale over ground already seen.
 */
const feature = (id, coords) => ({
  properties: { id },
  geometry: { type: 'LineString', coordinates: coords },
});

const index = { 'wb-1': 0, 'wb-2': 1, 'wb-3': 2 };

describe('accumulating flowpath geometry', () => {
  test('keeps reaches seen earlier when a later view has none', () => {
    const store = new Map();

    addPaths(store, [feature('wb-1', [[0, 0], [1, 1]])], index);
    // Zoomed out past minzoom 7: the query comes back empty.
    const added = addPaths(store, [], index);

    expect(added).toBe(0);
    expect(store.size).toBe(1);
  });

  test('grows as new ground is covered', () => {
    const store = new Map();

    expect(addPaths(store, [feature('wb-1', [[0, 0], [1, 1]])], index)).toBe(1);
    expect(addPaths(store, [feature('wb-2', [[2, 2], [3, 3]])], index)).toBe(1);
    expect(store.size).toBe(2);
  });

  test('stores a reach once however many viewports show it', () => {
    const store = new Map();
    const f = feature('wb-1', [[0, 0], [1, 1]]);

    addPaths(store, [f], index);
    const added = addPaths(store, [f, f], index);

    expect(added).toBe(0);
    expect(store.size).toBe(1);
  });

  test('ignores features outside the loaded vpu', () => {
    const store = new Map();

    // Neighbouring vpus share a tile: the sample z7 tile held vpu 14 and 16 together.
    const added = addPaths(store, [feature('wb-9999', [[0, 0], [1, 1]])], index);

    expect(added).toBe(0);
    expect(store.size).toBe(0);
  });

  test('splits a multi-part reach into its own entries', () => {
    const store = new Map();

    addPaths(store, [{
      properties: { id: 'wb-1' },
      geometry: { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] },
    }], index);

    expect([...store.keys()]).toEqual(['wb-1-0', 'wb-1-1']);
    // Both halves read the same value, since they are one reach.
    expect([...store.values()].map((p) => p.featureIndex)).toEqual([0, 0]);
  });
});

describe('where a feature carries its id', () => {
  /**
   * The two archives disagree, and both have to work. merged.pmtiles puts the id in properties
   * as "wb-2862525" and leaves the MVT feature id null; upstream_index/flowpaths.pmtiles puts
   * the bare number on the feature itself and has no properties.id at all. A pre-filter in the
   * map component knew only about the properties form, so after the switch it discarded every
   * feature and nothing was ever collected. addPaths is the one place that decides.
   */
  test('reads the id off the feature when properties has none', () => {
    const store = new Map();
    // The upstream_index shape, verified against a live tile.
    const added = addPaths(store, [{
      id: 2863415,
      properties: { toid: 2863416, order: 1, divide_id: 2863415, upstream_id: 688106 },
      geometry: { type: 'LineString', coordinates: [[-111.9, 40.6], [-111.8, 40.5]] },
    }], { '2863415': 7 });

    expect(added).toBe(1);
    expect([...store.values()][0].featureIndex).toBe(7);
  });

  test('still reads the wb- form out of properties', () => {
    const store = new Map();
    // The merged.pmtiles shape: no feature id, prefixed id in properties.
    const added = addPaths(store, [{
      properties: { id: 'wb-2862525', vpuid: '16' },
      geometry: { type: 'LineString', coordinates: [[-111.9, 40.6], [-111.8, 40.5]] },
    }], { 'wb-2862525': 3, '2862525': 3 });

    expect(added).toBe(1);
    expect([...store.values()][0].featureIndex).toBe(3);
  });

  test('a numeric feature id and a matching index built from bigints agree', () => {
    // getDistinctFeatureIds returns bigints from duckdb, so the index keys are their strings.
    const store = new Map();
    const index = {};
    index[String(2863415n)] = 0;

    const added = addPaths(store, [{
      id: 2863415,
      properties: {},
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    }], index);

    expect(added).toBe(1);
  });

  test('skips a feature with no id anywhere', () => {
    const store = new Map();
    const added = addPaths(store, [{
      properties: { order: 1 },
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    }], { '2863415': 0 });

    expect(added).toBe(0);
  });
});

describe('the zoom prompt once geometry is collected', () => {
  // Below the configured floor, which is what the prompt is about.
  const loaded = {
    visible: true,
    valuesByVar: new Float32Array([1, 2, 3, 4]),
    timesArr: ['t0', 't1'],
    zoom: 0.5,
  };

  test('prompts when nothing has been collected yet', () => {
    expect(shouldPromptZoom({ ...loaded, collectedPaths: 0 })).toBe(true);
  });

  test('stays quiet once there is something drawn, whatever the zoom', () => {
    // Otherwise it contradicts the animation running in front of the reader.
    expect(shouldPromptZoom({ ...loaded, collectedPaths: 120 })).toBe(false);
  });

  test('treats a missing count as nothing collected', () => {
    expect(shouldPromptZoom(loaded)).toBe(true);
  });
});

describe('keeping the most detailed capture', () => {
  const reach = (coords) => ({
    id: 'wb-1',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  });
  const coarse = [[0, 0], [1, 1]];
  const detailed = [[0, 0], [0.4, 0.5], [0.7, 0.8], [1, 1]];

  test('a closer look replaces a coarser one', () => {
    const store = new Map();
    addPaths(store, [reach(coarse)], { 'wb-1': 0 }, 4);

    // The tileset simplifies at low zoom, so the same reach read closer has more vertices.
    expect(addPaths(store, [reach(detailed)], { 'wb-1': 0 }, 9)).toBe(1);
    expect(store.get('wb-1').path).toHaveLength(4);
  });

  test('a wider look does not undo it', () => {
    const store = new Map();
    addPaths(store, [reach(detailed)], { 'wb-1': 0 }, 9);

    expect(addPaths(store, [reach(coarse)], { 'wb-1': 0 }, 4)).toBe(0);
    expect(store.get('wb-1').path).toHaveLength(4);
  });

  test('the same zoom twice is not a change', () => {
    const store = new Map();
    addPaths(store, [reach(coarse)], { 'wb-1': 0 }, 7);
    expect(addPaths(store, [reach(coarse)], { 'wb-1': 0 }, 7)).toBe(0);
  });

  test('records the zoom it read each path at', () => {
    const store = new Map();
    addPaths(store, [reach(coarse)], { 'wb-1': 0 }, 7.4);
    expect(store.get('wb-1').zoom).toBe(7.4);
  });
});
