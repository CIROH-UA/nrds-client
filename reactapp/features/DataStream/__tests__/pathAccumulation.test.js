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
    expect(shouldPromptZoom({ ...loaded, paths: [] })).toBe(true);
  });

  test('stays quiet once there is something drawn, whatever the zoom', () => {
    // Otherwise it contradicts the animation running in front of the reader.
    expect(shouldPromptZoom({ ...loaded, paths: [{ id: 'wb-1', minZoom: 0 }] })).toBe(false);
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

    addPaths(store, [reach(coarse)], { 'wb-1': 0 }, 4);

    expect(store.get('wb-1').path).toHaveLength(4);
  });

  test('but a wider look is a change, because it changes what is drawn', () => {
    // This asserted 0 while the only thing a wider view could tell us was geometry we already
    // had. It now also tells us the reach is served at zoom 4, which moves it into the set drawn
    // over the whole vpu -- so the caller does need to rebuild.
    const store = new Map();
    addPaths(store, [reach(detailed)], { 'wb-1': 0 }, 9);

    expect(addPaths(store, [reach(coarse)], { 'wb-1': 0 }, 4)).toBe(1);
    expect(store.get('wb-1').minZoom).toBe(4);

    // And a second identical wide look is not.
    expect(addPaths(store, [reach(coarse)], { 'wb-1': 0 }, 4)).toBe(0);
  });

  test('the same zoom twice is not a change', () => {
    const store = new Map();
    addPaths(store, [reach(coarse)], { 'wb-1': 0 }, 7);
    expect(addPaths(store, [reach(coarse)], { 'wb-1': 0 }, 7)).toBe(0);
  });

  test('records the zoom it read each path at, quantised', () => {
    // Quantised on the way in so the tag and the overlay's filter are in the same units; see
    // the "zoom units" block below for why that is not a detail.
    const store = new Map();
    addPaths(store, [reach(coarse)], { 'wb-1': 0 }, 7.4);
    expect(store.get('wb-1').zoom).toBe(7.5);
  });
});

/**
 * Density follows the current zoom, not wherever the reader has been.
 *
 * The store accumulates and nothing removes from it, which is deliberate: the geometry has to
 * outlive the viewport that produced it or panning drops reaches mid-animation. But the whole
 * store was handed to deck.gl, so after zooming into half a vpu and back out, that half kept its
 * close-up density and the rest stayed coarse. One region, two resolutions, and it lasted the
 * whole session because the store is only cleared on a vpu change.
 *
 * The fix is not to prune. Each reach records two zooms: the finest it has been seen at, which
 * is where its geometry came from, and the coarsest, which is the lowest zoom the tileset serves
 * it at and therefore when it should be drawn.
 */
const at = (id) => feature(id, [[0, 0], [1, 1]]);

describe('the two zooms a reach remembers', () => {
  test('records the zoom it was first seen at as its coarsest', () => {
    const store = new Map();

    addPaths(store, [at('wb-1')], index, 6);

    expect(store.get('wb-1').minZoom).toBe(6);
    expect(store.get('wb-1').zoom).toBe(6);
  });

  test('takes finer geometry without forgetting how coarse it is served', () => {
    // The reach is a main stem: the tileset serves it at 6 and again, in more detail, at 11.
    const store = new Map();
    addPaths(store, [at('wb-1')], index, 6);

    addPaths(store, [at('wb-1')], index, 11);

    expect(store.get('wb-1').zoom).toBe(11);
    expect(store.get('wb-1').minZoom).toBe(6);
  });

  test('lowers the coarsest when a wider view turns out to serve it', () => {
    // The order the reader happens to travel in must not decide what they see. A reach first met
    // close up is still a main stem, and the wide view proves it by serving it.
    const store = new Map();
    addPaths(store, [at('wb-1')], index, 11);

    addPaths(store, [at('wb-1')], index, 6);

    expect(store.get('wb-1').minZoom).toBe(6);
    expect(store.get('wb-1').zoom).toBe(11);
  });

  test('leaves a headwater marked as fine detail', () => {
    // Only ever served close up, so it should not be drawn over the whole vpu.
    const store = new Map();
    addPaths(store, [at('wb-2')], index, 11);

    expect(store.get('wb-2').minZoom).toBe(11);
  });
});

