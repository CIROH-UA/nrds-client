import { checkForTable, getTimeseries } from 'features/DataStream/lib/queryData';
import { makeTitle } from 'features/DataStream/lib/utils';
import { createSequence } from 'features/DataStream/lib/sequence';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import {
  beginLoading,
  currentVpuGeneration,
  endLoading,
  vpuLoadInFlight,
} from 'features/DataStream/actions/loadState';

// Orders series loads against each other. Ordering against a vpu load is a separate
// question, answered by the shared vpu generation in loadState.
const series = createSequence();

/**
 * Load and chart the series for one feature.
 *
 * Called straight from the map click, the search box, the variable menu, and the end of a vpu
 * load. A repeat call is a retry, so a failed load needs no special path, and the guard below
 * means asking for the feature already on screen costs nothing.
 *
 * ``variable`` applies to this request only. The caller owns the store's variable, so the
 * flowpath layer is never left looking up data that has not arrived yet.
 *
 * Kept out of the store so that importing the store does not drag in duckdb and arrow: every
 * component reading a timeseries value would otherwise pull the whole query layer with it.
 *
 * Clearing the message on the already-charted path is unconditional, and safe to be. Read on its
 * own it looks like it could blank an indicator belonging to a load still running -- changing the
 * variable, for instance, updates the store's variable only after its load resolves, so a click
 * arriving in that window builds its key from the old variable. It cannot: every real load opens
 * with reset_series, which nulls last_loaded_key, so while one is in flight there is nothing here
 * for a later call to match. Reaching this branch is itself the proof that nothing is loading.
 *
 * A missing table is rebuilt rather than queried. Deleting a cached file drops its duckdb
 * table, and nothing else in the app knew that had happened, so a click came straight here and
 * queried a table that was gone. That surfaced as a raw "Table with name ... does not exist"
 * catalog error, after which nothing loaded again. The check sits ahead of the already-charted
 * short circuit because re-clicking the feature that was on screen when the cache was deleted
 * matches ``last_loaded_key``, so the gesture most likely to follow a delete would otherwise
 * return early and never recover. It costs one information_schema lookup, about a millisecond.
 */
export async function loadTimeseries({ featureId, variable, vpuGeneration } = {}) {
  const store = useTimeSeriesStore;
  const state = store.getState();
  const targetId = featureId ?? store.getState().feature_id;
  if (!targetId) return;
  // The answer on record goes with it: an answer belongs to the feature it answered.
  if (targetId !== state.feature_id) {
    store.setState({ feature_id: targetId, last_answered_key: null });
  }

  // A vpu load is rebuilding this table; its closing call charts whatever is selected then.
  if (vpuGeneration === undefined && vpuLoadInFlight()) return;

  const generation = vpuGeneration ?? currentVpuGeneration();
  const { cache_key: cacheKey, forecast, variables } = useDataStreamStore.getState();
  const requestedVariable = variable || state.variable || variables[0];
  const requestKey = `${cacheKey}|${requestedVariable}|${targetId}`;

  // Ahead of the already-charted check, and guarded on its own: beginLoading has not run yet.
  if (vpuGeneration === undefined) {
    try {
      if (!(await checkForTable(cacheKey))) {
        store.setState({ last_loaded_key: null });
        // Imported here so this module does not pull duckdb in through the cache store.
        const { loadVpu } = await import('features/DataStream/actions/loadVpu');
        await loadVpu();
        return;
      }
    } catch (err) {
      console.error('Could not read the table for', targetId, err);
      store.setState({
        loadingText: `Failed to load timeseries for id: ${targetId}`,
        last_error: { kind: 'timeseries', featureId: targetId, variable: requestedVariable },
      });
      return;
    }
  }

  // Already charted, so nothing to fetch -- and the click's message has to come down with it.
  if (requestKey === state.last_loaded_key) {
    store.setState({ loadingText: '' });
    return;
  }

  const ticket = series.next();
  // Superseded by a newer series load, or by a vpu load that replaced the table underneath.
  const superseded = () => !series.isCurrent(ticket) || generation !== currentVpuGeneration();
  const id = targetId.split('-')[1];
  // Inside the try for the same reason as loadVpu: the finally is what releases the count.
  try {
    store.getState().reset_series();
    beginLoading();
    // Names what is loading; this used to reuse the vpu loader's message.
    store.setState({ loadingText: `Loading ${targetId}`, last_error: null });

    const rows = await getTimeseries(id, cacheKey, requestedVariable);
    if (superseded()) return;
    const points = rows.map((d) => ({ x: new Date(d.time), y: d[requestedVariable] }));
    store.getState().set_series(points);
    store.getState().set_layout({
      yaxis: requestedVariable,
      xaxis: '',
      title: makeTitle(forecast, targetId),
    });
    // Recorded as loaded only when something was charted, so asking again is always answered.
    store.setState({
      last_loaded_key: points.length ? requestKey : null,
      // Recorded either way: an answer arriving is a different fact from something charted.
      last_answered_key: requestKey,
      loadingText: points.length ? '' : `No ${requestedVariable} data for ${targetId}`,
      last_error: null,
    });
  } catch (err) {
    if (superseded()) return;
    store.setState({
      loadingText: `Failed to load timeseries for id: ${targetId}`,
      last_error: { kind: 'timeseries', featureId: targetId, variable: requestedVariable },
    });
    console.error('Failed to load timeseries for', targetId, err);
  } finally {
    endLoading();
  }
}
