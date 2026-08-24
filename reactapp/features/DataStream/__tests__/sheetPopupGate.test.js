/**
 * When the map popup gives way to the sheet.
 *
 * Below the sheet breakpoint the panel names the selected feature in its header and lists the
 * same fields under Feature Information, so a popup for that same feature is a third copy sitting
 * on the strip of map the sheet left visible. It is suppressed there and only there.
 *
 * The two facts the gate needs live in different stores and arrive at different times.
 * selected_feature is written synchronously on tap; feature_id is written inside loadTimeseries,
 * which a cross-vpu tap only reaches after the whole loadVpu chain, and which the no-output and
 * vpu-missing paths never reach at all. Asking "is anything charted" therefore suppressed the
 * popup for a feature the sheet was not showing, which is every selection after the first.
 */
import { render, screen } from '@testing-library/react';

import { useFeatureStore } from 'features/DataStream/store/Layers';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';

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
});

describe('on a sheet viewport', () => {
  it('suppresses the popup when the sheet is charting this feature', () => {
    matches = true;
    useFeatureStore.setState({ selected_feature: FEATURE });
    useTimeSeriesStore.setState({ feature_id: 'cat-1' });

    render(<SelectedFeaturePopup />);

    expect(showing()).toBe(false);
  });

  it('shows the popup while nothing is charted yet', () => {
    // The first tap: selected_feature is set, feature_id has not been written.
    matches = true;
    useFeatureStore.setState({ selected_feature: FEATURE });
    useTimeSeriesStore.setState({ feature_id: null });

    render(<SelectedFeaturePopup />);

    expect(showing()).toBe(true);
  });

  it('shows the popup when the sheet is charting a different feature', () => {
    // A cross-vpu tap, or one the no-output path abandoned: feature_id still names the previous
    // feature, so "is anything charted" was true and the new tap got no feedback at all.
    matches = true;
    useFeatureStore.setState({ selected_feature: FEATURE });
    useTimeSeriesStore.setState({ feature_id: 'cat-999' });

    render(<SelectedFeaturePopup />);

    expect(showing()).toBe(true);
  });
});
