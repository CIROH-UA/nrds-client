import { store, actions } from '../store/app-store.js';
import { resolveVpuName, selectionPayload } from '../lib/selection.js';
import { chartSelection } from './chartSelection.js';
import { loadVpuSelection } from './initDataStream.js';
import { beginSelection, isCurrentSelection } from './selectionGeneration.js';

/**
 * Turn a map click into the app's selection (migration unit U5), ported from the React DataStream
 * selectMapFeature action. It records the clicked feature (flattened, with its centroid as the popup
 * anchor and its reach id as feature_id), decides which vpu it belongs to, and charts it.
 *
 * Same vpu: chartSelection draws it straight from the loaded animation. Another vpu: React deferred
 * the actual load to the run menu, which is not yet ported, so this drives it here through
 * loadVpuSelection -- fetch the vpu's run, rebuild the cache key and prefix, load the animation, and
 * (in loadVpu's closing step) chart the selected feature. That cross-vpu load is fired latest-wins:
 * it claims a selection generation and abandons itself if a newer click has taken over, and set_vpu
 * has already cancelled any load still fetching the vpu being left.
 *
 * The vpu comes from the clicked feature's own `vpuid` property, exactly as React read it; catchments
 * always carry one. When one is somehow absent the current vpu is kept rather than loading a
 * `VPU_undefined` -- the documented interim for a click the hydrofabric index would otherwise resolve.
 */

/** Merge a patch into the timeseries slice without a dedicated action for each field. */
const patchTimeseries = (patch) => {
  const s = store.get().timeseries;
  store.set({ timeseries: { ...s, ...patch } });
};

export function selectMapFeature(feature, layerId) {
  const selection = selectionPayload(feature, layerId);
  const featureId = selection?.featureId;

  if (selection) actions.set_selected_feature(selection.payload);

  const { vpu } = store.get().datastream;
  const resolvedVpu = resolveVpuName(feature);
  const vpuName = resolvedVpu ?? vpu;
  const crossVpu = vpuName !== vpu;

  if (featureId != null) {
    if (crossVpu) {
      actions.reset_series();
      patchTimeseries({
        feature_id: featureId,
        loadingText: `Loading ${vpuName}`,
        last_error: null,
        pending: true,
      });
    } else {
      patchTimeseries({ loadingText: `Loading ${featureId}`, last_error: null, pending: true });
    }
  }

  if (featureId != null && !crossVpu) {
    chartSelection({ featureId, vpuName });
  }

  actions.set_vpu(vpuName);

  if (featureId != null && crossVpu) {
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

  return featureId;
}
