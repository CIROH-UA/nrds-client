import { getCentroid } from 'features/DataStream/lib/layers';
import { layerIdToFeatureType } from 'features/DataStream/lib/utils';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { chartSelection } from 'features/DataStream/actions/chartSelection';

/**
 * Record a map feature as the selection, and chart it when it belongs to the loaded vpu.
 *
 * Lifted out of the map's click handler so that selecting a catchment is a function call
 * rather than something only a real canvas click can do. The handler keeps the part that is
 * genuinely maplibre's -- turning a click point into rendered features -- and this takes the
 * decision from there, which is also the part worth testing.
 *
 * When the feature belongs to another vpu, only the vpu changes here; loading it brings the
 * new dataset in and its closing call charts whatever is selected by then.
 */
export function selectMapFeature(feature, layerId) {
  const featureIdProperty = layerIdToFeatureType(layerId);
  const featureId = feature.properties?.[featureIdProperty];
  const { lon, lat } = getCentroid(feature);

  // A feature we cannot name is not a selection, said here rather than left to a dedupe guard.
  if (featureId != null) {
    useFeatureStore.getState().set_selected_feature({
      latitude: lat,
      longitude: lon,
      layerId,
      _id: featureId,
      ...feature.properties,
    });
  }

  const vpuName = `VPU_${feature.properties?.vpuid}`;
  const { vpu, set_vpu } = useDataStreamStore.getState();

  // Said now: both paths below take most of a second to report anything of their own.
  if (featureId != null) {
    useTimeSeriesStore.setState({
      loadingText: vpuName === vpu ? `Loading ${featureId}` : `Loading ${vpuName}`,
      last_error: null,
    });
  }
  // Only for a feature we could name: charting falls back to the previous selection otherwise.
  if (featureId != null && vpuName === vpu) {
    chartSelection({ featureId, vpuName });
  }
  set_vpu(vpuName);

  return featureId;
}
