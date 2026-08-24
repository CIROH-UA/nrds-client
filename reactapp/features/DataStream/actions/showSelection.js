import { useEffect } from 'react';

import { getMapHandle } from 'features/DataStream/lib/mapHandle';
import { selectionLngLat } from 'features/DataStream/lib/layers';
import { useFeatureStore } from 'features/DataStream/store/Layers';

/** Where a selection is shown from. */
export const SELECTION_ZOOM = 11;

/** Put the selected catchment back on screen. */
export const showSelection = () => {
  const map = getMapHandle();
  const at = selectionLngLat(useFeatureStore.getState().selected_feature);
  if (!map || !at) return false;

  map.flyTo({ center: at, zoom: SELECTION_ZOOM, essential: true });
  return true;
};

/** Move the map whenever the selection changes. */
export const useShowSelectionOnChange = () => {
  const selected = useFeatureStore((s) => s.selected_feature);

  useEffect(() => {
    if (!selected) return;
    showSelection();
  }, [selected]);
};
