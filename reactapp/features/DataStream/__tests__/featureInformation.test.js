/**
 * What the selected feature says about itself, and where it says it.
 *
 * This was a block at the bottom of the side panel, below the chart, the data menu and the
 * variables menu -- far enough down to need scrolling, so in practice it went unread. It also
 * repeated the hover popup, and hovering is a toggle that starts off, so the information had two
 * homes and no reliable one. The chart now lives on the map, anchored to the feature it describes,
 * with a compact header of the feature's key attributes above it (desktop). The full field listing
 * is gone; the header is the curated subset.
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { featureFields, curatedFeatureFields } from 'features/DataStream/lib/featureFields';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';

/* eslint-disable react/prop-types -- a test stand-in for react-map-gl's Popup, not a component. */
jest.mock('react-map-gl/maplibre', () => ({
  // The real Popup needs a live map from context. What matters here is what goes inside it and
  // whether it renders at all, so this keeps the props visible and drops the map.
  Popup: function Popup({ children, longitude, latitude, onClose }) {
    return (
      <div data-testid="popup" data-lng={longitude} data-lat={latitude}>
        <button type="button" aria-label="Close popup" onClick={onClose} />
        {children}
      </div>
    );
  },
}));

const { SelectedFeaturePopup } = require('features/DataStream/components/map/SelectedFeaturePopup');

const initial = { fs: useFeatureStore.getState(), ts: useTimeSeriesStore.getState() };
beforeEach(() => {
  useFeatureStore.setState(initial.fs, true);
  useTimeSeriesStore.setState(initial.ts, true);
});

describe('featureFields', () => {
  it('joins the two halves of a position into one row', () => {
    const [first] = featureFields({ lat: 40.80526, lon: -111.544846, _id: 'cat-1' });

    expect(first).toEqual({ label: 'Lat/Long', value: '40.805260, -111.544846' });
  });

  it('reads the spelling a map click produces as well as the index one', () => {
    const [first] = featureFields({ latitude: 40.80526, longitude: -111.544846 });

    expect(first.value).toBe('40.805260, -111.544846');
  });

  it('keeps a coordinate of zero, rather than dropping the row', () => {
    // ?? not ||: the equator and the prime meridian are real places.
    expect(featureFields({ lat: 0, lon: 0 })[0].value).toBe('0.000000, 0.000000');
  });

  it('says yes and no rather than true and false', () => {
    // "Has Flowline: true" reads as a value; "Yes" reads as an answer.
    const fields = featureFields({ has_flowline: true, is_gauged: false });

    expect(fields).toContainEqual({ label: expect.stringMatching(/flowline/i), value: 'Yes' });
    expect(fields).toContainEqual({ label: expect.stringMatching(/gauged/i), value: 'No' });
  });

  it('rounds measurements instead of printing float noise', () => {
    const fields = featureFields({ area_km2: 12.09779739379883 });

    expect(fields[0].value).toBe('12.0978');
  });

  it('drops empty values instead of showing blank cells', () => {
    // The index carries columns that are null for most rows, and a half-empty grid reads as
    // something failing to load.
    const fields = featureFields({ id: 'cat-1', toid: null, order: undefined, note: '' });

    expect(fields.map((f) => f.value)).toEqual(['cat-1']);
  });

  it('has nothing to say about nothing', () => {
    expect(featureFields(null)).toEqual([]);
    expect(featureFields(undefined)).toEqual([]);
  });
});

describe('curatedFeatureFields', () => {
  it('leads with the feature id', () => {
    const [first] = curatedFeatureFields({ _id: 'cat-2862105', area_km2: 12.1 });

    expect(first).toEqual({ label: 'ID', value: 'cat-2862105' });
  });

  it('keeps a couple of key size attributes beside the id', () => {
    const rows = curatedFeatureFields({ _id: 'cat-1', area_km2: 12.09779739379883 });

    expect(rows).toContainEqual({ label: 'ID', value: 'cat-1' });
    expect(rows).toContainEqual({ label: 'Area Km2', value: '12.0978' });
  });

  it('drops the noise the full listing carries, so it stays short above the chart', () => {
    const rows = curatedFeatureFields({
      _id: 'cat-1',
      lat: 40.8,
      lon: -111.5,
      area_km2: 12.1,
      vpuid: '16',
      toid: 'nex-1',
      some_flag: true,
    });

    // Lat/Long, vpuid and arbitrary flags are not part of the compact header.
    expect(rows.map((r) => r.label)).not.toContain('Lat/Long');
    expect(rows.map((r) => r.label)).not.toContain('Vpuid');
    expect(rows.length).toBeLessThanOrEqual(4);
  });

  it('has nothing to say about nothing', () => {
    expect(curatedFeatureFields(null)).toEqual([]);
    expect(curatedFeatureFields(undefined)).toEqual([]);
  });
});

describe('the popup on the map', () => {
  const select = (feature) => useFeatureStore.setState({ selected_feature: feature });

  it('appears at the selected feature, headed by its id', () => {
    select({ _id: 'cat-2862105', lat: 40.80526, lon: -111.544846, vpuid: '16', area_km2: 12.1 });

    render(<SelectedFeaturePopup />);

    const popup = screen.getByTestId('popup');
    expect(popup).toHaveAttribute('data-lng', '-111.544846');
    expect(popup).toHaveAttribute('data-lat', '40.80526');
    expect(screen.getByText('cat-2862105')).toBeInTheDocument();
  });

  it('hosts the chart, not a bare field listing', () => {
    // The full Lat/Long readout belonged to the retired info-only panel; the chart is the point now.
    select({ _id: 'cat-1', lat: 40.80526, lon: -111.544846 });

    render(<SelectedFeaturePopup />);

    expect(screen.queryByText('40.805260, -111.544846')).not.toBeInTheDocument();
    // No feature selected yet on the store => the empty chart prompts for one.
    expect(screen.getByText(/select a catchment/i)).toBeInTheDocument();
  });

  it('shows nothing when nothing is selected', () => {
    const { container } = render(<SelectedFeaturePopup />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing for a feature it cannot place', () => {
    // Flying a popup to 0,0 would put it in the Gulf of Guinea, away from anything on screen.
    select({ _id: 'cat-1', vpuid: '16' });

    const { container } = render(<SelectedFeaturePopup />);

    expect(container).toBeEmptyDOMElement();
  });

  it('closes when dismissed', () => {
    select({ _id: 'cat-1', lat: 40, lon: -111 });
    render(<SelectedFeaturePopup />);

    fireEvent.click(screen.getByRole('button', { name: /close popup/i }));

    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
  });

  it('comes back for a different feature, because that is a new question', () => {
    select({ _id: 'cat-1', lat: 40, lon: -111 });
    const { rerender } = render(<SelectedFeaturePopup />);
    fireEvent.click(screen.getByRole('button', { name: /close popup/i }));

    select({ _id: 'cat-2', lat: 41, lon: -112 });
    rerender(<SelectedFeaturePopup />);

    expect(screen.getByTestId('popup')).toBeInTheDocument();
  });

  it('stays closed for the feature that was dismissed', () => {
    select({ _id: 'cat-1', lat: 40, lon: -111 });
    const { rerender } = render(<SelectedFeaturePopup />);
    fireEvent.click(screen.getByRole('button', { name: /close popup/i }));

    rerender(<SelectedFeaturePopup />);

    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
  });
});
