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


/**
 * Bring the currently selected vpu's data into the stores, then chart the selected feature.
 *
 * This was an effect keyed on cache_key, which meant re-requesting the same vpu after a
 * failure changed no state and so could not re-run: the fix at the time was a request
 * counter whose only job was to make a repeat visible to a dependency array. Pressing
 * visualize is an event, and so is picking a vpu on the map, so both call this instead and a
 * repeat call is simply a repeat.
 *
 * The generation is bumped before any await, so a series load already in flight stops writing
 * immediately. Everything after it is inside the try: a throw before the finally would defer
 * every later click for good. reset_series rather than a full reset, because feature_id is what
 * holds the panel open -- clearing it closed the panel mid-load and reopened it once the series
 * arrived, with the placeholder title in between.
 *
 * Failures are named where they can be. Every one of them used to read as absent data, so a
 * stalled download, a full cache and a database that stopped answering were all reported as this
 * vpu having nothing. The message names the vpu rather than the cache key, which runs to about a
 * hundred characters and is read in a header pill.
 *
 * The feature ids and the variable list are fetched together: neither reads the other's answer,
 * and each is its own round trip to the worker.
 *
 * It lives outside the stores because it spans six of them. * It lives outside the stores because it spans six of them. Reading each with getState at
 * the point of use also means late steps see current state rather than whatever a render
 * closure captured when the load began.
 *
 * The closing chart asks for its feature by name rather than leaving loadTimeseries to fall
 * back on feature_id. This used to clear feature_id and no longer does, since that is what
 * holds the panel open -- but the fallback would chart the previous selection when the current
 * one is gone, and with nothing selected there is nothing to chart.
 */
export async function loadVpu() {
  const { cache_key: cacheKey, vpu, set_variables } = useDataStreamStore.getState();
  if (!cacheKey) return;

  const generation = startVpuLoad();
  const superseded = () => generation !== currentVpuGeneration();
  const timeseries = useTimeSeriesStore.getState();

  try {
    timeseries.reset_series();
    useTimeSeriesStore.setState({ last_error: null });
    useVPUStore.getState().resetVPU();
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
