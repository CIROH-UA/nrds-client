import useDataStreamStore from 'features/DataStream/store/Datastream';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { makeFeatureTitle } from 'features/DataStream/lib/utils';
import { cancelVpuLoads } from 'features/DataStream/actions/loadState';

/** Give up on a selection whose output-file listing is empty. */
export function abandonSelectionWithNoOutput() {
  cancelVpuLoads();
  const { set_cache_key, set_outputFile } = useDataStreamStore.getState();
  const timeseries = useTimeSeriesStore.getState();

  set_cache_key(null);
  set_outputFile('');
  useS3DataStreamBucketStore.getState().set_prefix('');
  useVPUStore.getState().resetVPU();
  timeseries.reset_series();

  const featureId = useFeatureStore.getState().selected_feature?._id;
  if (featureId) {
    timeseries.set_layout({ ...timeseries.layout, title: makeFeatureTitle(featureId), subtitle: '' });
  }

  useTimeSeriesStore.setState({
    loadingText: 'No output file for this selection',
    last_error: { kind: 'no-output-file' },
    pending: false,
  });
}
