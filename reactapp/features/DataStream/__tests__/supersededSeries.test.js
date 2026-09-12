/**
 * A selection superseded before its data arrives must not draw a stale series.
 *
 * loadTimeseries takes a ticket from a shared sequence and checks, after each await, that its
 * ticket is still the current one. Click one feature, then another before the first's rows return,
 * and the first load must find itself superseded and write nothing -- otherwise the second feature
 * would be described by the first feature's hydrograph.
 */
jest.mock('features/DataStream/lib/queryData', () => ({
  checkForTable: jest.fn(),
  getTimeseries: jest.fn(),
}));
jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));

const queryData = require('features/DataStream/lib/queryData');
const { loadTimeseries } = require('features/DataStream/actions/loadTimeseries');
const { resetLoadState } = require('features/DataStream/actions/loadState');
const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;
const useDataStreamStore = require('features/DataStream/store/Datastream').default;

const initial = { ts: useTimeSeriesStore.getState(), ds: useDataStreamStore.getState() };
beforeEach(() => {
  resetLoadState();
  useTimeSeriesStore.setState(initial.ts, true);
  useDataStreamStore.setState(initial.ds, true);
  useDataStreamStore.setState({ cache_key: 'k.parquet', forecast: 'short_range', variables: ['flow'] });
  queryData.checkForTable.mockResolvedValue(true);
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it('the superseded load writes nothing; the current one wins', async () => {
  let releaseFirst;
  queryData.getTimeseries
    .mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve; }))
    .mockResolvedValueOnce([{ time: '2026-08-20T00:00:00Z', flow: 9 }]);

  const first = loadTimeseries({ featureId: 'cat-1', variable: 'flow' });
  await flush();
  await loadTimeseries({ featureId: 'cat-2', variable: 'flow' });

  expect(useTimeSeriesStore.getState().feature_id).toBe('cat-2');
  expect(useTimeSeriesStore.getState().series.map((p) => p.y)).toEqual([9]);

  releaseFirst([{ time: '2026-08-20T00:00:00Z', flow: 1 }]);
  await first;

  expect(useTimeSeriesStore.getState().feature_id).toBe('cat-2');
  expect(useTimeSeriesStore.getState().series.map((p) => p.y)).toEqual([9]);
});
