import useDataStreamStore from 'features/DataStream/store/Datastream';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { makeFeatureTitle } from 'features/DataStream/lib/utils';
import { cancelVpuLoads } from 'features/DataStream/actions/loadState';

/**
 * Give up on a selection whose output-file listing is empty.
 *
 * Two places reach this state: changing a control, and the first load of a vpu. Each used to
 * hand-roll the sequence, and the two drifted twice. First the cache key: cleared where a
 * control changed it, left set on the first load, so a click charted the previous output file
 * under this selection's name. Then the title: fixed in one copy, missed in the other, so the
 * header went on naming a forecast this selection has no data for. Both bugs were the same bug,
 * found twice, because the knowledge of what "nothing to read" means lived in two places.
 *
 * What it means: no key, because a key names a table nothing could have created. No animation
 * and no series, because they came from a file this selection does not have. A title naming the
 * catchment but not a forecast, since the catchment is still selected and the forecast is what
 * has nothing behind it. And the reason on screen, as a failure rather than as progress.
 *
 * The selection itself survives: the panel is open because a feature is selected, and closing it
 * mid-interaction would take the reader somewhere they did not ask to go.
 */
export function abandonSelectionWithNoOutput() {
  // First, for the reason leaving a vpu does it: a load already running is not stopped by the
  // selection changing under it, so it reaches its next checkpoint, finds the generation
  // unchanged, and writes its arrays in behind this refusal.
  cancelVpuLoads();
  const { set_cache_key, set_outputFile } = useDataStreamStore.getState();
  const timeseries = useTimeSeriesStore.getState();

  set_cache_key(null);
  set_outputFile('');
  // The prefix lives with the bucket listing rather than the selection.
  useS3DataStreamBucketStore.getState().set_prefix('');
  useVPUStore.getState().resetVPU();
  timeseries.reset_series();

  const featureId = useFeatureStore.getState().selected_feature?._id;
  if (featureId) {
    timeseries.set_layout({ ...timeseries.layout, title: makeFeatureTitle(featureId) });
  }

  useTimeSeriesStore.setState({
    loadingText: 'No output file for this selection',
    last_error: { kind: 'no-output-file' },
  });
}
