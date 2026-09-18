import { getFeatureProperties } from '../lib/queryData.js';
import { store, actions } from '../store/app-store.js';
import { chartSelection } from './chartSelection.js';
import { loadVpuSelection } from './initDataStream.js';
import { beginSelection, isCurrentSelection } from './selectionGeneration.js';

/**
 * Select the feature an id names (migration unit U5d), ported from the React DataStream
 * selectIndexedFeature action and wired into the vanilla selection chain the same way selectMapFeature
 * is. A map click already carries the feature's geometry and vpuid; a search only has an id, so this
 * fills in what the click knew from the hydrofabric index: it resolves the id to the index row (its
 * vpuid and its `lon`/`lat` centroid), stores that flattened row as the selection, and then drives
 * the same load a click would.
 *
 * Same vpu: chartSelection draws the feature straight from the loaded animation. Another vpu: the run
 * menu that would load it is not yet ported, so this drives loadVpuSelection here -- latest-wins, it
 * claims a selection generation and abandons itself if a newer selection has taken over, and set_vpu
 * has already cancelled any load still fetching the vpu being left.
 *
 * Returns the matched id, or null when no candidate id is in the index (a search miss).
 */

/** Merge a patch into the timeseries slice without a dedicated action for each field. */
const patchTimeseries = (patch) => {
  const s = store.get().timeseries;
  store.set({ timeseries: { ...s, ...patch } });
};

export async function selectIndexedFeature(candidates) {
  const ids = (Array.isArray(candidates) ? candidates : [candidates]).filter(Boolean);
  if (!ids.length) return null;

  const features = await getFeatureProperties({ cacheKey: 'index_data_table', feature_id: ids });
  if (!features.length) return null;

  const feature = features[0];
  const matchedId = feature.id ?? ids[0];
  const vpuName = `VPU_${feature.vpuid}`;
  const { vpu } = store.get().datastream;
  const crossVpu = vpuName !== vpu;

  actions.set_selected_feature({ _id: matchedId, ...feature });

  if (crossVpu) {
    actions.reset_series();
    patchTimeseries({
      feature_id: matchedId,
      loadingText: `Loading ${vpuName}`,
      last_error: null,
      pending: true,
    });
  } else {
    patchTimeseries({ loadingText: `Loading ${matchedId}`, last_error: null, pending: true });
    chartSelection({ featureId: matchedId, vpuName });
  }

  actions.set_vpu(vpuName);

  if (crossVpu) {
    const generation = beginSelection();
    loadVpuSelection(vpuName, { shouldContinue: () => isCurrentSelection(generation) }).catch(
      (err) => {
        if (!isCurrentSelection(generation)) return;
        console.error('Failed to load selected vpu', vpuName, err);
        patchTimeseries({
          loadingText: `Failed to load data for ${vpuName}`,
          last_error: { kind: 'vpu' },
          pending: false,
        });
      }
    );
  }

  return matchedId;
}