describe('what is drawn at a given zoom', () => {
  const { pathsVisibleAt } = require('features/DataStream/lib/layers');

  const store = () => {
    const s = new Map();
    addPaths(s, [at('wb-1')], index, 6);   // main stem
    addPaths(s, [at('wb-2')], index, 11);  // headwater
    addPaths(s, [at('wb-3')], index, 9);   // tributary
    return [...s.values()];
  };

  test('over the whole vpu, only what the tileset serves there', () => {
    expect(pathsVisibleAt(store(), 6).map((p) => p.id)).toEqual(['wb-1']);
  });

  test('closer in, everything down to that zoom', () => {
    expect(pathsVisibleAt(store(), 9).map((p) => p.id).sort()).toEqual(['wb-1', 'wb-3']);
  });

  test('closest, all of it', () => {
    expect(pathsVisibleAt(store(), 11).map((p) => p.id).sort()).toEqual(['wb-1', 'wb-2', 'wb-3']);
  });

  test('the same everywhere at one zoom, wherever the reader has been', () => {
    // The defect: a half visited at 11 drew at 11 while the rest drew at 6.
    const visited = store();
    expect(pathsVisibleAt(visited, 6)).toHaveLength(1);
    expect(pathsVisibleAt(visited, 6)).toEqual(pathsVisibleAt(visited, 6));
  });

  test('draws a reach with no zoom recorded rather than hiding it', () => {
    // Anything predating the tag, or arriving from somewhere that does not set it, is geometry
    // the animation had before this change and should not lose to it.
    expect(pathsVisibleAt([{ id: 'x', path: [] }], 4)).toHaveLength(1);
  });

  test('answers an empty list for nothing', () => {
    expect(pathsVisibleAt([], 8)).toEqual([]);
    expect(pathsVisibleAt(undefined, 8)).toEqual([]);
  });
});

/**
 * The reported bug, end to end.
 *
 * Zoom into half a vpu, zoom back out, and that half kept its close-up density while the rest
 * stayed coarse: one region drawn at two resolutions, and it lasted the whole session because
 * the store is only cleared when the vpu changes.
 */
describe('a reader who zooms into one half and back out', () => {
  const { pathsVisibleAt } = require('features/DataStream/lib/layers');

  const WEST = ['wb-1'];
  const EAST = ['wb-2'];
  const EAST_DETAIL = ['wb-2', 'wb-3'];
  const idx = { 'wb-1': 0, 'wb-2': 1, 'wb-3': 2 };
  const feats = (ids) => ids.map((id) => feature(id, [[0, 0], [1, 1]]));

  const travel = () => {
    const store = new Map();
    // The whole vpu at a wide zoom: the tileset serves one main stem per half.
    addPaths(store, feats([...WEST, ...EAST]), idx, 6);
    // Close up on the east: it now also serves the tributary there.
    addPaths(store, feats(EAST_DETAIL), idx, 11);
    // And back out over the whole vpu.
    addPaths(store, feats([...WEST, ...EAST]), idx, 6);
    return [...store.values()];
  };

  test('keeps everything it collected', () => {
    // The point of accumulating: nothing is thrown away by moving.
    expect(travel()).toHaveLength(3);
  });

  test('draws both halves at the same density once back out', () => {
    const drawn = pathsVisibleAt(travel(), 6).map((p) => p.id).sort();

    // One reach per half, not two in the east and one in the west.
    expect(drawn).toEqual(['wb-1', 'wb-2']);
  });

  test('still has the eastern detail waiting when the reader returns', () => {
    const drawn = pathsVisibleAt(travel(), 11).map((p) => p.id).sort();

    expect(drawn).toEqual(['wb-1', 'wb-2', 'wb-3']);
  });

  test('and the main stems keep the geometry read closest', () => {
    // Density follows the zoom; detail does not regress with it.
    const east = travel().find((p) => p.id === 'wb-2');
    expect(east.zoom).toBe(11);
    expect(east.minZoom).toBe(6);
  });
});

/**
 * The tag and the filter must be in the same units.
 *
 * addPaths was given the map's raw zoom while the overlay filtered on the quantised one, so a
 * reach the tileset had just served at 7.124 was tagged 7.124, compared against 7.0, and hidden
 * until the reader zoomed another eighth of a level in. Both halves were individually correct
 * and the existing tests covered both; nothing compared them.
 *
 * addPaths quantises what it is handed rather than trusting the caller to, so a second call site
 * cannot reintroduce the mismatch.
 */
describe('zoom units', () => {
  const { pathsVisibleAt } = require('features/DataStream/lib/layers');
  const { quantiseZoom } = require('features/DataStream/lib/flowpaths');
  const one = (id) => [feature(id, [[0, 0], [1, 1]])];
  const idx = { 'wb-1': 0 };

  test('a reach is drawn at the zoom it was served at', () => {
    const store = new Map();
    const raw = 7.124;

    addPaths(store, one('wb-1'), idx, raw);

    expect(pathsVisibleAt([...store.values()], quantiseZoom(raw))).toHaveLength(1);
  });

  test.each([7.124, 7.13, 9.4, 4.99, 11.0])('holds at raw zoom %s', (raw) => {
    const store = new Map();
    addPaths(store, one('wb-1'), idx, raw);

    expect(pathsVisibleAt([...store.values()], quantiseZoom(raw))).toHaveLength(1);
  });

  test('records the tag already quantised, so the caller cannot get the units wrong', () => {
    const store = new Map();
    addPaths(store, one('wb-1'), idx, 7.124);

    expect(store.get('wb-1').minZoom).toBe(quantiseZoom(7.124));
  });
});

