import { useShallow } from 'zustand/react/shallow';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { LoadProgressBar } from '../styles/Styles';

/** The map's own answer to "is it doing anything". */
export const LoadProgress = () => {
  const indexLoading = useDataStreamStore((s) => s.index_status === 'loading');
  const { loading, pending, failed } = useTimeSeriesStore(
    useShallow((s) => ({
      loading: s.loading,
      pending: s.pending,
      failed: s.last_error !== null,
    }))
  );

  if (failed || !(loading || pending || indexLoading)) return null;

  return <LoadProgressBar aria-hidden="true" />;
};

export default LoadProgress;
