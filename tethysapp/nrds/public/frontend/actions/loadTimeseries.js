import { checkForTable, getTimeseries } from '../lib/queryData.js';
import { makeFeatureTitle, makeRunLabel, numericPartOf } from '../lib/utils.js';
import { createSequence } from '../lib/sequence.js';
import { store, actions } from '../store/app-store.js';
import {
  beginLoading,
  currentVpuGeneration,
  endLoading,
  vpuLoadInFlight,
} from './loadState.js';

/**
 * Load and chart the timeseries for one feature (migration unit U4), ported from the React
 * DataStream loadTimeseries action. Given the current feature and variable it queries the series
 * through the ported query layer, shapes the rows into the store's series points, and writes them
 * with set_series / set_layout, leaving the chart component to draw them.
 *
 * Latest-wins: series loads order against each other through a local sequence, and against the vpu
 * load through the shared vpu generation in loadState; a request that has been overtaken by either
 * returns without writing so stale data never lands. When the selection's table is not yet in
 * duckdb it hands off to loadVpu and returns. The no-output/failure branches set loadingText and
 * last_error the way TimeseriesCard reads them.
 */

const series = createSequence();

/** Merge a patch into the timeseries slice without a dedicated action for each field. */
const patchTimeseries = (patch) => {
  const s = store.get().timeseries;
  store.set({ timeseries: { ...s, ...patch } });
};

export async function loadTimeseries({ featureId, variable, vpuGeneration } = {}) {
  const state = store.get().timeseries;
  const targetId = featureId ?? state.feature_id;
  if (!targetId) return;
  if (targetId !== state.feature_id) {
    patchTimeseries({ feature_id: targetId, last_answered_key: null });
  }

  if (vpuGeneration === undefined && vpuLoadInFlight()) return;

  const generation = vpuGeneration ?? currentVpuGeneration();
  const { cache_key: cacheKey, forecast, variables } = store.get().datastream;
  const requestedVariable = variable || state.variable || variables[0];
  const requestKey = `${cacheKey}|${requestedVariable}|${targetId}`;

  if (requestedVariable !== store.get().timeseries.variable) {
    actions.set_variable(requestedVariable);
  }

  if (vpuGeneration === undefined) {
    try {
      if (!(await checkForTable(cacheKey))) {
        patchTimeseries({ last_loaded_key: null });
        const { loadVpu } = await import('./loadVpu.js');
        await loadVpu();
        return;
      }
    } catch (err) {
      console.error('Could not read the table for', targetId, err);
      patchTimeseries({
        loadingText: `Failed to load timeseries for id: ${targetId}`,
        last_error: { kind: 'timeseries', featureId: targetId, variable: requestedVariable },
        last_answered_key: requestKey,
        pending: false,
      });
      return;
    }
  }

  if (requestKey === store.get().timeseries.last_loaded_key) {
    patchTimeseries({ loadingText: '', pending: false });
    return;
  }

  const ticket = series.next();
  const superseded = () => !series.isCurrent(ticket) || generation !== currentVpuGeneration();
  const id = numericPartOf(targetId);
  try {
    actions.reset_series();
    beginLoading();
    patchTimeseries({ loadingText: `Loading ${targetId}`, last_error: null });

    const rows = await getTimeseries(id, cacheKey, requestedVariable);
    if (superseded()) return;
    const points = rows.map((d) => ({ x: new Date(d.time), y: d[requestedVariable] }));
    actions.set_series(points);
    actions.set_layout({
      yaxis: requestedVariable,
      xaxis: '',
      title: makeFeatureTitle(targetId),
      subtitle: makeRunLabel(forecast),
    });
    patchTimeseries({
      last_loaded_key: points.length ? requestKey : null,
      last_answered_key: requestKey,
      loadingText: points.length ? '' : `No ${requestedVariable} data for ${targetId}`,
      last_error: null,
    });
  } catch (err) {
    if (superseded()) return;
    patchTimeseries({
      loadingText: `Failed to load timeseries for id: ${targetId}`,
      last_error: { kind: 'timeseries', featureId: targetId, variable: requestedVariable },
      last_answered_key: requestKey,
      pending: false,
    });
    console.error('Failed to load timeseries for', targetId, err);
  } finally {
    endLoading();
  }
}
