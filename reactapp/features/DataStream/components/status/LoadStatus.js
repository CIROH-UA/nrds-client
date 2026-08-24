import React from 'react';
import { useShallow } from 'zustand/react/shallow';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import Spinner from 'features/Tethys/components/loader/Spinner';
import { StatusStrip } from '../styles/Styles';

/** Whether anything is loading, and what went wrong if something did. */
export const LoadStatus = React.memo(function LoadStatus() {
  const indexLoading = useDataStreamStore((s) => s.index_status === 'loading');
  const { loading, pending, loadingText, failed, errorKind } = useTimeSeriesStore(
    useShallow((s) => ({
      loading: s.loading,
      pending: s.pending,
      loadingText: s.loadingText,
      failed: s.last_error !== null,
      errorKind: s.last_error?.kind ?? null,
    }))
  );

  if (indexLoading && !loading && !loadingText) {
    return (
      <StatusStrip role="status" aria-live="polite">
        <Spinner size={14} />
        <span>Building the search index</span>
      </StatusStrip>
    );
  }

  if (!loading && !loadingText) return null;

  return (
    <StatusStrip role="status" aria-live="polite" $failed={failed} data-error-kind={errorKind || undefined}>
      {(loading || pending) && !failed && <Spinner size={14} />}
      {loadingText && <span>{loadingText}</span>}
    </StatusStrip>
  );
});

export default LoadStatus;
