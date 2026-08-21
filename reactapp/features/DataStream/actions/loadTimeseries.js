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
  // The answer on record goes with it. An answer belongs to the feature it answered, and the
  // chart reads it to decide whether to say this one has nothing: leaving it set meant a feature
  // whose predecessor came back empty was declared empty too, before it had been asked about.
  if (targetId !== state.feature_id) {
    store.setState({ feature_id: targetId, last_answered_key: null });
  }

  // A vpu load is rebuilding this table; its closing call charts whatever is selected then.
  if (vpuGeneration === undefined && vpuLoadInFlight()) return;

  const generation = vpuGeneration ?? currentVpuGeneration();
  const { cache_key: cacheKey, forecast, variables } = useDataStreamStore.getState();
  const requestedVariable = variable || state.variable || variables[0];
  const requestKey = `${cacheKey}|${requestedVariable}|${targetId}`;

  // Ahead of the already-charted check on purpose; see the note above on a dropped table.
  // Guarded on its own, because beginLoading has not been called yet and so the finally below
  // is not the thing that has to run: asking duckdb a question can fail, and this ran outside
  // every catch, so a worker that never started made a click do nothing observable at all.
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

  // This exact series is already charted, so there is nothing to fetch.
  if (requestKey === state.last_loaded_key) return;

  const ticket = series.next();
  // Superseded by a newer series load, or by a vpu load that replaced the table underneath.
  const superseded = () => !series.isCurrent(ticket) || generation !== currentVpuGeneration();
  const id = targetId.split('-')[1];
  // Inside the try for the same reason as loadVpu: the finally is what releases the count.
  try {
    store.getState().reset_series();
    beginLoading();
    // Names what is loading. "Loading feature properties..." was the vpu loader's message,
    // reused here, so a catchment click reported something it was not doing.
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
    // Say when a load found nothing; the chart's empty state cannot distinguish that.
    //
    // Recorded as loaded only when something was actually charted. Recording an empty result
    // made the already-charted check above match on the next ask, so clicking the same catchment
    // again did nothing whatsoever: no query, no message, no change. One query is a cheap price
    // for a second ask being answered, and it is the only way this recovers if the data arrives.
    store.setState({
      last_loaded_key: points.length ? requestKey : null,
      // Recorded either way: this is the answer arriving, which is a different fact from
      // something being charted, and the chart's empty state depends on telling them apart.
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
