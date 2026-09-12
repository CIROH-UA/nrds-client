/**
 * When the map popup gives way to the sheet.
 *
 * The anchored popup now hosts the chart, and on the sheet layout the bottom sheet is the chart
 * host instead. A popup there would put a second copy of the same feature on the strip of map the
 * sheet leaves visible -- and the time slider was moved up into exactly that strip. So the popup is
 * desktop-only: below the sheet breakpoint it does not render at all, whatever is selected or
 * charted. Above it, it always renders for a placeable selection -- it opens on selected_feature
 * (written on click), not on the timeseries feature_id (written only once loadTimeseries runs), so
 * a cross-vpu tap that waits for Update still gets its header and a loading chart at once.
 */
import { render, screen } from '@testing-library/react';

import { useFeatureStore } from 'features/DataStream/store/Layers';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';

/* eslint-disable react/prop-types -- a test stand-in for react-map-gl's Popup, not a component. */
jest.mock('react-map-gl/maplibre', () => ({
  Popup: function Popup({ children }) {
    return <div data-testid="popup">{children}</div>;
  },
}));

let matches = false;
beforeAll(() => {
  // A getter, not a snapshot: createMediaQuery memoizes one MediaQueryList per matchMedia
  // identity, so a plain value would freeze at whatever the first test set.
  window.matchMedia = (query) => ({
    get matches() { return matches; },
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

const { SelectedFeaturePopup } = require('features/DataStream/components/map/SelectedFeaturePopup');

const FEATURE = { _id: 'cat-1', lat: 40, lon: -111, divide_id: 'cat-1', toid: 'nex-1' };

const initial = { fs: useFeatureStore.getState(), ts: useTimeSeriesStore.getState() };
beforeEach(() => {
  useFeatureStore.setState(initial.fs, true);
  useTimeSeriesStore.setState(initial.ts, true);
  matches = false;
});

const showing = () => screen.queryByTestId('popup') !== null;

describe('on a wide viewport', () => {
  it('shows the popup even while the same feature is charted', () => {
    matches = false;
    useFeatureStore.setState({ selected_feature: FEATURE });
    useTimeSeriesStore.setState({ feature_id: 'cat-1' });

    render(<SelectedFeaturePopup />);

    expect(showing()).toBe(true);
  });

  it('shows the popup for a selection whose series has not loaded yet', () => {
    // Opened on selected_feature: a cross-vpu tap sets it synchronously, before feature_id.
    matches = false;
    useFeatureStore.setState({ selected_feature: FEATURE });
    useTimeSeriesStore.setState({ feature_id: null });

    render(<SelectedFeaturePopup />);

    expect(showing()).toBe(true);
  });
});

describe('on a sheet viewport', () => {
  it('suppresses the popup while the sheet is charting this feature', () => {
    matches = true;
    useFeatureStore.setState({ selected_feature: FEATURE });
    useTimeSeriesStore.setState({ feature_id: 'cat-1' });

    render(<SelectedFeaturePopup />);

    expect(showing()).toBe(false);
  });

  it('suppresses the popup even before anything is charted, since the sheet is the host', () => {
    // No second copy on the strip of map the sheet leaves visible, whatever the load state.
    matches = true;
    useFeatureStore.setState({ selected_feature: FEATURE });
    useTimeSeriesStore.setState({ feature_id: null });

    render(<SelectedFeaturePopup />);

    expect(showing()).toBe(false);
  });

  it('suppresses the popup when a different feature is charted', () => {
    matches = true;
    useFeatureStore.setState({ selected_feature: FEATURE });
    useTimeSeriesStore.setState({ feature_id: 'cat-999' });

    render(<SelectedFeaturePopup />);

    expect(showing()).toBe(false);
  });
});
