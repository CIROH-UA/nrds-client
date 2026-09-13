import { store } from '../store/app-store.js';
import { loadTimeseries } from './loadTimeseries.js';
import { vpuLoadInFlight } from './loadState.js';

/**
 * Draw a selection that already belongs to the loaded vpu (migration unit U5), ported from the React
 * DataStream chartSelection action. Normally it just charts the feature through loadTimeseries; when
 * the vpu's animation arrays have been dropped but its duckdb table is still built (the panel was
 * closed away), it rebuilds the whole view through loadVpu instead so the reader gets the reaches and
 * the slider back, not a bare plot. loadVpu is imported lazily to keep the static import graph free
 * of the loadVpu -> loadTimeseries -> loadVpu cycle.
 */

/** Merge a patch into the timeseries slice without a dedicated action for each field. */
const patchTimeseries = (patch) => {
  const s = store.get().timeseries;
  store.set({ timeseries: { ...s, ...patch } });
};

export function chartSelection({ featureId, vpuName }) {
  const { cache_key: cacheKey } = store.get().datastream;
  const keyIsOurs = Boolean(cacheKey) && cacheKey.includes(vpuName);
  const animationGone =
    store.get().vpu.times.length === 0 && keyIsOurs && !vpuLoadInFlight();
  const restore = animationGone
    ? () => import('./loadVpu.js').then((m) => m.loadVpu())
    : () => loadTimeseries({ featureId });

  return restore().catch((err) => {
    console.error('Could not chart', featureId, err);
    patchTimeseries({
      loadingText: 'Could not load this selection',
      last_error: { kind: 'timeseries', featureId },
      pending: false,
    });
  });
}
