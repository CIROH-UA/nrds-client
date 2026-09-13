import {
  checkForTable,
  loadVpuData as fetchVpuTable,
  getFeatureIDs,
  getVariables,
  getDistinctFeatureIds,
  getDistinctTimes,
  getVpuVariableFlat,
} from '../lib/queryData.js';
import { cacheFailureReason } from '../lib/utils.js';
import { store, actions } from '../store/app-store.js';
import {
  beginLoading,
  currentVpuGeneration,
  endLoading,
  endVpuLoad,
  startVpuLoad,
} from './loadState.js';

/**
 * Bring the currently selected vpu's animation data into the store (migration unit U3b), ported
 * from the React DataStream loadVpu action. It fetches the selection's output parquet, registers it
 * in duckdb through the ported query layer, and extracts the feature ids, times, and the default
 * variable's flat value array into the vpu slice via setFeatureIds / setAnimationIndex / setVarData.
 *
 * Latest-wins: the load claims a generation from startVpuLoad and, after every await, checks whether
 * a newer selection has superseded it; a superseded load returns without writing so stale data never
 * lands. Charting the selected feature (loadTimeseries) is a later migration unit and is intentionally
 * absent; on startup nothing is selected, so this simply clears the loading text.
 */

/** Merge a patch into the timeseries slice without a dedicated action for each field. */
const patchTimeseries = (patch) => {
  const s = store.get().timeseries;
  store.set({ timeseries: { ...s, ...patch } });
};

export async function loadVpu() {
  const { cache_key: cacheKey, vpu } = store.get().datastream;
  if (!cacheKey) return;

  const generation = startVpuLoad();
  const superseded = () => generation !== currentVpuGeneration();

  try {
    actions.resetVPU();
    actions.reset_series();
    patchTimeseries({ last_error: null });
    beginLoading();
    actions.set_loading_text(`Loading ${vpu}`);

    const tableExists = await checkForTable(cacheKey);
    if (superseded()) return;

    if (!tableExists) {
      try {
        const { prefix } = store.get().s3;
        await fetchVpuTable(cacheKey, prefix);
        if (superseded()) return;
      } catch (err) {
        if (superseded()) return;
        console.error('No data for VPU', vpu, err);
        const reason = cacheFailureReason(err);
        patchTimeseries({
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
    actions.setFeatureIds(featureIDs);
    actions.set_variables(variables);
    actions.set_variable(variables[0]);
    const currentVariable = variables[0];

    const [featureIds, times, flat] = await Promise.all([
      getDistinctFeatureIds(cacheKey),
      getDistinctTimes(cacheKey),
      getVpuVariableFlat(cacheKey, currentVariable),
    ]);
    if (superseded()) return;
    actions.setAnimationIndex(featureIds, times);
    actions.setVarData(currentVariable, flat);

    actions.set_loading_text('');
  } catch (err) {
    if (superseded()) return;
    patchTimeseries({
      loadingText: vpu ? `Failed to load data for ${vpu}` : 'Failed to load the selected data',
      last_error: { kind: 'vpu', cacheKey },
    });
    console.error('Failed to load VPU data for cacheKey:', cacheKey, err);
  } finally {
    endVpuLoad();
    endLoading();
  }
}
