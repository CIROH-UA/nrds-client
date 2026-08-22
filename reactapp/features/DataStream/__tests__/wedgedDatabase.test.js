/**
 * A catchment click failed completely silently when duckdb was unavailable.
 *
 * loadTimeseries asks whether the table is still there before querying it, and that question
 * sat outside the try that reports failures. Its callers do not await it either, so a rejection
 * from the check became an unhandled one: no message, no error state, nothing on screen changed.
 * The condition is not exotic -- a worker that failed to start, or a database torn down while a
 * click was in flight -- and it is exactly the case where the reader most needs to be told.
 */
jest.mock('features/DataStream/lib/queryData', () => ({
  checkForTable: jest.fn(),
  getTimeseries: jest.fn(),
  getVariables: jest.fn(),
  loadVpuData: jest.fn(),
  getFeatureIDs: jest.fn(),
  getDistinctFeatureIds: jest.fn(),
  getDistinctTimes: jest.fn(),
  getVpuVariableFlat: jest.fn(),
}));
jest.mock('features/DataStream/lib/duckdbClient', () => ({ getConnection: jest.fn() }));
jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));

const queryData = require('features/DataStream/lib/queryData');
const { loadVpu } = require('features/DataStream/actions/loadVpu');
const { loadTimeseries } = require('features/DataStream/actions/loadTimeseries');
const { resetLoadState, vpuLoadInFlight } = require('features/DataStream/actions/loadState');
const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;
const useDataStreamStore = require('features/DataStream/store/Datastream').default;
const { useVPUStore } = require('features/DataStream/store/Layers');

const initial = {
  ts: useTimeSeriesStore.getState(),
  ds: useDataStreamStore.getState(),
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useDataStreamStore.setState(initial.ds, true);
  resetLoadState();
  useDataStreamStore.setState({ cache_key: 'vpu.parquet', variables: ['flow'] });
  queryData.getTimeseries.mockResolvedValue([]);
  loadVpu.mockResolvedValue(undefined);
});

describe('a click while the database is unavailable', () => {
  it('reports the failure instead of rejecting into nowhere', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.checkForTable.mockRejectedValue(new Error('worker failed to start'));

    // Resolves: the caller does not await it, so a rejection here reaches no one.
    await expect(loadTimeseries({ featureId: 'cat-1' })).resolves.toBeUndefined();

    expect(useTimeSeriesStore.getState().last_error).toMatchObject({ kind: 'timeseries' });
    expect(useTimeSeriesStore.getState().loadingText).toMatch(/failed/i);
    consoleError.mockRestore();
  });

  it('leaves nothing behind claiming to be loading', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.checkForTable.mockRejectedValue(new Error('worker failed to start'));

    await loadTimeseries({ featureId: 'cat-1' });

    // The count is what the spinner reads; a load that bailed early must not hold one.
    expect(useTimeSeriesStore.getState().loading).toBe(false);
    expect(vpuLoadInFlight()).toBe(false);
    consoleError.mockRestore();
  });

  it('still hands off to a vpu load when the table is merely absent', async () => {
    queryData.checkForTable.mockResolvedValue(false);

    await loadTimeseries({ featureId: 'cat-1' });

    // Absent is not broken: that path rebuilds the table rather than reporting.
    expect(loadVpu).toHaveBeenCalled();
    expect(useTimeSeriesStore.getState().last_error).toBe(null);
  });
});

describe('the callers that do not await it', () => {
  const { selectMapFeature } = require('features/DataStream/actions/selectFeature');

  it('report a rejection rather than leaving it unhandled', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const loadTs = require('features/DataStream/actions/loadTimeseries');
    const boom = jest.spyOn(loadTs, 'loadTimeseries').mockRejectedValue(new Error('escaped'));
    useDataStreamStore.setState({ vpu: 'VPU_01' });
    // With an animation loaded the click charts, which is the path whose rejection is under test.
    useVPUStore.setState({ times: [1, 2, 3] });

    selectMapFeature({
      geometry: { type: 'Point', coordinates: [-96, 40] },
      properties: { divide_id: 'cat-42', vpuid: '01' },
    }, 'divides');
    await Promise.resolve();

    // Asserting the catch ran, not that nothing threw: an un-awaited rejected promise never
    // throws synchronously, so the not.toThrow this used to assert passed either way and could
    // not tell a working backstop from a deleted one.
    expect(consoleError).toHaveBeenCalledWith('Could not chart', 'cat-42', expect.any(Error));
    boom.mockRestore();
    consoleError.mockRestore();
  });
});

