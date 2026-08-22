/**
 * Deleting a cached file drops its duckdb table, and nothing outside the cache store knew it
 * had gone. Clicking a catchment in the same vpu went straight to getTimeseries and queried a
 * table that no longer existed, which surfaced as a raw catalog error:
 *
 *   Catalog Error: Table with name cfe_nom_..._VPU_16_troute_output_... does not exist!
 *
 * and after that nothing loaded at all. The guard that remains is the series load rebuilding the
 * vpu when its table is missing. The other half of this file used to cover the cache delete
 * forgetting what was derived from it; there is no cache to delete from now, and a table can
 * still be absent -- a fresh tab, a superseded load -- so the rebuild is what still matters.
 */
jest.mock('features/DataStream/lib/queryData', () => ({
  checkForTable: jest.fn(),
  getTimeseries: jest.fn(),
  dropAllVpuDataTables: jest.fn(),
}));
jest.mock('features/DataStream/lib/duckdbClient', () => ({ terminateDatabase: jest.fn() }));
jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));

const queryData = require('features/DataStream/lib/queryData');
const { loadVpu } = require('features/DataStream/actions/loadVpu');
const { loadTimeseries } = require('features/DataStream/actions/loadTimeseries');
const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;
const useDataStreamStore = require('features/DataStream/store/Datastream').default;
const { useVPUStore } = require('features/DataStream/store/Layers');

const KEY = 'cfe_nom_ngen_20260819_short_range_00_VPU_16_troute_output.parquet';
const initial = {
  ts: useTimeSeriesStore.getState(),
  ds: useDataStreamStore.getState(),
  vpu: useVPUStore.getState(),
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useDataStreamStore.setState(initial.ds, true);
  useVPUStore.setState(initial.vpu, true);
  useDataStreamStore.setState({ cache_key: KEY, variables: ['flow'] });
  useTimeSeriesStore.setState({ feature_id: 'cat-2884494', variable: 'flow' });
  queryData.getTimeseries.mockResolvedValue([{ time: '2022-08-01T00:00:00Z', flow: 1 }]);
  require('features/DataStream/lib/duckdbClient').terminateDatabase.mockResolvedValue(undefined);
});

describe('clicking a catchment whose table is not there', () => {
  test('rebuilds the vpu rather than querying a table that is gone', async () => {
    queryData.checkForTable.mockResolvedValue(false);

    await loadTimeseries({ featureId: 'cat-2884494' });

    expect(loadVpu).toHaveBeenCalledTimes(1);
    expect(queryData.getTimeseries).not.toHaveBeenCalled();
  });

  test('queries directly when the table is still registered', async () => {
    queryData.checkForTable.mockResolvedValue(true);

    await loadTimeseries({ featureId: 'cat-2884494' });

    expect(loadVpu).not.toHaveBeenCalled();
    expect(queryData.getTimeseries).toHaveBeenCalledWith('2884494', KEY, 'flow');
  });

  test('does not recurse: the call loadVpu makes goes straight to the query', async () => {
    // loadVpu creates the table before charting, and passes its generation to say so.
    queryData.checkForTable.mockResolvedValue(false);

    await loadTimeseries({ featureId: 'cat-2884494', vpuGeneration: 1 });

    expect(loadVpu).not.toHaveBeenCalled();
    expect(queryData.getTimeseries).toHaveBeenCalled();
  });

  test('clears last_loaded_key, so the same feature is not treated as already charted', async () => {
    queryData.checkForTable.mockResolvedValue(false);
    useTimeSeriesStore.setState({ last_loaded_key: `${KEY}|flow|cat-2884494` });

    await loadTimeseries({ featureId: 'cat-2884494' });

    expect(useTimeSeriesStore.getState().last_loaded_key).toBeNull();
  });
});

