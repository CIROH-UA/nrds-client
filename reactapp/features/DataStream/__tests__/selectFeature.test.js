/**
 * The map's click handler had no tests, because reaching it means rendering the map and this
 * jest setup cannot parse maplibre's esm. The decision the handler makes is now a function, so
 * it can be both tested and called without a canvas.
 */
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useFeatureStore } from 'features/DataStream/store/Layers';

jest.mock('features/DataStream/actions/loadTimeseries', () => ({ loadTimeseries: jest.fn() }));

const { loadTimeseries } = require('features/DataStream/actions/loadTimeseries');
const { selectMapFeature } = require('features/DataStream/actions/selectFeature');

const initial = {
  ds: useDataStreamStore.getState(),
  ts: useTimeSeriesStore.getState(),
  fs: useFeatureStore.getState(),
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
  loadTimeseries.mockResolvedValue(undefined);
});

describe('selectMapFeature', () => {
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

    selectMapFeature(divide(), 'divides');

    expect(loadTimeseries).toHaveBeenCalledWith({ featureId: 'cat-42' });
  });

  it('only switches vpu when the feature belongs to another one', () => {
    useDataStreamStore.setState({ vpu: 'VPU_09' });

    selectMapFeature(divide(), 'divides');

    // Charting waits for the new dataset; that load's closing call picks the selection up.
    expect(loadTimeseries).not.toHaveBeenCalled();
    expect(useDataStreamStore.getState().vpu).toBe('VPU_01');
  });

  it('reads the id property that matches the layer', () => {
    useDataStreamStore.setState({ vpu: 'VPU_01' });
    const nexus = {
      layer: { id: 'nexus-points' },
      geometry: { type: 'Point', coordinates: [-97, 41] },
      properties: { id: 'nex-7', divide_id: 'cat-should-be-ignored', vpuid: '01' },
    };

    expect(selectMapFeature(nexus, 'nexus-points')).toBe('nex-7');
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
