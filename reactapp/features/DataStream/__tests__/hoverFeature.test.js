import { hoveredFeatureOf, hoverRows } from 'features/DataStream/actions/hoverFeature';
import { mapFeatureId } from 'features/DataStream/lib/layers';

/**
 * Hovering a flowpath stopped working when the flowpath source changed archives.
 *
 * The handler read feature.properties.id for every layer except divides. merged.pmtiles put the
 * flowpath id there as "wb-2862525"; upstream_index/flowpaths.pmtiles puts the bare number on
 * the feature itself and carries no properties.id at all, so the id resolved to undefined and
 * the hover was discarded before it could become a popup. Second time the same assumption
 * broke something, which is why there is one resolver now.
 */
const flowpathNew = {
  // Verified against a live upstream_index tile.
  id: 2863415,
  layer: { id: 'flowpaths-line' },
  properties: { toid: 2863416, order: 1, divide_id: 2863415, upstream_id: 688106 },
};
const flowpathOld = {
  layer: { id: 'flowpaths-line' },
  properties: { id: 'wb-2862525', vpuid: '16', lengthkm: 5.66 },
};
const divide = {
  layer: { id: 'divides' },
  properties: { divide_id: 'cat-2862525', vpuid: '16' },
};
const lngLat = { lng: -111.9, lat: 40.6 };

describe('resolving a feature id', () => {
  test('reads it off the feature when properties has none', () => {
    expect(mapFeatureId(flowpathNew)).toBe(2863415);
  });

  test('still reads the properties form', () => {
    expect(mapFeatureId(flowpathOld)).toBe('wb-2862525');
  });

  test('falls back to divide_id', () => {
    expect(mapFeatureId({ properties: { divide_id: 'cat-1' } })).toBe('cat-1');
  });

  test('gives null rather than undefined when there is nothing', () => {
    expect(mapFeatureId({ properties: {} })).toBeNull();
    expect(mapFeatureId(undefined)).toBeNull();
  });
});

describe('hovering', () => {
  test('a flowpath from the current archive resolves', () => {
    const hovered = hoveredFeatureOf(flowpathNew, lngLat);
    expect(hovered).not.toBeNull();
    expect(hovered.hoverId).toBe(2863415);
  });

  test('a flowpath from the previous archive still resolves', () => {
    expect(hoveredFeatureOf(flowpathOld, lngLat).hoverId).toBe('wb-2862525');
  });

  test('a divide is identified by its catchment, not by the polygon', () => {
    // divide_id is the catchment the reader means.
    expect(hoveredFeatureOf(divide, lngLat).hoverId).toBe('cat-2862525');
  });

  test('carries the pointer position, so the popup can place itself', () => {
    const hovered = hoveredFeatureOf(flowpathNew, lngLat);
    expect(hovered.longitude).toBe(-111.9);
    expect(hovered.latitude).toBe(40.6);
  });

  test('keeps the feature properties for the popup to list', () => {
    expect(hoveredFeatureOf(flowpathNew, lngLat)).toMatchObject({ order: 1, toid: 2863416 });
  });

  test('is nothing when the feature carries no id at all', () => {
    expect(hoveredFeatureOf({ layer: { id: 'x' }, properties: {} }, lngLat)).toBeNull();
    expect(hoveredFeatureOf(null, lngLat)).toBeNull();
  });
});

describe('what the popup lists', () => {
  test('leaves out the fields we added ourselves', () => {
    const rows = hoverRows(hoveredFeatureOf(flowpathNew, lngLat));
    const keys = rows.map(([k]) => k);

    // These are ours, added so the popup can position and dedupe, and they were being shown
    // back to the reader as though they were properties of the feature.
    expect(keys).not.toContain('hoverId');
    expect(keys).not.toContain('longitude');
    expect(keys).not.toContain('latitude');
    expect(keys).toContain('order');
  });

  test('drops empty values rather than printing blanks', () => {
    const rows = hoverRows({ a: 1, b: null, c: '', d: undefined, e: 0 });
    expect(rows.map(([k]) => k)).toEqual(['a', 'e']);
  });

  test('is empty for nothing hovered', () => {
    expect(hoverRows(null)).toEqual([]);
  });
});