/**
 * The drawable set is stable across animation frames.
 *
 * pathsVisibleAt allocates and filters a store that can hold tens of thousands of reaches. Called
 * inline in the layer memo it ran on every tick, because that memo also depends on the frame
 * index -- so deck.gl got a brand-new `data` array every frame and treated the dataset as
 * changed, defeating the updateTriggers-scoped partial update the layer is built around.
 */
describe('useVisiblePaths', () => {
  const { renderHook } = require('@testing-library/react');
  const { useVisiblePaths } = require('features/DataStream/lib/flowpaths');

  const store = () => {
    const s = new Map();
    addPaths(s, [feature('wb-1', [[0, 0], [1, 1]])], { 'wb-1': 0 }, 6);
    addPaths(s, [feature('wb-2', [[0, 0], [1, 1]])], { 'wb-2': 1 }, 11);
    return { current: [...s.values()] };
  };

  test('returns the same array when nothing that matters changed', () => {
    // The regression: a re-render caused by the frame index must not rebuild this.
    const ref = store();
    const { result, rerender } = renderHook(({ z, t }) => useVisiblePaths(ref, z, t), {
      initialProps: { z: 6, t: 0 },
    });
    const first = result.current;

    rerender({ z: 6, t: 0 });
    rerender({ z: 6, t: 0 });

    expect(result.current).toBe(first);
  });

  test('rebuilds when the zoom crosses a step', () => {
    const ref = store();
    const { result, rerender } = renderHook(({ z, t }) => useVisiblePaths(ref, z, t), {
      initialProps: { z: 6, t: 0 },
    });
    expect(result.current.map((p) => p.id)).toEqual(['wb-1']);

    rerender({ z: 11, t: 0 });

    expect(result.current.map((p) => p.id).sort()).toEqual(['wb-1', 'wb-2']);
  });

  test('rebuilds when new geometry arrives', () => {
    const ref = store();
    const { result, rerender } = renderHook(({ z, t }) => useVisiblePaths(ref, z, t), {
      initialProps: { z: 6, t: 0 },
    });
    const first = result.current;

    ref.current = [...ref.current];
    rerender({ z: 6, t: 1 });

    expect(result.current).not.toBe(first);
  });
});

/**
 * Nothing outlives the subscription that registered it.
 *
 * The map component registered 'idle' with once() and removed only moveend and zoomend. once()
 * does not remove itself until it fires, so an effect that re-ran before the map had settled
 * left the previous run's callback listening -- and that callback closes over the vpu's feature
 * index, while the effect re-runs precisely when the vpu changes. The stale listener collected
 * the new vpu's geometry under the old vpu's indices.
 */
describe('onMapSettled', () => {
  const { onMapSettled } = require('features/DataStream/lib/flowpaths');

  const fakeMap = () => {
    const on = jest.fn();
    const once = jest.fn();
    const off = jest.fn();
    return { on, once, off, listening: () => {
      const added = [...on.mock.calls, ...once.mock.calls].map(([e]) => e).sort();
      const removed = off.mock.calls.map(([e]) => e).sort();
      return added.filter((e) => {
        const at = removed.indexOf(e);
        if (at === -1) return true;
        removed.splice(at, 1);
        return false;
      });
    } };
  };

  it('settles on the first idle as well as on every later move', () => {
    const map = fakeMap();
    const run = jest.fn();

    onMapSettled(map, run);

    expect(map.once).toHaveBeenCalledWith('idle', run);
    expect(map.on).toHaveBeenCalledWith('moveend', run);
    expect(map.on).toHaveBeenCalledWith('zoomend', run);
  });

  it('leaves nothing listening after the unsubscribe', () => {
    const map = fakeMap();
    const run = jest.fn();

    onMapSettled(map, run)();

    expect(map.listening()).toEqual([]);
  });

  it('removes the same callback it registered', () => {
    // off(event) with a different function removes nothing, which is how this looked correct.
    const map = fakeMap();
    const run = jest.fn();

    onMapSettled(map, run)();

    map.off.mock.calls.forEach(([, fn]) => expect(fn).toBe(run));
  });
});