describe('asking again for a feature that had nothing', () => {
  it('answers the second ask instead of short-circuiting on the first', async () => {
    queryData.checkForTable.mockResolvedValue(true);
    queryData.getTimeseries.mockResolvedValue([]);
    useTimeSeriesStore.setState({ variable: 'flow' });

    await loadTimeseries({ featureId: 'cat-1' });
    expect(useTimeSeriesStore.getState().loadingText).toMatch(/No flow data/);

    // Recording an empty result as charted made this ask match the already-charted check and
    // return before doing anything at all: no query, no message, no change on screen.
    queryData.getTimeseries.mockClear();
    useTimeSeriesStore.setState({ loadingText: '' });
    await loadTimeseries({ featureId: 'cat-1' });

    expect(queryData.getTimeseries).toHaveBeenCalledTimes(1);
    expect(useTimeSeriesStore.getState().loadingText).toMatch(/No flow data/);
  });

  it('still short-circuits a repeat of a series it actually charted', async () => {
    queryData.checkForTable.mockResolvedValue(true);
    queryData.getTimeseries.mockResolvedValue([{ time: '2026-08-20T00:00:00Z', flow: 1.5 }]);
    useTimeSeriesStore.setState({ variable: 'flow' });

    await loadTimeseries({ featureId: 'cat-1' });
    queryData.getTimeseries.mockClear();
    await loadTimeseries({ featureId: 'cat-1' });

    // The point of that check: a chart already on screen is not re-fetched.
    expect(queryData.getTimeseries).not.toHaveBeenCalled();
  });
});

describe('a genuinely empty answer', () => {
  it('is not left reading as still loading', async () => {
    // The condition TimeseriesCard renders from. Reading the charted-key for this made it
    // permanently true once an empty result stopped being recorded as charted: the chart said
    // it was loading for ever after a load that completed and found nothing.
    queryData.checkForTable.mockResolvedValue(true);
    queryData.getTimeseries.mockResolvedValue([]);
    useTimeSeriesStore.setState({ variable: 'flow' });

    await loadTimeseries({ featureId: 'cat-1' });

    const s = useTimeSeriesStore.getState();
    const waiting =
      s.feature_id && (s.loading || (!s.series.length && !s.last_answered_key && !s.last_error));
    expect(waiting).toBeFalsy();
  });
});

describe('a click while the worker has stopped answering', () => {
  it('reports it and leaves nothing claiming to load', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const stopped = Object.assign(new Error('the database did not answer within 20000 ms'), {
      name: 'DatabaseTimeoutError',
    });
    queryData.checkForTable.mockRejectedValue(stopped);

    await loadTimeseries({ featureId: 'cat-1' });

    // The whole point of the deadline: the caller settles, so its catch and finally run.
    expect(useTimeSeriesStore.getState().last_error).toMatchObject({ kind: 'timeseries' });
    expect(useTimeSeriesStore.getState().loading).toBe(false);
    consoleError.mockRestore();
  });
});

describe('what a failed vpu load tells the reader', () => {
  const { loadVpu } = jest.requireActual('features/DataStream/actions/loadVpu');
  const useDsStore = require('features/DataStream/store/Datastream').default;
  const useS3Store = require('features/DataStream/store/s3Store').default;

  beforeEach(() => {
    useDsStore.setState({ cache_key: 'a.parquet', vpu: 'VPU_16' });
    useS3Store.setState({ prefix: 'outputs/' });
    queryData.checkForTable.mockResolvedValue(false);
  });

  it('names the cause when it has one', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Every failure here used to read as this vpu having no data, so a stalled download, a full
    // cache and a database that stopped answering were indistinguishable.
    queryData.loadVpuData.mockRejectedValue(
      Object.assign(new Error('stopped sending'), { name: 'TimeoutError' })
    );

    await loadVpu();

    expect(useTimeSeriesStore.getState().loadingText).toBe('Could not load: the download stopped');
    consoleError.mockRestore();
  });

  it('keeps its own words when the failure cannot be placed', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    // A 404 from s3 really is this selection having nothing, and that sentence is better than
    // anything the classifier could offer.
    queryData.loadVpuData.mockRejectedValue(new Error('Failed to fetch a.parquet: 404'));

    await loadVpu();

    expect(useTimeSeriesStore.getState().loadingText).toBe('No data available for selected VPU');
    consoleError.mockRestore();
  });
});
