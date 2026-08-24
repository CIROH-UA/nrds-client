import { useShallow } from 'zustand/react/shallow';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { LoadProgressBar } from '../styles/Styles';

/**
 * The map's own answer to "is it doing anything".
 *
 * The status strip already names what is loading, but it sits in the header beside the search
 * box, and a reader who has just clicked a catchment is looking at the catchment. A vpu switch
 * takes seconds -- an S3 listing, a parquet download, a duckdb table build -- and for most of
 * that the map is fully interactive and completely unchanged, which reads as nothing happening.
 *
 * Covers the same span as the strip's spinner: pending from the moment of the click, loading
 * once the work starts, and the index build, which blocks the search box rather than the map
 * but is the other thing worth waiting for.
 *
 * Renders nothing when idle, so it costs no space and no paint.
 */
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
