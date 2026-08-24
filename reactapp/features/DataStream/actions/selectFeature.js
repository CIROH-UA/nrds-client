import { getCentroid } from 'features/DataStream/lib/layers';
import { layerIdToFeatureType } from 'features/DataStream/lib/utils';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { chartSelection } from 'features/DataStream/actions/chartSelection';

/** Record a map feature as the selection, and chart it when it belongs to the loaded vpu. */
export function selectMapFeature(feature, layerId) {
  const featureIdProperty = layerIdToFeatureType(layerId);
  const featureId = feature.properties?.[featureIdProperty];
  const { lon, lat } = getCentroid(feature);

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

  if (featureId != null) {
    useTimeSeriesStore.setState({
      loadingText: vpuName === vpu ? `Loading ${featureId}` : `Loading ${vpuName}`,
      last_error: null,
      pending: true,
    });
  }
  if (featureId != null && vpuName === vpu) {
    chartSelection({ featureId, vpuName });
  }
  set_vpu(vpuName);

  return featureId;
}
