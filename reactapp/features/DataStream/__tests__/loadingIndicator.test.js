/**
 * One spinner, used everywhere, and messages that are shown whole.
 *
 * The app had two unrelated indicators: a two-ring orbiting animation on the boot screen, built
 * from 163 lines of Sass, and react-bootstrap's border spinner in the header. A third, a
 * blinking text component, was in the tree but imported by nothing.
 */
import { render, screen, waitFor } from '@testing-library/react';

import Spinner from 'features/Tethys/components/loader/Spinner';
import LoadingAnimation from 'features/Tethys/components/loader/LoadingAnimation';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { LoadStatus } from 'features/DataStream/components/status/LoadStatus';

const initial = useTimeSeriesStore.getState();
beforeEach(() => { useTimeSeriesStore.setState(initial, true); });

describe('the shared spinner', () => {
  test('is decorative by default, since whatever uses it already announces itself', () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('announces itself only when it is the announcement', () => {
    render(<Spinner label="Loading NRDS" />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Loading NRDS');
  });

  test('the boot screen draws the same spinner, larger', async () => {
    render(<LoadingAnimation delay={0} />);

    // waitFor, not a nested act: the delay is a real timer, and wrapping render in another act
    // to wait it out leaves React's queue in a state the next test inherits.
    const ring = await waitFor(() => screen.getByRole('status'));
    expect(ring).toHaveAccessibleName('Loading NRDS');
  });

  test('the boot screen shows nothing until its delay elapses', () => {
    // A fast answer from Tethys should not flash an indicator on and off.
    const { container } = render(<LoadingAnimation delay={5000} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('the header status draws it too, without a second role', () => {
    useTimeSeriesStore.setState({ loading: true, loadingText: 'Loading cat-2884494' });
    render(<LoadStatus />);
    // The strip is the live region; the spinner inside it must not be a second one.
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading cat-2884494');
  });
});

describe('status messages', () => {
  test('a not-found message names the feature in full', () => {
    useTimeSeriesStore.setState({
      loading: false,
      loadingText: 'No streamflow data for cat-2854942',
      last_error: { kind: 'timeseries' },
    });
    render(<LoadStatus />);

    // The point of the message is which catchment, so it cannot end in dots.
    expect(screen.getByRole('status')).toHaveTextContent('No streamflow data for cat-2854942');
  });

  test('carries no trailing ellipsis of its own', () => {
    useTimeSeriesStore.setState({ loading: true, loadingText: 'Loading VPU_16' });
    render(<LoadStatus />);
    expect(screen.getByRole('status').textContent).not.toMatch(/\.\.\.|…/);
  });

  test('renders nothing at all when idle, so it costs no space', () => {
    require('features/DataStream/store/Datastream').default.setState({ index_status: 'ready' });
    const { container } = render(<LoadStatus />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('while the id index builds', () => {
  const useDataStreamStore = require('features/DataStream/store/Datastream').default;
  const initialDs = useDataStreamStore.getState();
  beforeEach(() => { useDataStreamStore.setState(initialDs, true); });

  test('the header says so, so the map does not look ready', () => {
    // It takes about seven seconds and blocks nothing else on the map, which is exactly why an
    // idle-looking header reads as "ready".
    useDataStreamStore.setState({ index_status: 'loading' });
    render(<LoadStatus />);

    expect(screen.getByRole('status')).toHaveTextContent('Building the search index');
  });

  test('a real load takes the strip instead, so it says one thing at a time', () => {
    useDataStreamStore.setState({ index_status: 'loading' });
    useTimeSeriesStore.setState({ loading: true, loadingText: 'Loading VPU_16' });
    render(<LoadStatus />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading VPU_16');
    expect(screen.getByRole('status')).not.toHaveTextContent('search index');
  });

  test('it goes quiet once the index is ready', () => {
    useDataStreamStore.setState({ index_status: 'ready' });
    const { container } = render(<LoadStatus />);

    expect(container).toBeEmptyDOMElement();
  });

  test('a failed index is not reported here, since the search box owns that', () => {
    useDataStreamStore.setState({ index_status: 'failed' });
    const { container } = render(<LoadStatus />);

    expect(container).toBeEmptyDOMElement();
  });
});
