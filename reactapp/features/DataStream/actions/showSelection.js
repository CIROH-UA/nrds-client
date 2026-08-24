import { useEffect } from 'react';

import { getMapHandle } from 'features/DataStream/lib/mapHandle';
import { selectionLngLat } from 'features/DataStream/lib/layers';
import { sheetCoverPx } from 'features/DataStream/lib/breakpoints';
import { useFeatureStore } from 'features/DataStream/store/Layers';

/** Where a selection is shown from. */
export const SELECTION_ZOOM = 11;

/** Put the selected catchment back on screen. */
export const showSelection = ({ assumeOpen = false } = {}) => {
  const map = getMapHandle();
  const at = selectionLngLat(useFeatureStore.getState().selected_feature);
  if (!map || !at) return false;

  const covered = sheetCoverPx({ assumeOpen });
  map.flyTo({
    center: at,
    zoom: SELECTION_ZOOM,
    offset: [0, covered > 0 ? -covered / 2 : 0],
    essential: true,
  });
  return true;
};

/** Move the map whenever the selection changes. */
export const useShowSelectionOnChange = () => {
  const selected = useFeatureStore((s) => s.selected_feature);

  useEffect(() => {
    if (!selected) return;
    showSelection({ assumeOpen: true });
  }, [selected]);
};
