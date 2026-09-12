import React, { useMemo, useState } from 'react';
import { Popup } from 'react-map-gl/maplibre';

import { useFeatureStore } from 'features/DataStream/store/Layers';
import { useIsSheetLayout } from 'features/DataStream/lib/breakpoints';
import { curatedFeatureFields } from 'features/DataStream/lib/featureFields';
import { selectionLngLat } from 'features/DataStream/lib/layers';
import TimeSeriesCard from 'features/DataStream/components/forecast/TimeseriesCard';
import { PopupContent } from '../styles/Styles';

// Fixed because the popup sizes itself to its content: @visx ParentSize would measure it as it
// grows and the two would wait on each other, so the chart is told its box. (KTD6)
const CHART_WIDTH = 340;
const CHART_HEIGHT = 220;

/** The selected feature, charted where the feature is. Desktop only; the sheet hosts the chart on mobile. */
export const SelectedFeaturePopup = React.memo(() => {
  const selectedFeature = useFeatureStore((s) => s.selected_feature);
  const [dismissedId, setDismissedId] = useState(null);
  const isSheet = useIsSheetLayout();

  const at = useMemo(() => selectionLngLat(selectedFeature), [selectedFeature]);
  const header = useMemo(() => curatedFeatureFields(selectedFeature), [selectedFeature]);

  const id = selectedFeature?._id ?? null;

  // Suppressed on the sheet layout: there the bottom sheet is the chart host, and a popup on the
  // strip of map it leaves visible would be a second copy of the same feature. Opened on
  // selected_feature (written synchronously on click), not on the timeseries feature_id (written
  // only once loadTimeseries runs), so a cross-vpu selection shows its header and a loading chart
  // at once rather than waiting for Update.
  if (isSheet || !at || !id || dismissedId === id) return null;

  return (
    <Popup
      longitude={at[0]}
      latitude={at[1]}
      offset={[0, -12]}
      closeButton
      closeOnClick={false}
      onClose={() => setDismissedId(id)}
      maxWidth="380px"
    >
      <PopupContent $chart>
        {header.map(({ label, value }) => (
          <div className="popup-row" key={label}>
            <span className="popup-label">{label}</span>
            <span className="popup-value">{value}</span>
          </div>
        ))}
        <TimeSeriesCard width={CHART_WIDTH} height={CHART_HEIGHT} />
      </PopupContent>
    </Popup>
  );
});

SelectedFeaturePopup.displayName = 'SelectedFeaturePopup';

export default SelectedFeaturePopup;
