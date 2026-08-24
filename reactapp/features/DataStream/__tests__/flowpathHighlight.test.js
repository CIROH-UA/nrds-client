/**
 * Selecting a catchment highlights the reach that runs through it.
 *
 * This is how a reach is reached: flowpaths are not click targets, because their archive drops
 * vpuid and the tile cannot say where to load the data from. Clicking the catchment names both,
 * and the highlight draws the reach so the reader can see which one they picked.
 *
 * The two tilesets disagree about the id, which is the whole reason this filter is not a plain
 * equality: merged.pmtiles calls the catchment "cat-2884494", while
 * upstream_index/flowpaths.pmtiles carries divide_id as the bare number 2884494.
 */
import { renderHook } from '@testing-library/react';

import { useFlowPathsHighlightLayer } from 'features/DataStream/components/map/MapLayers';

const filterFor = (props) =>
  renderHook(() => useFlowPathsHighlightLayer(props)).result.current?.props?.filter;

describe('the flowpath highlight', () => {
  it('matches the reach by the numeric part of the selected catchment', () => {
    expect(filterFor({ isFlowPathsVisible: true, selectedFeatureId: 'cat-2884494', color: '#f0f' }))
      .toEqual(['==', ['get', 'divide_id'], 2884494]);
  });

  it('matches the same reach when the selection came from the flowpath side', () => {
    // A wb- id names the same reach as its cat- catchment; both reduce to the same number.
    expect(filterFor({ isFlowPathsVisible: true, selectedFeatureId: 'wb-2884494', color: '#f0f' }))
      .toEqual(['==', ['get', 'divide_id'], 2884494]);
  });

  it('highlights nothing when nothing is selected', () => {
    // An id that cannot match, rather than no filter at all: without one, every reach on screen
    // would be drawn in the highlight colour.
    expect(filterFor({ isFlowPathsVisible: true, selectedFeatureId: null, color: '#f0f' }))
      .toEqual(['==', ['get', 'divide_id'], -1]);
  });

  it('draws nothing when the flowpaths layer is hidden', () => {
    // The highlight belongs to that layer's source; with the layer off there is nothing to sit on.
    expect(renderHook(() => useFlowPathsHighlightLayer({
      isFlowPathsVisible: false, selectedFeatureId: 'cat-2884494', color: '#f0f',
    })).result.current).toBeNull();
  });
});