describe('choosing what is under the pointer', () => {
  const { pickHoverFeature } = require('features/DataStream/actions/hoverFeature');

  const at = (layerId, props = {}) => ({ layer: { id: layerId }, properties: props, id: 1 });

  test('a flowpath beats the catchment it runs through', () => {
    // queryRenderedFeatures returns topmost first, and divides are drawn above flowpaths, so
    // taking features[0] meant a flowpath could never be hovered while catchments were on.
    const picked = pickHoverFeature([at('divides', { divide_id: 'cat-1' }), at('flowpaths-line')]);
    expect(picked.layer.id).toBe('flowpaths-line');
  });

  test('a nexus point beats both, being the smallest target', () => {
    const picked = pickHoverFeature([
      at('divides', { divide_id: 'cat-1' }),
      at('flowpaths-line'),
      at('nexus-points', { id: 'nex-1' }),
    ]);
    expect(picked.layer.id).toBe('nexus-points');
  });

  test('a catchment on its own is still hovered', () => {
    expect(pickHoverFeature([at('divides', { divide_id: 'cat-1' })]).layer.id).toBe('divides');
  });

  test('an unranked layer is used rather than nothing, but never over a ranked one', () => {
    expect(pickHoverFeature([at('something-else')]).layer.id).toBe('something-else');
    expect(pickHoverFeature([at('something-else'), at('divides')]).layer.id).toBe('divides');
  });

  test('nothing under the pointer is nothing', () => {
    expect(pickHoverFeature([])).toBeNull();
    expect(pickHoverFeature(undefined)).toBeNull();
  });
});

describe('the hovered feature carries an identity', () => {
  /**
   * The feature store skips an update when its key matches the one it holds, and that key came
   * from _id, then id, then properties.id. A flowpath from upstream_index has none of those in
   * its properties, so the key was null, the held key was also null, and every hover update was
   * dropped: hovering a flowpath never produced a popup while hovering a catchment always did.
   */
  const { useFeatureStore } = require('features/DataStream/store/Layers');
  const initial = useFeatureStore.getState();
  beforeEach(() => { useFeatureStore.setState(initial, true); });

  test('reaches the store for a feature with no id in its properties', () => {
    const hovered = hoveredFeatureOf(flowpathNew, lngLat);
    useFeatureStore.getState().set_hovered_feature(hovered);

    expect(useFeatureStore.getState().hovered_feature).not.toBeNull();
    expect(useFeatureStore.getState().hovered_feature.hoverId).toBe(2863415);
  });

  test('a different reach replaces it', () => {
    const store = useFeatureStore.getState();
    store.set_hovered_feature(hoveredFeatureOf(flowpathNew, lngLat));
    store.set_hovered_feature(hoveredFeatureOf({ ...flowpathNew, id: 999 }, lngLat));

    expect(useFeatureStore.getState().hovered_feature.hoverId).toBe(999);
  });

  test('the same reach twice does not churn the store', () => {
    const store = useFeatureStore.getState();
    store.set_hovered_feature(hoveredFeatureOf(flowpathNew, lngLat));
    const held = useFeatureStore.getState().hovered_feature;
    store.set_hovered_feature(hoveredFeatureOf(flowpathNew, lngLat));

    expect(useFeatureStore.getState().hovered_feature).toBe(held);
  });

  test('clearing works, so a hidden layer cannot leave its popup behind', () => {
    const store = useFeatureStore.getState();
    store.set_hovered_feature(hoveredFeatureOf(flowpathNew, lngLat));
    store.set_hovered_feature(null);

    expect(useFeatureStore.getState().hovered_feature).toBeNull();
  });

  test('the identity is not shown back to the reader as a property', () => {
    const keys = hoverRows(hoveredFeatureOf(flowpathNew, lngLat)).map(([k]) => k);
    expect(keys).not.toContain('_id');
    expect(keys).not.toContain('layerId');
  });
});
