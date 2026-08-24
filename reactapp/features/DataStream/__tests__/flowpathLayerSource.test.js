import { FLOWPATHS_LAYER_ID, hideStyleFlowpaths, reorderLayers } from 'features/DataStream/lib/layers';

/**
 * The basemap style at map/styles/*-style.json already defines a layer called `flowpaths` on
 * its own `hydrofabric` source, which is merged.pmtiles. react-map-gl updates an existing layer
 * instead of replacing it, and its updateLayer touches only layout, paint, filter and zoom
 * range: never the source. So a layer of ours reusing that id keeps reading merged.pmtiles
 * whatever source it declares, and merged carries no flowpaths below zoom 7.
 *
 * These are the two things that make the switch to upstream_index/flowpaths.pmtiles real
 * rather than a no-op.
 */
describe('the flowpaths layer id', () => {
  test('is not the id the basemap style already uses', () => {
    expect(FLOWPATHS_LAYER_ID).not.toBe('flowpaths');
  });

  test('is what the draw order refers to, so ours is the layer being moved', () => {
    const moved = [];
    const map = {
      getLayer: (id) => (id === FLOWPATHS_LAYER_ID ? {} : null),
      moveLayer: (id) => moved.push(id),
    };

    reorderLayers(map);

    expect(moved).toEqual([FLOWPATHS_LAYER_ID]);
  });
});

describe('hiding the basemap style flowpaths', () => {
  test('hides it, so it neither double-draws nor answers queries', () => {
    const calls = [];
    const map = {
      getLayer: (id) => (id === 'flowpaths' ? {} : null),
      setLayoutProperty: (...args) => calls.push(args),
    };

    hideStyleFlowpaths(map);

    // queryRenderedFeatures skips layers hidden this way, so the animation reads only ours.
    expect(calls).toEqual([['flowpaths', 'visibility', 'none']]);
  });

  test('does nothing when the style has no such layer', () => {
    const calls = [];
    const map = { getLayer: () => null, setLayoutProperty: (...a) => calls.push(a) };

    hideStyleFlowpaths(map);

    expect(calls).toEqual([]);
  });

  test('survives being handed no map at all', () => {
    expect(() => hideStyleFlowpaths(null)).not.toThrow();
    expect(() => hideStyleFlowpaths({})).not.toThrow();
  });
});
