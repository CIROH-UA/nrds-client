import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { loadTimeseries } from 'features/DataStream/actions/loadTimeseries';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { vpuLoadInFlight } from 'features/DataStream/actions/loadState';

/** Draw a selection that already belongs to the loaded vpu. */
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
