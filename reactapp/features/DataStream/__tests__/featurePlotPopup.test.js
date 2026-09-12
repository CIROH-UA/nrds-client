/**
 * The chart lives on the feature now: an anchored popup on desktop, headed by a compact subset of
 * the feature's attributes, with the chart's own loading, empty and error states inside it.
 *
 * The surface opens on selected_feature -- written synchronously when the map is clicked -- not on
 * the timeseries feature_id, which is written only once loadTimeseries runs. A cross-vpu selection
 * waits for Update before it loads, so gating on feature_id would leave the click with no feedback;
 * gating on selected_feature shows the header the moment the feature is picked.
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { useFeatureStore } from 'features/DataStream/store/Layers';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';

/* eslint-disable react/prop-types -- a test stand-in for react-map-gl's Popup, not a component. */
jest.mock('react-map-gl/maplibre', () => ({
  Popup: function Popup({ children, onClose }) {
    return (
      <div data-testid="popup">
        <button type="button" aria-label="Close popup" onClick={onClose}>close</button>
        {children}
      </div>
    );
  },
}));

let matches = false;
beforeAll(() => {
  window.matchMedia = (query) => ({
    get matches() { return matches; },
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

const { SelectedFeaturePopup } = require('features/DataStream/components/map/SelectedFeaturePopup');

const PLACED = { _id: 'cat-2884494', lat: 40.8, lon: -111.5, area_km2: 12.1 };

const initial = { fs: useFeatureStore.getState(), ts: useTimeSeriesStore.getState() };
beforeEach(() => {
  useFeatureStore.setState(initial.fs, true);
  useTimeSeriesStore.setState(initial.ts, true);
  matches = false;
});

/* eslint-disable testing-library/no-container, testing-library/no-node-access --
   the chart's only signal that it drew is its svg geometry, which exposes no role or text. */

describe('the chart on the selected feature (desktop popup)', () => {
  it('draws the header above the chart', () => {
    useFeatureStore.setState({ selected_feature: PLACED });
    useTimeSeriesStore.setState({ feature_id: 'cat-2884494', variable: 'flow' });

    render(<SelectedFeaturePopup />);

    expect(screen.getByText('cat-2884494')).toBeInTheDocument();
    expect(screen.getByText('Area Km2')).toBeInTheDocument();
  });

  it('charts the series once it is loaded', () => {
    useFeatureStore.setState({ selected_feature: PLACED });
    useTimeSeriesStore.setState({
      feature_id: 'cat-2884494',
      variable: 'flow',
      loading: false,
      last_answered_key: 'k|flow|cat-2884494',
      series: [
        { x: new Date('2022-08-01T00:00:00Z'), y: 1.5 },
        { x: new Date('2022-08-01T01:00:00Z'), y: 2.5 },
      ],
    });

    const { container } = render(<SelectedFeaturePopup />);

    const paths = [...container.querySelectorAll('path')].filter((p) => p.getAttribute('d'));
    expect(paths.length).toBeGreaterThan(0);
  });

  it('shows a loading affordance while the series fetches, header already present', () => {
    useFeatureStore.setState({ selected_feature: PLACED });
    useTimeSeriesStore.setState({ feature_id: 'cat-2884494', variable: 'flow', loading: true, series: [] });

    render(<SelectedFeaturePopup />);

    expect(screen.getByText('cat-2884494')).toBeInTheDocument();
    expect(screen.getByText(/loading the timeseries/i)).toBeInTheDocument();
  });

  it('states plainly when the feature has no series, rather than drawing an empty frame', () => {
    useFeatureStore.setState({ selected_feature: PLACED });
    useTimeSeriesStore.setState({
      feature_id: 'cat-2884494',
      variable: 'flow',
      loading: false,
      series: [],
      last_answered_key: 'k|flow|cat-2884494',
    });

    render(<SelectedFeaturePopup />);

    expect(screen.getByText(/no data to chart for cat-2884494/i)).toBeInTheDocument();
  });

  it('settles to the empty state after dismissing a failed load, not an endless spinner', () => {
    useFeatureStore.setState({ selected_feature: PLACED });
    useTimeSeriesStore.setState({
      feature_id: 'cat-2884494',
      variable: 'flow',
      loading: false,
      pending: false,
      series: [],
      last_error: { kind: 'timeseries', featureId: 'cat-2884494' },
      last_answered_key: 'k|flow|cat-2884494',
    });

    render(<SelectedFeaturePopup />);

    expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(useTimeSeriesStore.getState().last_error).toBeNull();
    expect(screen.queryByText(/loading the timeseries/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no data to chart for cat-2884494/i)).toBeInTheDocument();
  });

  it('names a no-output-file selection plainly, not as a load failure', () => {
    useFeatureStore.setState({ selected_feature: PLACED });
    useTimeSeriesStore.setState({
      feature_id: 'cat-2884494',
      variable: 'flow',
      loading: false,
      series: [],
      last_error: { kind: 'no-output-file' },
    });

    render(<SelectedFeaturePopup />);

    expect(screen.getByRole('alert')).toHaveTextContent(/no output file for this selection/i);
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it('reopens when the same catchment is clicked again after closing', () => {
    useFeatureStore.setState({ selected_feature: PLACED });
    useTimeSeriesStore.setState({ feature_id: 'cat-2884494' });

    const { rerender } = render(<SelectedFeaturePopup />);
    expect(screen.getByTestId('popup')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close popup/i }));
    expect(useFeatureStore.getState().selected_feature).toBeNull();

    rerender(<SelectedFeaturePopup />);
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();

    useFeatureStore.getState().set_selected_feature(PLACED);
    rerender(<SelectedFeaturePopup />);
    expect(screen.getByTestId('popup')).toBeInTheDocument();
  });

  it('opens with its header for a cross-vpu selection, before Update loads the series', () => {
    useFeatureStore.setState({ selected_feature: PLACED });
    useTimeSeriesStore.setState({ feature_id: null });

    render(<SelectedFeaturePopup />);

    expect(screen.getByTestId('popup')).toBeInTheDocument();
    expect(screen.getByText('cat-2884494')).toBeInTheDocument();
  });

  it('renders a single surface for the feature, not a duplicate panel', () => {
    useFeatureStore.setState({ selected_feature: PLACED });
    useTimeSeriesStore.setState({ feature_id: 'cat-2884494' });

    render(<SelectedFeaturePopup />);

    expect(screen.getAllByTestId('popup')).toHaveLength(1);
  });
});
