import React, { useMemo } from 'react';
import { Popup } from 'react-map-gl/maplibre';

import { useFeatureStore } from 'features/DataStream/store/Layers';
import { useIsSheetLayout } from 'features/DataStream/lib/breakpoints';
import { curatedFeatureFields } from 'features/DataStream/lib/featureFields';
import { selectionLngLat } from 'features/DataStream/lib/layers';
import TimeSeriesCard from 'features/DataStream/components/forecast/TimeseriesCard';
import VariablesMenu from 'features/DataStream/components/forecast/variablesMenu';
import { PopupContent } from '../styles/Styles';

const CHART_WIDTH = 340;
const CHART_HEIGHT = 220;

/**
 * The selected feature, charted where the feature is. Desktop only; the sheet hosts the chart on
 * mobile. Closing clears the selection, so re-clicking the same catchment reopens it.
 */
export const SelectedFeaturePopup = React.memo(() => {
  const selectedFeature = useFeatureStore((s) => s.selected_feature);
  const setSelectedFeature = useFeatureStore((s) => s.set_selected_feature);
  const isSheet = useIsSheetLayout();

  const at = useMemo(() => selectionLngLat(selectedFeature), [selectedFeature]);
  const header = useMemo(() => curatedFeatureFields(selectedFeature), [selectedFeature]);

  const id = selectedFeature?._id ?? null;

  if (isSheet || !at || !id) return null;

  return (
    <Popup
      longitude={at[0]}
      latitude={at[1]}
      offset={[0, -12]}
      closeButton
      closeOnClick={false}
      onClose={() => setSelectedFeature(null)}
      className="feature-chart-popup"
      maxWidth="360px"
    >
      <PopupContent $chart>
        <div className="popup-header">
          {header.map(({ label, value }) => (
            <div className="popup-row" key={label}>
              <span className="popup-label">{label}</span>
              <span className="popup-value">{value}</span>
            </div>
          ))}
        </div>
        <VariablesMenu compact />
        <TimeSeriesCard width={CHART_WIDTH} height={CHART_HEIGHT} />
      </PopupContent>
    </Popup>
  );
});

SelectedFeaturePopup.displayName = 'SelectedFeaturePopup';

export default SelectedFeaturePopup;
