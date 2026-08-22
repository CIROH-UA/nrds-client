/**
 * The map's click handler had no tests, because reaching it means rendering the map and this
 * jest setup cannot parse maplibre's esm. The decision the handler makes is now a function, so
 * it can be both tested and called without a canvas.
 */
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useFeatureStore, useVPUStore } from 'features/DataStream/store/Layers';

jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));
jest.mock('features/DataStream/actions/loadTimeseries', () => ({ loadTimeseries: jest.fn() }));

const { loadTimeseries } = require('features/DataStream/actions/loadTimeseries');
const { loadVpu } = require('features/DataStream/actions/loadVpu');
const { selectMapFeature } = require('features/DataStream/actions/selectFeature');

const initial = {
  ds: useDataStreamStore.getState(),
  ts: useTimeSeriesStore.getState(),
  fs: useFeatureStore.getState(),
  vpu: useVPUStore.getState(),
};

const divide = (overrides = {}) => ({
  layer: { id: 'divides' },
  geometry: { type: 'Point', coordinates: [-96.5, 40.25] },
  properties: { divide_id: 'cat-42', vpuid: '01', ...overrides },
});

beforeEach(() => {
  useDataStreamStore.setState(initial.ds, true);
  useTimeSeriesStore.setState(initial.ts, true);
  useFeatureStore.setState(initial.fs, true);
  useVPUStore.setState(initial.vpu, true);
  loadTimeseries.mockResolvedValue(undefined);
});

describe('selectMapFeature', () => {
  it('charts nothing when the clicked feature has no id to name it', () => {
    useDataStreamStore.setState({ vpu: 'VPU_01' });
    useTimeSeriesStore.setState({ feature_id: 'cat-999' });

    // loadTimeseries falls back to whatever is in the store, so an unnameable click used to
    // re-chart the previous selection as if it had been clicked again.
    selectMapFeature(divide({ divide_id: undefined }), 'divides');

    expect(loadTimeseries).not.toHaveBeenCalled();
  });

  it('records the clicked feature with its centroid and layer', () => {
    useDataStreamStore.setState({ vpu: 'VPU_01' });

    const id = selectMapFeature(divide(), 'divides');

    expect(id).toBe('cat-42');
    expect(useFeatureStore.getState().selected_feature).toMatchObject({
      _id: 'cat-42',
      layerId: 'divides',
      latitude: 40.25,
      longitude: -96.5,
      vpuid: '01',
    });
  });

  it('charts it when it belongs to the loaded vpu', () => {
    useDataStreamStore.setState({ vpu: 'VPU_01' });
    // A loaded vpu has an animation behind it; without one the click rebuilds instead of
    // charting, which is what a click after the panel's close button has to do.
    useVPUStore.setState({ times: [1, 2, 3] });

    selectMapFeature(divide(), 'divides');

    expect(loadTimeseries).toHaveBeenCalledWith({ featureId: 'cat-42' });
  });

  /**
   * Closing the panel calls resetVPU, which empties the animation arrays and the selected
   * variable while leaving the duckdb table built. A click then found that table and charted
   * straight from it, leaving a plot with no variable selected, no animated reaches and no
   * slider. A vpu load over an existing table skips the download and rebuilds all three.
   */
  it('rebuilds the view when the animation has been closed away', async () => {
    useDataStreamStore.setState({ vpu: 'VPU_01' });
    useVPUStore.setState({ times: [] });

    selectMapFeature(divide(), 'divides');
    await Promise.resolve();
    await Promise.resolve();

    expect(loadTimeseries).not.toHaveBeenCalled();
    expect(loadVpu).toHaveBeenCalled();
  });

  it('only switches vpu when the feature belongs to another one', () => {
    useDataStreamStore.setState({ vpu: 'VPU_09' });

    selectMapFeature(divide(), 'divides');

    // Charting waits for the new dataset; that load's closing call picks the selection up.
    expect(loadTimeseries).not.toHaveBeenCalled();
    expect(useDataStreamStore.getState().vpu).toBe('VPU_01');
  });

  /**
   * The click has to answer for itself before anything it starts can.
   *
   * A click into another vpu only set the vpu; the first message came from loadVpu, which the
   * loader effect reaches only after an S3 round trip. A click inside the current vpu reached
   * loadTimeseries, which asks duckdb whether the table exists before saying anything, and that
   * question queues behind the index build for most of a second after a page load. Both left the
   * screen unchanged long enough for the reader to doubt the click landed.
   */
  it('says what it is loading the moment a catchment in another vpu is clicked', () => {
    useDataStreamStore.setState({ vpu: 'VPU_01' });
    const divide = {
      layer: { id: 'divides' },
      geometry: { type: 'Point', coordinates: [-97, 41] },
      properties: { divide_id: 'cat-7', vpuid: '16' },
    };

    // Synchronous on purpose: read straight after the call, with nothing awaited in between.
    selectMapFeature(divide, 'divides');

    expect(useTimeSeriesStore.getState().loadingText).toBe('Loading VPU_16');
  });

  it('names the feature when the vpu is the one already loaded', () => {
    // The wording matches what loadTimeseries goes on to set, so the message refines instead of
    // flickering between two descriptions of the same wait.
    useDataStreamStore.setState({ vpu: 'VPU_16' });
    const divide = {
      layer: { id: 'divides' },
      geometry: { type: 'Point', coordinates: [-97, 41] },
      properties: { divide_id: 'cat-7', vpuid: '16' },
    };

    selectMapFeature(divide, 'divides');

    expect(useTimeSeriesStore.getState().loadingText).toBe('Loading cat-7');
  });

  it('claims nothing for a click it cannot name', () => {
    useDataStreamStore.setState({ vpu: 'VPU_01' });
    useTimeSeriesStore.setState({ loadingText: '' });
    const unnamed = {
      layer: { id: 'divides' },
      geometry: { type: 'Point', coordinates: [-97, 41] },
      properties: { vpuid: '16' },
    };

    selectMapFeature(unnamed, 'divides');

    expect(useTimeSeriesStore.getState().loadingText).toBe('');
  });

  it('reads the id property that matches the layer', () => {
    // A divide carries both id and divide_id, and only divide_id names the catchment the reader
    // means. This was asserted against a nexus point until that layer was removed.
    useDataStreamStore.setState({ vpu: 'VPU_01' });
    const divide = {
      layer: { id: 'divides' },
      geometry: { type: 'Point', coordinates: [-97, 41] },
      properties: { id: 'wb-should-be-ignored', divide_id: 'cat-7', vpuid: '01' },
    };

    expect(selectMapFeature(divide, 'divides')).toBe('cat-7');
  });

  it('switches vpu but records nothing when no id can be determined', () => {
    useDataStreamStore.setState({ vpu: 'VPU_01' });

    const id = selectMapFeature(divide({ divide_id: undefined }), 'divides');

    // Refused where the decision is made, rather than falling through to the store's dedupe.
    expect(id).toBeUndefined();
    expect(useFeatureStore.getState().selected_feature).toBe(null);
    expect(useDataStreamStore.getState().vpu).toBe('VPU_01');
  });

  it('replaces the selection when a different feature is clicked', () => {
    useDataStreamStore.setState({ vpu: 'VPU_01' });

    selectMapFeature(divide(), 'divides');
    selectMapFeature(divide({ divide_id: 'cat-43' }), 'divides');

    // Keyed on _id: before that, a layer without an `id` property kept the first selection.
    expect(useFeatureStore.getState().selected_feature._id).toBe('cat-43');
  });
});
