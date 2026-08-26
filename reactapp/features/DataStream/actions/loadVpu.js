import {
  checkForTable,
  loadVpuData as fetchVpuTable,
  getFeatureIDs,
  getVariables,
  getDistinctFeatureIds,
  getDistinctTimes,
  getVpuVariableFlat,
} from 'features/DataStream/lib/queryData';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { cacheFailureReason } from 'features/DataStream/lib/utils';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { loadTimeseries } from 'features/DataStream/actions/loadTimeseries';
import {
  beginLoading,
  currentVpuGeneration,
  endLoading,
  endVpuLoad,
  startVpuLoad,
} from 'features/DataStream/actions/loadState';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { useVPUStore } from 'features/DataStream/store/VPU';

/** Bring the currently selected vpu's data into the stores, then chart the selected feature. */
export async function loadVpu() {
  const { cache_key: cacheKey, vpu, set_variables } = useDataStreamStore.getState();
  if (!cacheKey) return;

  const generation = startVpuLoad();
  const superseded = () => generation !== currentVpuGeneration();
  const timeseries = useTimeSeriesStore.getState();

  try {
    useVPUStore.getState().resetVPU();
    timeseries.reset_series();
    useTimeSeriesStore.setState({ last_error: null });
    beginLoading();
    timeseries.set_loading_text(`Loading ${vpu}`);

    const tableExists = await checkForTable(cacheKey);
    if (superseded()) return;

    if (!tableExists) {
      try {
        const { prefix } = useS3DataStreamBucketStore.getState();
        await fetchVpuTable(cacheKey, prefix);
        if (superseded()) return;
      } catch (err) {
        if (superseded()) return;
        console.error('No data for VPU', vpu, err);
        const reason = cacheFailureReason(err);
        useTimeSeriesStore.setState({
          loadingText: reason ? `Could not load: ${reason}` : 'No data available for selected VPU',
          last_error: { kind: 'vpu-missing', cacheKey },
        });
        return;
      }
    }

    const [featureIDs, variables] = await Promise.all([
      getFeatureIDs(cacheKey),
      getVariables({ cacheKey }),
    ]);
    if (superseded()) return;
    useVPUStore.getState().setFeatureIds(featureIDs);
    set_variables(variables);
    timeseries.set_variable(variables[0]);
    const currentVariable = variables[0];

    const [featureIds, times, flat] = await Promise.all([
      getDistinctFeatureIds(cacheKey),
      getDistinctTimes(cacheKey),
      getVpuVariableFlat(cacheKey, currentVariable),
    ]);
    if (superseded()) return;
    useVPUStore.getState().setAnimationIndex(featureIds, times);
    useVPUStore.getState().setVarData(currentVariable, flat);

    const { selected_feature } = useFeatureStore.getState();
    const featureId = selected_feature?._id ?? null;
    if (featureId) {
      await loadTimeseries({ featureId, vpuGeneration: generation });
      if (superseded()) return;
    } else {
      timeseries.set_loading_text('');
    }
  } catch (err) {
    if (superseded()) return;
    useTimeSeriesStore.setState({
      loadingText: vpu ? `Failed to load data for ${vpu}` : 'Failed to load the selected data',
      last_error: { kind: 'vpu', cacheKey },
    });
    console.error('Failed to load VPU data for cacheKey:', cacheKey, err);
  } finally {
    endVpuLoad();
    endLoading();
  }
}
