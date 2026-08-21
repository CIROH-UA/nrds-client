/**
 * Clearing the cache left the panel open over a plot whose data had just been thrown away.
 *
 * invalidateDerivedState reset the vpu, so the animated flowpaths went, but the panel is open
 * whenever feature_id is set and the map's highlight comes from selected_feature, and neither
 * was touched. The reader was left with a chart of numbers no longer on disk and a catchment
 * outlined as selected with nothing selecting it. Clearing the cache is a start-over, so it
 * resets the selection the same way the panel's own clear control does.
 */
jest.mock('features/DataStream/lib/queryData', () => ({
  dropAllVpuDataTables: jest.fn(),
}));
jest.mock('features/DataStream/lib/opfsCache', () => ({
  clearCache: jest.fn(),
  getFilesFromCache: jest.fn(),
}));
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  terminateDatabase: jest.fn(),
}));

const queryData = require('features/DataStream/lib/queryData');
const opfsCache = require('features/DataStream/lib/opfsCache');
const duckdbClient = require('features/DataStream/lib/duckdbClient');
const { useCacheTablesStore } = require('features/DataStream/store/CacheTables');
const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;
const { useVPUStore, useFeatureStore } = require('features/DataStream/store/Layers');

beforeEach(() => {
  queryData.dropAllVpuDataTables.mockResolvedValue(undefined);
  opfsCache.clearCache.mockResolvedValue(1);
  opfsCache.getFilesFromCache.mockResolvedValue([]);
  duckdbClient.terminateDatabase.mockResolvedValue(undefined);
});

const selectSomething = () => {
  useTimeSeriesStore.setState({
    feature_id: 'cat-2884494',
    layout: { title: 'Cat 2884494 Short Range Forecast' },
    series: [{ x: [1], y: [2] }],
    last_loaded_key: 'key|flow|cat-2884494',
  });
  useFeatureStore.setState({ selected_feature: { _id: 'cat-2884494', vpuid: '16' } });
  useVPUStore.setState({ featureIds: ['cat-2884494'], times: ['2026-08-20T00:00:00Z'] });
};

describe('clearing the cache', () => {
  it('closes the panel, since the panel is open whenever a feature is selected', async () => {
    selectSomething();

    await useCacheTablesStore.getState().clear();

    expect(useTimeSeriesStore.getState().feature_id).toBe(null);
  });

  it('takes the plot with it, rather than charting data that is gone', async () => {
    selectSomething();

    await useCacheTablesStore.getState().clear();

    expect(useTimeSeriesStore.getState().series).toEqual([]);
    // Back to the placeholder title rather than the catchment's, so nothing names a selection.
    expect(useTimeSeriesStore.getState().layout.title).toBe('TimeSeries');
  });

  it('drops the map highlight, so nothing looks selected with no panel', async () => {
    selectSomething();

    await useCacheTablesStore.getState().clear();

    expect(useFeatureStore.getState().selected_feature).toBe(null);
  });

  it('still drops the vpu arrays the animation reads', async () => {
    selectSomething();

    await useCacheTablesStore.getState().clear();

    expect(useVPUStore.getState().featureIds).toEqual([]);
    expect(useVPUStore.getState().times).toEqual([]);
  });
});
