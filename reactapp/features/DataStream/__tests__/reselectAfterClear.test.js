/**
 * Clicking a catchment after clearing the cache opened the panel empty, closed it, and opened
 * it again with the data.
 *
 * The click sets feature_id, which is what opens the panel. loadTimeseries then finds no table,
 * hands off to loadVpu, and loadVpu opened with a full reset of the timeseries store: feature_id
 * went to null and the panel closed mid-load, and the layout went back to its placeholder, which
 * is why the header read "TimeSeries" rather than the catchment. The selection is not stale
 * during the load that was triggered by it, so only the data is cleared now.
 */
jest.mock('features/DataStream/lib/queryData', () => ({
  checkForTable: jest.fn(),
  loadVpuData: jest.fn(),
  getFeatureIDs: jest.fn(),
  getVariables: jest.fn(),
  getDistinctFeatureIds: jest.fn(),
  getDistinctTimes: jest.fn(),
  getVpuVariableFlat: jest.fn(),
}));
jest.mock('features/DataStream/actions/loadTimeseries', () => ({ loadTimeseries: jest.fn() }));
jest.mock('features/DataStream/store/CacheTables', () => ({
  useCacheTablesStore: { getState: () => ({ refresh: jest.fn().mockResolvedValue([]) }) },
}));

const queryData = require('features/DataStream/lib/queryData');
const { loadVpu } = require('features/DataStream/actions/loadVpu');
const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;
const useDataStreamStore = require('features/DataStream/store/Datastream').default;
const { useFeatureStore } = require('features/DataStream/store/Layers');

beforeEach(() => {
  queryData.checkForTable.mockResolvedValue(true);
  queryData.getFeatureIDs.mockResolvedValue(['cat-2862165']);
  queryData.getVariables.mockResolvedValue(['flow']);
  queryData.getDistinctFeatureIds.mockResolvedValue(['cat-2862165']);
  queryData.getDistinctTimes.mockResolvedValue(['2026-08-20T00:00:00Z']);
  queryData.getVpuVariableFlat.mockResolvedValue([1]);
  useDataStreamStore.setState({ cache_key: 'a_key.parquet', vpu: 'VPU_16' });
  useFeatureStore.setState({ selected_feature: { _id: 'cat-2862165', vpuid: '16' } });
});

describe('a vpu load triggered by a catchment click', () => {
  it('keeps the panel open, rather than closing it and opening it again', async () => {
    useTimeSeriesStore.setState({
      feature_id: 'cat-2862165',
      layout: { title: 'Cat 2862165 Short Range Forecast' },
    });
    const seen = [];
    const unsub = useTimeSeriesStore.subscribe((s) => seen.push(s.feature_id));

    await loadVpu();
    unsub();

    // The panel is open whenever this is set, so a null anywhere in here is a closed panel.
    expect(seen).not.toContain(null);
    expect(useTimeSeriesStore.getState().feature_id).toBe('cat-2862165');
  });

  it('keeps naming the catchment instead of falling back to the placeholder title', async () => {
    useTimeSeriesStore.setState({
      feature_id: 'cat-2862165',
      layout: { title: 'Cat 2862165 Short Range Forecast' },
    });

    await loadVpu();

    expect(useTimeSeriesStore.getState().layout.title).toMatch(/2862165/);
  });

  it('still clears the series, so no stale plot is shown against the new table', async () => {
    useTimeSeriesStore.setState({
      feature_id: 'cat-2862165',
      series: [{ x: [1], y: [2] }],
      last_loaded_key: 'stale',
    });

    await loadVpu();

    expect(useTimeSeriesStore.getState().series).toEqual([]);
    expect(useTimeSeriesStore.getState().last_loaded_key).toBe(null);
  });
});
