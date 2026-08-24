import { checkForTable, getTimeseries } from 'features/DataStream/lib/queryData';
import { makeFeatureTitle, makeRunLabel, numericPartOf } from 'features/DataStream/lib/utils';
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

/** Load and chart the series for one feature. */
export async function loadTimeseries({ featureId, variable, vpuGeneration } = {}) {
  const store = useTimeSeriesStore;
  const state = store.getState();
  const targetId = featureId ?? store.getState().feature_id;
  if (!targetId) return;
  if (targetId !== state.feature_id) {
    store.setState({ feature_id: targetId, last_answered_key: null });
  }

  if (vpuGeneration === undefined && vpuLoadInFlight()) return;

  const generation = vpuGeneration ?? currentVpuGeneration();
  const { cache_key: cacheKey, forecast, variables } = useDataStreamStore.getState();
  const requestedVariable = variable || state.variable || variables[0];
  const requestKey = `${cacheKey}|${requestedVariable}|${targetId}`;

  if (vpuGeneration === undefined) {
    try {
      if (!(await checkForTable(cacheKey))) {
        store.setState({ last_loaded_key: null });
        const { loadVpu } = await import('features/DataStream/actions/loadVpu');
        await loadVpu();
        return;
      }
    } catch (err) {
      console.error('Could not read the table for', targetId, err);
      store.setState({
        loadingText: `Failed to load timeseries for id: ${targetId}`,
        last_error: { kind: 'timeseries', featureId: targetId, variable: requestedVariable },
        pending: false,
      });
      return;
    }
  }

  if (requestKey === state.last_loaded_key) {
    store.setState({ loadingText: '', pending: false });
    return;
  }

  const ticket = series.next();
  const superseded = () => !series.isCurrent(ticket) || generation !== currentVpuGeneration();
  const id = numericPartOf(targetId);
  try {
    store.getState().reset_series();
    beginLoading();
    store.setState({ loadingText: `Loading ${targetId}`, last_error: null });

    const rows = await getTimeseries(id, cacheKey, requestedVariable);
    if (superseded()) return;
    const points = rows.map((d) => ({ x: new Date(d.time), y: d[requestedVariable] }));
    store.getState().set_series(points);
    store.getState().set_layout({
      yaxis: requestedVariable,
      xaxis: '',
      title: makeFeatureTitle(targetId),
      subtitle: makeRunLabel(forecast),
    });
    store.setState({
      last_loaded_key: points.length ? requestKey : null,
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
