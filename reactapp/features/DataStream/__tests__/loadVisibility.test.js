/**
 * Whether the app looks like it is working.
 *
 * A vpu switch takes seconds -- an S3 listing, a parquet download, a duckdb table build -- and
 * for most of it the map is fully interactive and completely unchanged. The only sign was a
 * grey pill in the header beside the search box, and for the slowest part of the wait it did
 * not even have a spinner in it.
 */
import { render, screen } from '@testing-library/react';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { LoadStatus } from 'features/DataStream/components/status/LoadStatus';
import { LoadProgress } from 'features/DataStream/components/status/LoadProgress';

const initial = { ts: useTimeSeriesStore.getState(), ds: useDataStreamStore.getState() };
beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useDataStreamStore.setState(initial.ds, true);
});

const spinner = (container) => container.querySelector('span[class*="sc-"]:empty');

describe('the status strip during the gap before a load starts', () => {
  it('spins while work is promised but not yet begun', () => {
    // What a click writes: a message, immediately, before anything has started. loading is still
    // false here and stays false for as long as the S3 listing takes.
    useTimeSeriesStore.setState({ loadingText: 'Loading VPU_13', pending: true, loading: false });

    const { container } = render(<LoadStatus />);

    expect(screen.getByText('Loading VPU_13')).toBeInTheDocument();
    expect(spinner(container)).toBeInTheDocument();
  });

  it('keeps spinning once the load actually starts', () => {
    useTimeSeriesStore.setState({ loadingText: 'Loading VPU_13', pending: false, loading: true });

    const { container } = render(<LoadStatus />);

    expect(spinner(container)).toBeInTheDocument();
  });

  it('does not spin beside a message that is an answer, not progress', () => {
    // "No flow data for cat-1" is a finished load that found nothing. A spinner there says the
    // app is still trying.
    useTimeSeriesStore.setState({
      loadingText: 'No flow data for cat-1', pending: false, loading: false,
    });

    const { container } = render(<LoadStatus />);

    expect(spinner(container)).not.toBeInTheDocument();
  });

  it('does not spin beside a failure', () => {
    useTimeSeriesStore.setState({
      loadingText: 'Failed to load timeseries for id: cat-1',
      pending: true,
      last_error: { kind: 'timeseries' },
    });

    const { container } = render(<LoadStatus />);

    expect(spinner(container)).not.toBeInTheDocument();
  });
});

describe('the bar across the top of the map', () => {
  it('shows from the click, before the load has started', () => {
    useTimeSeriesStore.setState({ pending: true, loading: false });

    const { container } = render(<LoadProgress />);

    expect(container.firstChild).toBeInTheDocument();
  });

  it('shows while a load runs', () => {
    useTimeSeriesStore.setState({ loading: true });

    const { container } = render(<LoadProgress />);

    expect(container.firstChild).toBeInTheDocument();
  });

  it('shows while the search index builds, which takes about seven seconds', () => {
    useDataStreamStore.setState({ index_status: 'loading' });

    const { container } = render(<LoadProgress />);

    expect(container.firstChild).toBeInTheDocument();
  });

  it('shows nothing when idle, so it costs no space', () => {
    // index_status starts as 'loading' because the index really does load on boot, so idle has
    // to be stated rather than assumed.
    useDataStreamStore.setState({ index_status: 'ready' });

    const { container } = render(<LoadProgress />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stops on a failure rather than claiming the app is still trying', () => {
    useDataStreamStore.setState({ index_status: 'ready' });
    useTimeSeriesStore.setState({ pending: true, last_error: { kind: 'vpu' } });

    const { container } = render(<LoadProgress />);

    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden from screen readers, which have the status strip', () => {
    useTimeSeriesStore.setState({ loading: true });

    const { container } = render(<LoadProgress />);

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('retiring the promise', () => {
  const { beginLoading, endLoading, resetLoadState } = require('features/DataStream/actions/loadState');

  beforeEach(() => resetLoadState());

  it('clears pending when the work it promised finishes', () => {
    useTimeSeriesStore.setState({ pending: true });

    beginLoading();
    endLoading();

    expect(useTimeSeriesStore.getState().pending).toBe(false);
    expect(useTimeSeriesStore.getState().loading).toBe(false);
  });

  it('holds until the last of several loads finishes', () => {
    useTimeSeriesStore.setState({ pending: true });

    beginLoading();
    beginLoading();
    endLoading();

    expect(useTimeSeriesStore.getState().pending).toBe(true);

    endLoading();
    expect(useTimeSeriesStore.getState().pending).toBe(false);
  });
});
