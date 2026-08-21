/**
 * The chart could report "no data" for a feature it had not queried yet.
 *
 * last_answered_key was read for truthiness rather than for whose answer it is. A click sets
 * feature_id synchronously and the load then awaits a table check before clearing the series, so
 * in that window the key still holds the previous feature's answer: nothing charted, an answer
 * on record, and the chart concluding this feature has nothing. That is the same wrong statement
 * the key was added to prevent, pointed the other way.
 */
jest.mock('features/DataStream/lib/queryData', () => ({
  checkForTable: jest.fn(),
  getTimeseries: jest.fn(),
  getVariables: jest.fn(),
}));
jest.mock('features/DataStream/lib/duckdbClient', () => ({ getConnection: jest.fn() }));
jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));

const queryData = require('features/DataStream/lib/queryData');
const { loadTimeseries } = require('features/DataStream/actions/loadTimeseries');
const { resetLoadState } = require('features/DataStream/actions/loadState');
const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;
const useDataStreamStore = require('features/DataStream/store/Datastream').default;

const initial = { ts: useTimeSeriesStore.getState(), ds: useDataStreamStore.getState() };

// The condition TimeseriesCard renders from.
const wouldSayNoData = () => {
  const s = useTimeSeriesStore.getState();
  const waiting = s.feature_id && (s.loading || (!s.series.length && !s.last_answered_key && !s.last_error));
  return !!s.feature_id && !waiting && s.series.length === 0;
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useDataStreamStore.setState(initial.ds, true);
  resetLoadState();
  useDataStreamStore.setState({ cache_key: 'vpu.parquet', variables: ['flow'] });
  useTimeSeriesStore.setState({ variable: 'flow' });
});

describe('an answer on record belongs to the feature it answered', () => {
  it('does not become a verdict on the next feature clicked', async () => {
    // The first feature is answered with nothing, so the series is already empty when the next
    // click arrives. That is what makes the stale key decisive rather than harmless.
    queryData.checkForTable.mockResolvedValue(true);
    queryData.getTimeseries.mockResolvedValue([]);
    await loadTimeseries({ featureId: 'cat-1' });
    expect(useTimeSeriesStore.getState().last_answered_key).toBeTruthy();
    expect(useTimeSeriesStore.getState().series).toHaveLength(0);

    // Now a second feature, with the table check left pending: this is the window.
    let releaseCheck;
    queryData.checkForTable.mockImplementation(() => new Promise((r) => { releaseCheck = r; }));
    const second = loadTimeseries({ featureId: 'cat-2' });
    await Promise.resolve();

    expect(useTimeSeriesStore.getState().feature_id).toBe('cat-2');
    expect(wouldSayNoData()).toBe(false);

    releaseCheck(true);
    await second;
  });

  it('still records an answer for the feature that was asked about', async () => {
    queryData.checkForTable.mockResolvedValue(true);
    queryData.getTimeseries.mockResolvedValue([]);

    await loadTimeseries({ featureId: 'cat-1' });

    // A completed load that found nothing is an answer, and the chart may say so.
    expect(useTimeSeriesStore.getState().last_answered_key).toBeTruthy();
    expect(wouldSayNoData()).toBe(true);
  });
});
