import { getFeatureProperties } from 'features/DataStream/lib/queryData';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { chartSelection } from 'features/DataStream/actions/chartSelection';
import { showSelection } from 'features/DataStream/actions/showSelection';

/** Select the feature an id names, using the hydrofabric index to fill in what the caller cannot know. */
export async function selectIndexedFeature(candidates) {
  const ids = (Array.isArray(candidates) ? candidates : [candidates]).filter(Boolean);
  if (!ids.length) return null;

  const features = await getFeatureProperties({
    cacheKey: 'index_data_table',
    feature_id: ids,
  });
  if (!features.length) return null;

  const feature = features[0];
  const matchedId = feature.id ?? ids[0];
  const vpuName = `VPU_${feature.vpuid}`;
  const { vpu, set_vpu } = useDataStreamStore.getState();

  const before = useFeatureStore.getState().selected_feature;
  useFeatureStore.getState().set_selected_feature({ _id: matchedId, ...feature });
  if (useFeatureStore.getState().selected_feature === before) showSelection();

  useTimeSeriesStore.setState({
    loadingText: vpuName === vpu ? `Loading ${matchedId}` : `Loading ${vpuName}`,
    last_error: null,
    pending: true,
  });

  if (vpuName === vpu) {
    chartSelection({ featureId: matchedId, vpuName });
  }
  set_vpu(vpuName);

  return matchedId;
}
