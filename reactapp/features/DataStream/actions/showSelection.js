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
