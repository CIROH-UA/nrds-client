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
  Popup: function Popup({ children }) {
    return <div data-testid="popup">{children}</div>;
  },
}));

// Desktop: the popup is where the chart lives. matchMedia reports the sheet query as not matching.
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

  it('shows an error affordance with a dismiss when the load failed', () => {
    useFeatureStore.setState({ selected_feature: PLACED });
    useTimeSeriesStore.setState({
      feature_id: 'cat-2884494',
      variable: 'flow',
      loading: false,
      series: [],
      last_error: { kind: 'timeseries', featureId: 'cat-2884494' },
    });

    render(<SelectedFeaturePopup />);

    expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(useTimeSeriesStore.getState().last_error).toBeNull();
  });

  it('opens with its header for a cross-vpu selection, before Update loads the series', () => {
    // The tell-tale: selected_feature is set, feature_id is still null because loadTimeseries has
    // not run. Gating on feature_id would show nothing here.
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
