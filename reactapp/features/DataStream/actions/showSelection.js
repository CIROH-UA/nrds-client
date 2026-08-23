import { useEffect } from 'react';

import { getMapHandle } from 'features/DataStream/lib/mapHandle';
import { selectionLngLat } from 'features/DataStream/lib/layers';
import { useFeatureStore } from 'features/DataStream/store/Layers';

/**
 * Where a selection is shown from.
 *
 * The catchment fill only reaches full opacity at zoom 11, so returning at whatever zoom the
 * reader had drifted to could centre them on a highlight they still cannot see.
 */
export const SELECTION_ZOOM = 11;

/**
 * Put the selected catchment back on screen.
 *
 * Selecting one already flies the map to it. This is the same move on demand, for after the
 * reader has zoomed out to look at the wider network and lost the few pixels they were reading
 * a chart about.
 *
 * essential: true so the move still happens for a reader with prefers-reduced-motion set, who
 * would otherwise be left where they were with no feedback at all.
 *
 * Returns whether it went anywhere, which is what lets the button test itself.
 */
export const showSelection = () => {
  const map = getMapHandle();
  const at = selectionLngLat(useFeatureStore.getState().selected_feature);
  if (!map || !at) return false;

  map.flyTo({ center: at, zoom: SELECTION_ZOOM, essential: true });
  return true;
};

/**
 * Move the map whenever the selection changes.
 *
 * A hook rather than an effect in the map component, because the effect there was keyed on a
 * useCallback with an empty dependency array. That made the callback referentially stable for
 * the life of the component, so the effect ran once on mount and never again: selecting a
 * feature stopped moving the map at all.
 *
 * It survived review because a click already leaves the map where the feature is -- that is
 * where the reader clicked -- so nothing appeared wrong. Only the search box, which selects
 * something that may be a state away, showed it.
 *
 * Subscribing here means there is no dependency array to get wrong, and the whole behaviour can
 * be rendered and tested without a canvas, which the effect could not.
 */
export const useShowSelectionOnChange = () => {
  const selected = useFeatureStore((s) => s.selected_feature);

  useEffect(() => {
    if (!selected) return;
    showSelection();
  }, [selected]);
};
