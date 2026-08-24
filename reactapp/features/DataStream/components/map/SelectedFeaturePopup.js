import React, { useMemo, useState } from 'react';
import { Popup } from 'react-map-gl/maplibre';

import { useFeatureStore } from 'features/DataStream/store/Layers';
import { featureFields } from 'features/DataStream/lib/featureFields';
import { selectionLngLat } from 'features/DataStream/lib/layers';
import { PopupContent } from '../styles/Styles';

/** What the selected feature is, shown where the feature is. */
export const SelectedFeaturePopup = React.memo(() => {
  const selectedFeature = useFeatureStore((s) => s.selected_feature);
  const [dismissedId, setDismissedId] = useState(null);

  const at = useMemo(() => selectionLngLat(selectedFeature), [selectedFeature]);
  const fields = useMemo(() => featureFields(selectedFeature), [selectedFeature]);

  const id = selectedFeature?._id ?? null;
  if (!at || !id || dismissedId === id || !fields.length) return null;

  return (
    <Popup
      longitude={at[0]}
      latitude={at[1]}
      offset={[0, -12]}
      closeButton
      closeOnClick={false}
      onClose={() => setDismissedId(id)}
      maxWidth="300px"
    >
      <PopupContent>
        <div className="popup-title">Feature information</div>
        {fields.map(({ label, value }) => (
          <div className="popup-row" key={label}>
            <span className="popup-label">{label}</span>
            <span className="popup-value">{value}</span>
          </div>
        ))}
      </PopupContent>
    </Popup>
  );
});

SelectedFeaturePopup.displayName = 'SelectedFeaturePopup';

export default SelectedFeaturePopup;
