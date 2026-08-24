import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { loadTimeseries } from 'features/DataStream/actions/loadTimeseries';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { vpuLoadInFlight } from 'features/DataStream/actions/loadState';

/**
 * Draw a selection that already belongs to the loaded vpu.
 *
 * Charting alone is not enough when the animation has been taken down. Closing the panel calls
 * resetVPU, which empties the animation arrays and clears the selected variable but leaves the
 * duckdb table built. Asking for a series then finds that table and charts straight from it, so
 * the reader gets a plot with no variable selected, no animated reaches and no slider. A vpu
 * load over an existing table skips the download and rebuilds exactly what is missing -- the
 * ids, the variables, the animation -- and charts at the end of it, which is the state selecting
 * a feature should leave behind.
 *
 * An empty animation does not always mean the panel was closed. It is also empty while a vpu's
 * very first load is still running: the vpu updates synchronously on the selection, but cache_key
 * is filled in later by the loader effect, after an S3 round trip. A second selection in that
 * window used to start a second loadVpu, and two of them reaching CREATE TABLE for the same key
 * leaves the loser throwing a catalog error that surfaces as "No data available" for a feature
 * that has data. Worse, if cache_key still named the previous vpu, the animation and variables
 * came back for the wrong one. So the rebuild only runs when there is a key, it belongs to this
 * vpu, and nothing is already loading; otherwise the load in flight charts this selection when
 * it lands.
 *
 * Shared by the map click and the search box because it is one rule about what a selection means,
 * not two. It was written for the click, and the search box went without it for a release: a
 * search made after closing the panel drew the same variable-less plot the click used to.
 *
 * Not awaited. Selecting returns immediately and the load reports itself; the catch is the
 * backstop for anything that escapes its own reporting, so a failure cannot become an unhandled
 * rejection that leaves the gesture looking ignored.
 */
export function chartSelection({ featureId, vpuName }) {
  const { cache_key: cacheKey } = useDataStreamStore.getState();
  const keyIsOurs = Boolean(cacheKey) && cacheKey.includes(vpuName);
  const animationGone =
    useVPUStore.getState().times.length === 0 && keyIsOurs && !vpuLoadInFlight();
  const restore = animationGone
    ? () => import('features/DataStream/actions/loadVpu').then((m) => m.loadVpu())
    : () => loadTimeseries({ featureId });

  return restore().catch((err) => {
    console.error('Could not chart', featureId, err);
    useTimeSeriesStore.setState({
      loadingText: 'Could not load this selection',
      last_error: { kind: 'timeseries', featureId },
      pending: false,
    });
  });
}
