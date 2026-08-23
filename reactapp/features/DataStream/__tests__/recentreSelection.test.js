/**
 * Getting back to the selected catchment.
 *
 * Selecting one flies the map to it, but nothing brought the reader back: zoom out to look at
 * the wider network and the highlighted catchment is a few pixels somewhere, with the chart
 * beside it still describing it.
 *
 * The coordinate lookup is the testable part and the part that was wrong twice. The button that
 * calls it is in Mapg, which no test here mounts -- constructing a maplibregl.Map asks the canvas
 * for a WebGL context jsdom does not provide.
 */
import { selectionLngLat } from 'features/DataStream/lib/layers';

describe('selectionLngLat', () => {
  it('reads the spelling a map click produces', () => {
    // selectMapFeature flattens the centroid into latitude/longitude.
    expect(selectionLngLat({ latitude: 40.1, longitude: -111.9 })).toEqual([-111.9, 40.1]);
  });

  it('reads the spelling the hydrofabric index produces', () => {
    // The search box gets lat/lon from the index row instead.
    expect(selectionLngLat({ lat: 40.1, lon: -111.9 })).toEqual([-111.9, 40.1]);
  });

  it('prefers the short spelling when a feature somehow carries both', () => {
    expect(selectionLngLat({ lat: 1, lon: 2, latitude: 9, longitude: 9 })).toEqual([2, 1]);
  });

  it('keeps a real zero rather than falling through to the other spelling', () => {
    // ?? not ||. A catchment on the equator or the prime meridian is a real place, and || would
    // read its coordinate as missing and reach for a field that is not there.
    expect(selectionLngLat({ lat: 0, lon: 0 })).toEqual([0, 0]);
    expect(selectionLngLat({ latitude: 0, longitude: -75 })).toEqual([-75, 0]);
  });

  it('returns null for a feature it cannot place', () => {
    // Not a pair of undefineds: flying to those lands the map at 0,0 in the Gulf of Guinea, with
    // nothing on screen to explain why. The caller renders no button instead.
    expect(selectionLngLat({})).toBeNull();
    expect(selectionLngLat(null)).toBeNull();
    expect(selectionLngLat(undefined)).toBeNull();
    expect(selectionLngLat({ lat: 40 })).toBeNull();
    expect(selectionLngLat({ lat: 'forty', lon: -111 })).toBeNull();
    expect(selectionLngLat({ lat: NaN, lon: -111 })).toBeNull();
  });
});

/**
 * Putting the selection back on screen.
 *
 * The control started as a button floating over the map, which put it nowhere near the thing it
 * relates to and, on its first outing, underneath the side panel. It sits in the feature panel
 * now, under the chart it belongs to, which also makes it a component that can be rendered.
 */
describe('showSelection', () => {
  const { showSelection, SELECTION_ZOOM } = require('features/DataStream/actions/showSelection');
  const { setMapHandle } = require('features/DataStream/lib/mapHandle');
  const { useFeatureStore } = require('features/DataStream/store/Layers');

  const initial = useFeatureStore.getState();
  let map;

  beforeEach(() => {
    useFeatureStore.setState(initial, true);
    map = { flyTo: jest.fn() };
    setMapHandle(map);
  });

  afterEach(() => setMapHandle(null));

  it('flies to the selected feature', () => {
    useFeatureStore.setState({ selected_feature: { _id: 'cat-1', lat: 40.8, lon: -111.5 } });

    expect(showSelection()).toBe(true);
    expect(map.flyTo).toHaveBeenCalledWith({
      center: [-111.5, 40.8],
      zoom: SELECTION_ZOOM,
      essential: true,
    });
  });

  it('returns at a zoom where the catchment is actually drawn', () => {
    // The fill only reaches full opacity at 11. Returning at whatever zoom the reader drifted to
    // would centre them on a highlight they still could not see.
    expect(SELECTION_ZOOM).toBe(11);
  });

  it('keeps moving for a reader who asked for less motion', () => {
    // essential:true. Without it maplibre skips the move under prefers-reduced-motion and the
    // press does nothing at all, which is worse than the animation.
    useFeatureStore.setState({ selected_feature: { _id: 'cat-1', lat: 40, lon: -111 } });

    showSelection();

    expect(map.flyTo.mock.calls[0][0].essential).toBe(true);
  });

  it('does nothing when nothing is selected', () => {
    expect(showSelection()).toBe(false);
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('does nothing for a feature it cannot place', () => {
    useFeatureStore.setState({ selected_feature: { _id: 'cat-1' } });

    expect(showSelection()).toBe(false);
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('does nothing before the map exists', () => {
    setMapHandle(null);
    useFeatureStore.setState({ selected_feature: { _id: 'cat-1', lat: 40, lon: -111 } });

    expect(showSelection()).toBe(false);
  });
});

describe('the control in the feature panel', () => {
  const { render, screen, fireEvent } = require('@testing-library/react');
  const { ForecastHeader } = require('features/DataStream/components/forecast/ForecastHeader');
  const { setMapHandle } = require('features/DataStream/lib/mapHandle');
  const { useFeatureStore } = require('features/DataStream/store/Layers');

  const initial = useFeatureStore.getState();
  let map;

  beforeEach(() => {
    useFeatureStore.setState(initial, true);
    map = { flyTo: jest.fn() };
    setMapHandle(map);
  });

  afterEach(() => setMapHandle(null));

  it('sits beside the chart it relates to', () => {
    render(<ForecastHeader title="Cat 2859355" onClick={() => {}} />);

    expect(screen.getByRole('button', { name: /zoom to catchment/i })).toBeInTheDocument();
  });

  it('moves the map when pressed', () => {
    useFeatureStore.setState({ selected_feature: { _id: 'cat-1', lat: 40, lon: -111 } });
    render(<ForecastHeader title="Cat 1" onClick={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /zoom to catchment/i }));

    expect(map.flyTo).toHaveBeenCalled();
  });

  /**
   * It was text in the link colour that underlined on hover, which is the affordance for going
   * somewhere. This moves the map: it is an action, and borrowing a link's clothes is why it did
   * not read as pressable.
   */
  it('is a button, not something dressed as a link', () => {
    const fs = require('fs');
    const path = require('path');
    const styles = fs.readFileSync(
      path.join(__dirname, '../components/styles/Styles.js'), 'utf8'
    );
    const i = styles.indexOf('export const GhostButton');
    const decl = styles.slice(i, styles.indexOf('\n`;', i));

    expect(decl).not.toMatch(/text-decoration/);
    expect(decl).not.toMatch(/color: var\(--link-color\)/);
    expect(decl).toMatch(/border: 1px solid/);
    expect(decl).toMatch(/min-height: 44px/);
  });

  it('says what it does rather than what is already true', () => {
    // "Show on map" describes a state the reader can already see: the catchment is on the map,
    // that is where they clicked it.
    render(<ForecastHeader title="Cat 1" onClick={() => {}} />);

    expect(screen.queryByRole('button', { name: /show on map/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom to catchment/i })).toBeInTheDocument();
  });

  it('does not crowd out the button that clears the selection', () => {
    render(<ForecastHeader title="Cat 1" onClick={() => {}} />);

    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
  });
});
