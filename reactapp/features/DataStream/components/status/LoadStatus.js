import React from 'react';
import { useShallow } from 'zustand/react/shallow';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import Spinner from 'features/Tethys/components/loader/Spinner';
import { StatusStrip } from '../styles/Styles';

/**
 * Whether anything is loading, and what went wrong if something did.
 *
 * This used to live inside the forecast panel, which is slid off-screen whenever feature_id is
 * null -- so the whole of a first load, every vpu switch, and every failed load reported
 * themselves to an element nobody could see. A load that never sets feature_id, which is
 * exactly what a failure is, could not appear at all. It belongs in the header, which is
 * always on screen, because whether the app is working is not a property of one panel.
 *
 * Renders nothing when there is nothing to say, so it costs no space while idle.
 */
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

  // The index takes about seven seconds and blocks nothing else, so without saying so here the
  // map looks ready while the one thing that needs it is not. Yielding to a real load keeps the
  // strip to one statement at a time.
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
      {/* pending as well as loading: the click writes its message before the load starts, and
          that gap is the slowest part of a vpu switch. A message with no spinner beside it reads
          as a label rather than as work in progress. */}
      {(loading || pending) && !failed && <Spinner size={14} />}
      {loadingText && <span>{loadingText}</span>}
    </StatusStrip>
  );
});

export default LoadStatus;
