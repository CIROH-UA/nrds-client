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
/**
 * Testing Library is imported here, at module scope, and not required inside a describe.
 *
 * Its auto-cleanup registers an afterEach when the module first loads. Required from inside a
 * describe callback, that registration lands in whichever block happens to be executing, so
 * every hook and component rendered by the other blocks stayed mounted for the rest of the
 * file -- and their store subscriptions kept firing. It showed up as a flyTo being called four
 * times for two selections, one for each hook that should have been torn down.
 */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';

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
   * It has been three things. A button floating over the map, which read as unrelated to
   * anything and landed under the side panel. Then text in the link colour that underlined on
   * hover, which is the affordance for going somewhere when this only moves the map. Then a
   * full-width bordered button between the title and the chart, which put a utility action in
   * the most prominent position in the panel.
   *
   * It is an icon in the title row now, beside the other two controls that act on the selection
   * as a whole, where it costs no vertical space and no reading order.
   */
  it('is an icon in the title row, not a block above the chart', () => {
    const fs = require('fs');
    const path = require('path');
    const header = fs.readFileSync(
      path.join(__dirname, '../components/forecast/ForecastHeader.js'), 'utf8'
    );
    const row = header.slice(header.indexOf('<Row>'), header.indexOf('</Row>'));

    // Inside the row, with the info toggle and the close button.
    expect(row).toMatch(/<IoLocateOutline/);
    expect(header).not.toMatch(/GhostButton/);
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

/**
 * Selecting a feature moves the map to it.
 *
 * This had no test, which is why it stopped working without anyone noticing. The effect that did
 * it was keyed on a useCallback with an empty dependency array, making the callback stable for
 * the life of the map component, so it ran once on mount and never again.
 *
 * A click hid the breakage: the map is already where the feature is, because that is where the
 * reader clicked. Only the search box, which can select something a state away, showed it -- and
 * that is the path that had no coverage.
 */
describe('moving the map when the selection changes', () => {
  const { useShowSelectionOnChange } = require('features/DataStream/actions/showSelection');
  const { setMapHandle } = require('features/DataStream/lib/mapHandle');
  const { useFeatureStore } = require('features/DataStream/store/Layers');

  const start = useFeatureStore.getState();
  let map;

  beforeEach(() => {
    useFeatureStore.setState(start, true);
    map = { flyTo: jest.fn() };
    setMapHandle(map);
  });

  afterEach(() => setMapHandle(null));

  const select = (feature) => {
    act(() => useFeatureStore.setState({ selected_feature: feature }));
  };

  it('flies to a feature selected after mount', () => {
    // The search path: nothing selected when the map mounts, then a hit somewhere else entirely.
    renderHook(() => useShowSelectionOnChange());
    expect(map.flyTo).not.toHaveBeenCalled();

    select({ _id: 'cat-1', lat: 40, lon: -111 });

    expect(map.flyTo).toHaveBeenCalledTimes(1);
    expect(map.flyTo.mock.calls[0][0].center).toEqual([-111, 40]);
  });

  it('flies again for the next feature, which is the part that broke', () => {
    // A stable callback fires once and never again. Two selections, two moves.
    renderHook(() => useShowSelectionOnChange());
    select({ _id: 'cat-1', lat: 40, lon: -111 });
    select({ _id: 'cat-2', lat: 41, lon: -112 });

    expect(map.flyTo).toHaveBeenCalledTimes(2);
    expect(map.flyTo.mock.calls[1][0].center).toEqual([-112, 41]);
  });

  it('does nothing while nothing is selected', () => {
    renderHook(() => useShowSelectionOnChange());

    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('does not move the map again on an unrelated re-render', () => {
    // Panning and playback re-render the map constantly; a fly on each would fight the reader.
    const { rerender } = renderHook(() => useShowSelectionOnChange());
    select({ _id: 'cat-1', lat: 40, lon: -111 });

    rerender();
    rerender();

    expect(map.flyTo).toHaveBeenCalledTimes(1);
  });
});

/**
 * The handle does not outlive the map it points at.
 *
 * Its docstring promised the map is cleared on unload, and nothing cleared it. A stale handle is
 * worse than none: getMapHandle answers truthfully-looking, and flyTo on a map whose canvas has
 * been removed throws from inside maplibre rather than returning the false the caller checks.
 */
describe('releaseMapHandle', () => {
  const { setMapHandle, getMapHandle, releaseMapHandle } = require('features/DataStream/lib/mapHandle');

  afterEach(() => setMapHandle(null));

  it('lets go of the map it was given', () => {
    const map = { flyTo: jest.fn() };
    setMapHandle(map);

    releaseMapHandle(map);

    expect(getMapHandle()).toBeNull();
  });

  it('leaves a newer map alone', () => {
    // Strict-mode double-mounting runs the first map's cleanup after the second has registered.
    const first = { flyTo: jest.fn() };
    const second = { flyTo: jest.fn() };
    setMapHandle(first);
    setMapHandle(second);

    releaseMapHandle(first);

    expect(getMapHandle()).toBe(second);
  });
});
