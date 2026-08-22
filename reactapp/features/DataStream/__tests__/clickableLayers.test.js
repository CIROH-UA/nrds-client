/**
 * Which layers a click acts on, and therefore which ones get the pointer cursor.
 *
 * There were three lists. `hoverLayers` set the cursor and was frozen at construction, so it
 * neither followed a visibility toggle nor knew about a layer added later. `layersToQuery`
 * described the same set correctly. `hoverableLayerIds` is a different question entirely — what
 * produces a hover popup — and is deliberately wider, because a gauge can be hovered and cannot
 * be clicked. Collapsing the cursor onto that wider list would put a pointer on a gauge.
 */
import { clickableLayerIds } from 'features/DataStream/lib/layers';

describe('clickableLayerIds', () => {
  it('offers the catchments when they are shown', () => {
    expect(clickableLayerIds({ isCatchmentsVisible: true })).toEqual(['divides']);
  });

  it('answers nothing when no clickable layer is shown', () => {
    // Not a default: an empty `layers` array makes maplibre query the whole style, so the caller
    // has to be able to tell "nothing to query" from "query everything".
    expect(clickableLayerIds({})).toEqual([]);
  });

  it('leaves gauges out even when they are shown', () => {
    // The case that stops a later tidy-up merging this with the hoverable list. A gauge has no
    // timeseries here, so a pointer over one would promise something the click cannot deliver.
    expect(clickableLayerIds({ isConusGaugesVisible: true })).toEqual([]);
    expect(clickableLayerIds({ isCatchmentsVisible: true, isConusGaugesVisible: true }))
      .toEqual(['divides']);
  });

  it('keeps a stable order regardless of which flags arrive', () => {
    // The list is compared by identity in a dependency array; a wobbling order would re-register
    // every map listener for no reason.
    expect(clickableLayerIds({ isCatchmentsVisible: true, isFlowPathsVisible: true }))
      .toEqual(clickableLayerIds({ isFlowPathsVisible: true, isCatchmentsVisible: true }));
  });
});
