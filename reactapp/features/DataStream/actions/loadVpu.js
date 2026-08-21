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
import { useVPUStore, useFeatureStore } from 'features/DataStream/store/Layers';
import { useCacheTablesStore } from 'features/DataStream/store/CacheTables';


/**
 * Bring the currently selected vpu's data into the stores, then chart the selected feature.
 *
 * This was an effect keyed on cache_key, which meant re-requesting the same vpu after a
 * failure changed no state and so could not re-run: the fix at the time was a request
 * counter whose only job was to make a repeat visible to a dependency array. Pressing
 * visualize is an event, and so is picking a vpu on the map, so both call this instead and a
 * repeat call is simply a repeat.
 *
 * It lives outside the stores because it spans six of them. Reading each with getState at
 * the point of use also means late steps see current state rather than whatever a render
 * closure captured when the load began.
 */
export async function loadVpu() {
  const { cache_key: cacheKey, vpu, set_variables } = useDataStreamStore.getState();
  if (!cacheKey) return;

  // Bumped before any await, so a series load already in flight stops writing immediately.
  const generation = startVpuLoad();
  const superseded = () => generation !== currentVpuGeneration();
  const timeseries = useTimeSeriesStore.getState();

  // All inside the try: a throw before the finally would defer every later click for good.
  try {
    // Not a full reset: feature_id is what holds the panel open and the click that asked for
    // this load is what set it, so clearing it closed the panel mid-load and reopened it once
    // the series arrived, with the placeholder title in between.
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
        // Read back rather than appended, and before the supersession check: the download
        // completed, so the file is on disk whether or not this load is still wanted. Returning
        // first left the listing insisting the cache was empty over a file that had just landed,
        // which is what a clear pressed mid-download used to produce.
        await useCacheTablesStore.getState().refresh();
        if (superseded()) return;
      } catch (err) {
        if (superseded()) return;
        console.error('No data for VPU', vpu, err);
        useTimeSeriesStore.setState({
          loadingText: 'No data available for selected VPU',
          last_error: { kind: 'vpu-missing', cacheKey },
        });
        return;
      }
    }

    const featureIDs = await getFeatureIDs(cacheKey);
    if (superseded()) return;
    useVPUStore.getState().set_feature_ids(featureIDs);

    const variables = await getVariables({ cacheKey });
    if (superseded()) return;
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

    // Read at the point of use: the selection can have moved on while the vpu was loading.
    // Asked for by name rather than left to loadTimeseries to fall back on feature_id, which
    // this used to clear and no longer does: with nothing selected there is nothing to chart.
    const { selected_feature } = useFeatureStore.getState();
    const featureId = selected_feature?._id ?? null;
    if (featureId) {
      await loadTimeseries({ featureId, vpuGeneration: generation });
      if (superseded()) return;
    } else {
      // Otherwise the series load owns this message.
      timeseries.set_loading_text('');
    }
  } catch (err) {
    if (superseded()) return;
    useTimeSeriesStore.setState({
      // Named by the vpu, not the cache key: the key runs to about a hundred characters and
      // this message is read in a header pill. Guarded, so a missing vpu is not printed.
      loadingText: vpu ? `Failed to load data for ${vpu}` : 'Failed to load the selected data',
      last_error: { kind: 'vpu', cacheKey },
    });
    console.error('Failed to load VPU data for cacheKey:', cacheKey, err);
  } finally {
    endVpuLoad();
    endLoading();
  }
}
