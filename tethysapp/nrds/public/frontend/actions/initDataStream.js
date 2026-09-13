import { initialS3Data, makePrefix } from '../lib/s3Utils.js';
import { getCacheKey } from '../lib/utils.js';
import { store as appStore, actions } from '../store/app-store.js';
import { loadVpu } from './loadVpu.js';
import { cancelVpuLoads } from './loadState.js';
import { cancelSelections } from './selectionGeneration.js';

/**
 * The data layer's composition root (migration unit U3b), the vanilla replacement for the React
 * InitialS3Loader view. On startup it resolves the S3 option lists for a default vpu via
 * initialS3Data, seeds the datastream and s3 store slices with the first choice of each list,
 * computes the same prefix and cache key the React app built, and calls loadVpu once so the vpu
 * slice fills with the feature ids, times, and default variable arrays a later colouring unit reads.
 *
 * It also registers the load and selection cancellers into the store, so the store's leaveCurrentVpu
 * (run whenever set_vpu moves to another vpu) invalidates the generation of any load still fetching
 * the vpu being left. React wired these as direct imports inside the Datastream store; the vanilla
 * store cannot import the not-yet-ported action modules, so it exposes registerVpuCanceller and the
 * data layer registers into it here.
 */

/** The vpu the app opens on when nothing has been selected from the map yet. */
const DEFAULT_VPU = 'VPU_01';

let started = false;
let cancellersWired = false;

/** Register the load and selection cancellers once so leaving a vpu tears down its in-flight load. */
function wireCancellers() {
  if (cancellersWired) return;
  cancellersWired = true;
  actions.registerVpuCanceller(cancelVpuLoads);
  actions.registerVpuCanceller(cancelSelections);
}

/** Give up on a selection whose output-file listing is empty, without charting cosmetics (deferred). */
function abandonSelectionWithNoOutput() {
  cancelVpuLoads();
  actions.set_cache_key(null);
  actions.set_outputFile('');
  actions.set_prefix('');
  actions.resetVPU();
  actions.reset_series();
  const s = appStore.get().timeseries;
  appStore.set({
    timeseries: {
      ...s,
      loadingText: 'No output file for this selection',
      last_error: { kind: 'no-output-file' },
      pending: false,
    },
  });
}

/**
 * Resolve the initial selection and load the default vpu once. Runs at most once per page. The store
 * argument defaults to the app singleton the actions are bound to; it is accepted so the entry can
 * pass the same store it hands the map, matching the app's other components.
 */
export async function initDataStream(store = appStore, { vpu = DEFAULT_VPU, signal } = {}) {
  if (started) return;
  started = true;
  wireCancellers();
  if (!vpu) return;

  try {
    const { models, dates, forecasts, cycles, ensembles, outputFiles } = await initialS3Data(vpu, {
      signal,
    });

    const _models = models.filter((m) => m.value !== 'test');
    const defaultDate = dates[0]?.value;

    if (!outputFiles.length) {
      actions.setInitialData({ models: _models, dates, forecasts, cycles, outputFiles, prefix: '' });
      actions.set_model(_models[0]?.value);
      actions.set_forecast(forecasts[0]?.value);
      actions.set_cycle(cycles[0]?.value);
      actions.set_date(defaultDate);
      actions.set_ensemble(ensembles[0]?.value || null);
      abandonSelectionWithNoOutput();
      return;
    }

    const selection = [
      _models[0]?.value,
      defaultDate,
      forecasts[0]?.value,
      cycles[0]?.value,
      ensembles[0]?.value || null,
      vpu,
      outputFiles[0]?.value,
    ];
    const cacheKey = getCacheKey(...selection);

    actions.set_vpu(vpu);
    actions.set_model(_models[0]?.value);
    actions.set_forecast(forecasts[0]?.value);
    actions.set_cycle(cycles[0]?.value);
    actions.set_outputFile(outputFiles[0]?.value);
    actions.set_date(defaultDate);
    actions.set_ensemble(ensembles[0]?.value || null);
    actions.set_cache_key(cacheKey);

    const _prefix = makePrefix(...selection);
    actions.setInitialData({
      models: _models,
      dates,
      forecasts,
      cycles,
      outputFiles,
      prefix: _prefix,
    });

    await loadVpu();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.error('Error fetching initial S3 data:', error);
  }
}
