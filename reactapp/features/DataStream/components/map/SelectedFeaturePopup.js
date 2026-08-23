import React, { useMemo, useState } from 'react';
import { Popup } from 'react-map-gl/maplibre';

import { useFeatureStore } from 'features/DataStream/store/Layers';
import { featureFields } from 'features/DataStream/lib/featureFields';
import { selectionLngLat } from 'features/DataStream/lib/layers';
import { PopupContent } from '../styles/Styles';

/**
 * What the selected feature is, shown where the feature is.
 *
 * This was a Feature Information block at the bottom of the side panel, under the chart, the
 * data menu and the variables menu -- far enough down that it needed scrolling to reach, so in
 * practice nobody did. It also repeated what the hover popup already said, and hovering is a
 * toggle that starts off, so the information had two homes and no reliable one.
 *
 * On the map it is anchored to the thing it describes, which is the whole point of it, and it
 * arrives with the selection rather than waiting to be found.
 *
 * Dismissal is remembered per feature, not globally: closing it should close this one, and
 * selecting something else is a new question that deserves an answer.
 */
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
