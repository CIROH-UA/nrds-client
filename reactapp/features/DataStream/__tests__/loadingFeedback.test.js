/**
 * Regression tests for catchment-click feedback.
 *
 * Three defects made a click look like nothing had happened: a loading guard discarded any
 * selection made while a fetch was in flight, the status line rendered its text only while
 * loading was true so the failure message was erased before it could be read, and there was
 * no way to retry because the fetch was driven by an effect keyed on the feature id.
 *
 * Loading is now a store action called straight from the event that asks for it, so most of
 * this exercises the action rather than a rendered component.
 */
import { render, screen, act } from '@testing-library/react';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useVPUStore, useFeatureStore } from 'features/DataStream/store/Layers';

// These reach for duckdb-wasm and s3, neither of which runs in jsdom.
jest.mock('features/DataStream/lib/duckdbClient', () => ({ terminateDatabase: jest.fn() }));
jest.mock('features/DataStream/lib/opfsCache', () => ({ getCacheKey: () => 'vpu-01' }));
jest.mock('features/DataStream/lib/s3Utils', () => ({
  initialS3Data: jest.fn(async () => ({})),
  makePrefix: () => 'prefix/',
  getOptionsFromURL: jest.fn(async () => []),
}));
jest.mock('features/DataStream/lib/queryData', () => ({
  getTimeseries: jest.fn(),
  checkForTable: jest.fn(),
  loadVpuData: jest.fn(),
  getFeatureIDs: jest.fn(),
  getVariables: jest.fn(),
  getDistinctFeatureIds: jest.fn(),
  getDistinctTimes: jest.fn(),
  getVpuVariableFlat: jest.fn(),
}));

const queryData = require('features/DataStream/lib/queryData');
const { loadVpu } = require('features/DataStream/actions/loadVpu');
const { loadTimeseries } = require('features/DataStream/actions/loadTimeseries');
const { resetLoadState } = require('features/DataStream/actions/loadState');
const { LoadStatus } = require('features/DataStream/components/status/LoadStatus');

const initialTimeseriesState = useTimeSeriesStore.getState();
const initialDataStreamState = useDataStreamStore.getState();
const initialVpuState = useVPUStore.getState();
const initialFeatureState = useFeatureStore.getState();

const load = (args) => act(async () => {
  await loadTimeseries(args);
});

beforeEach(() => {
  // Both stores, because a cache_key surviving one test lets the vpu effect run in the next.
  useTimeSeriesStore.setState(initialTimeseriesState, true);
  useDataStreamStore.setState(initialDataStreamState, true);
  useVPUStore.setState(initialVpuState, true);
  useFeatureStore.setState(initialFeatureState, true);
  resetLoadState();
  // resetMocks is on for this project, which strips the factory implementations above.
  queryData.getTimeseries.mockResolvedValue([{ time: '2022-08-01T00:00:00Z', flow: 1.5 }]);
  queryData.checkForTable.mockResolvedValue(true);
  queryData.getFeatureIDs.mockResolvedValue([]);
  queryData.getVariables.mockResolvedValue(['flow']);
  queryData.getDistinctFeatureIds.mockResolvedValue([]);
  queryData.getDistinctTimes.mockResolvedValue([]);
  queryData.getVpuVariableFlat.mockResolvedValue([]);
});

describe('status line', () => {
  it('shows nothing at all while idle', () => {
    // Idle means the index has landed too: on a real mount it is still building, and the strip
    // says so rather than looking finished.
    useDataStreamStore.setState({ index_status: 'ready' });
    const { container } = render(<LoadStatus />);

    // It sits in the header, so an idle app must not reserve space for it.
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps a failure message visible after loading turns false', () => {
    render(<LoadStatus />);

    // The order a failed load writes these in: message first, flag cleared after.
    act(() => {
      useTimeSeriesStore.setState({ loading: true, loadingText: 'Failed to load timeseries for id: wb-101' });
    });
    expect(screen.getByText(/Failed to load timeseries/)).toBeInTheDocument();

    act(() => {
      useTimeSeriesStore.setState({ loading: false });
    });
    expect(screen.getByText(/Failed to load timeseries/)).toBeInTheDocument();
  });

  it('reports a failure even when no feature is selected', () => {
    render(<LoadStatus />);

    // The state the forecast panel hides in, and a failed load never leaves it.
    act(() => {
      useTimeSeriesStore.setState({
        feature_id: null,
        loading: false,
        loadingText: 'Failed to load VPU data for cacheKey: vpu-01',
        last_error: { kind: 'vpu', cacheKey: 'vpu-01' },
      });
    });

    expect(screen.getByRole('status')).toHaveTextContent(/Failed to load VPU data/);
  });

  it('shows a spinner while loading and no feature is selected yet', () => {
    render(<LoadStatus />);

    act(() => {
      useTimeSeriesStore.setState({
        feature_id: null,
        loading: true,
        loadingText: 'Loading feature properties...',
      });
    });

    expect(screen.getByRole('status')).toHaveTextContent(/Loading feature properties/);
  });

  it('shows nothing once the text is cleared', () => {
    render(<LoadStatus />);
    act(() => {
      useTimeSeriesStore.setState({ loading: false, loadingText: '' });
    });
    expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
  });
});

describe('loadTimeseries', () => {
  it('records the selection and charts it', async () => {
    await load({ featureId: 'wb-202' });

    expect(queryData.getTimeseries.mock.calls[0][0]).toBe('202');
    expect(useTimeSeriesStore.getState().feature_id).toBe('wb-202');
    expect(useTimeSeriesStore.getState().series).toHaveLength(1);
    expect(useTimeSeriesStore.getState().loading).toBe(false);
  });

  it('loads even when a load is already in flight', async () => {
    act(() => {
      useTimeSeriesStore.setState({ loading: true });
    });

    await load({ featureId: 'wb-202' });

    // A loading guard here used to drop the selection with nothing on screen to explain it.
    expect(queryData.getTimeseries).toHaveBeenCalled();
    expect(useTimeSeriesStore.getState().series).toHaveLength(1);
  });

  it('leaves the selected variable to the caller', async () => {
    await load({ featureId: 'wb-202', variable: 'precipitation' });

    expect(queryData.getTimeseries.mock.calls[0][2]).toBe('precipitation');
    // The layer looks up data by store variable, so the action must not move it early.
    expect(useTimeSeriesStore.getState().variable).toBe('');
  });

  it('reports a failure and leaves the message on screen', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.getTimeseries.mockRejectedValueOnce(new Error('network down'));

    await load({ featureId: 'wb-303' });

    expect(useTimeSeriesStore.getState().loadingText).toMatch(/Failed to load timeseries/);
    expect(useTimeSeriesStore.getState().loading).toBe(false);
    consoleError.mockRestore();
  });

  it('retries after a failure, because asking again is all it takes', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.getTimeseries.mockRejectedValueOnce(new Error('network down'));

    await load({ featureId: 'wb-303' });
    expect(queryData.getTimeseries).toHaveBeenCalledTimes(1);

    await load({ featureId: 'wb-303' });

    expect(queryData.getTimeseries).toHaveBeenCalledTimes(2);
    expect(useTimeSeriesStore.getState().series).toHaveLength(1);
    expect(useTimeSeriesStore.getState().loadingText).toBe('');
    consoleError.mockRestore();
  });
});

describe('a feature with no data', () => {
  it('says the load succeeded and found nothing', async () => {
    queryData.getTimeseries.mockResolvedValueOnce([]);

    await load({ featureId: 'wb-606' });

    // The chart's empty state cannot say this; it looks the same before anything is picked.
    expect(useTimeSeriesStore.getState().loadingText).toMatch(/No .* data for wb-606/);
    expect(useTimeSeriesStore.getState().series).toHaveLength(0);
    expect(useTimeSeriesStore.getState().loading).toBe(false);
  });

  it('answers again when the feature is asked for again', async () => {
    // This used to assert the opposite: that the second ask was short-circuited by the
    // already-charted check. Nothing was charted, so the reader clicking the same catchment got
    // no query, no message and no change, and no way back short of picking something else. One
    // query is the price of a second ask being answered at all.
    queryData.getTimeseries.mockResolvedValue([]);
    await load({ featureId: 'wb-606' });
    useTimeSeriesStore.setState({ loadingText: '' });

    await load({ featureId: 'wb-606' });

    expect(queryData.getTimeseries).toHaveBeenCalledTimes(2);
    expect(useTimeSeriesStore.getState().loadingText).toMatch(/No .* data for wb-606/);
  });

  it('clears the message once a feature with data is charted', async () => {
    queryData.getTimeseries.mockResolvedValueOnce([]);
    await load({ featureId: 'wb-606' });

    await load({ featureId: 'wb-707' });

    expect(useTimeSeriesStore.getState().loadingText).toBe('');
    expect(useTimeSeriesStore.getState().series).toHaveLength(1);
  });
});

describe('suppressing redundant loads', () => {
  it('does not reload the feature whose series is already charted', async () => {
    await load({ featureId: 'wb-404' });
    expect(queryData.getTimeseries).toHaveBeenCalledTimes(1);

    await load({ featureId: 'wb-404' });
    expect(queryData.getTimeseries).toHaveBeenCalledTimes(1);
  });

  it('reloads on return, because another feature replaced the series in between', async () => {
    await load({ featureId: 'wb-404' });
    await load({ featureId: 'wb-505' });
    await load({ featureId: 'wb-404' });

    // Suppressing the third would leave wb-505's points on screen labelled wb-404.
    expect(queryData.getTimeseries.mock.calls.map((c) => c[0])).toEqual(['404', '505', '404']);
  });

  it('reloads the same feature when the variable changed underneath it', async () => {
    await load({ featureId: 'wb-404' });
    expect(queryData.getTimeseries).toHaveBeenCalledTimes(1);

    // Keying suppression on the feature alone would skip this and chart the old variable.
    await load({ featureId: 'wb-404', variable: 'precipitation' });

    expect(queryData.getTimeseries).toHaveBeenCalledTimes(2);
    expect(queryData.getTimeseries.mock.calls[1][2]).toBe('precipitation');
  });

  it('reloads the same feature when the vpu changed underneath it', async () => {
    await load({ featureId: 'wb-404' });
    expect(queryData.getTimeseries).toHaveBeenCalledTimes(1);

    act(() => {
      useDataStreamStore.getState().set_cache_key('vpu-16');
    });
    await load({ featureId: 'wb-404' });

    expect(queryData.getTimeseries).toHaveBeenCalledTimes(2);
    expect(queryData.getTimeseries.mock.calls[1][1]).toBe('vpu-16');
  });

  it('reloads after the series is cleared', async () => {
    await load({ featureId: 'wb-404' });
    act(() => {
      useTimeSeriesStore.getState().reset_series();
    });

    await load({ featureId: 'wb-404' });
    expect(queryData.getTimeseries).toHaveBeenCalledTimes(2);
  });

  it('still records the selection when the load is suppressed', async () => {
    await load({ featureId: 'wb-404' });
    useTimeSeriesStore.setState({ feature_id: null });

    await load({ featureId: 'wb-404' });

    expect(useTimeSeriesStore.getState().feature_id).toBe('wb-404');
    expect(queryData.getTimeseries).toHaveBeenCalledTimes(1);
  });
});

describe('superseded loads', () => {
  it('lets the newest request win', async () => {
    let releaseFirst;
    queryData.getTimeseries
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve; }))
      .mockResolvedValueOnce([
        { time: '2022-08-01T00:00:00Z', flow: 9 },
        { time: '2022-08-01T01:00:00Z', flow: 9 },
      ]);

    const first = loadTimeseries({ featureId: 'wb-1' });
    await load({ featureId: 'wb-2' });

    await act(async () => {
      releaseFirst([{ time: '2022-08-01T00:00:00Z', flow: 1 }]);
      await first;
    });

    // wb-2 is the selection, so the late wb-1 result must not overwrite its series.
    expect(useTimeSeriesStore.getState().series).toHaveLength(2);
    expect(useTimeSeriesStore.getState().feature_id).toBe('wb-2');
  });
});

describe('vpu load failures', () => {
  it('can be retried by asking for the same vpu again', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.checkForTable.mockRejectedValueOnce(new Error('s3 unreachable'));
    useDataStreamStore.setState({ cache_key: 'vpu-01', vpu: 'VPU_01' });

    await act(async () => { await loadVpu(); });
    expect(queryData.checkForTable).toHaveBeenCalledTimes(1);
    expect(useTimeSeriesStore.getState().loadingText).toMatch(/Failed to load data for VPU_01/);

    // Asking again is the retry; the effect this replaced could never re-run.
    await act(async () => { await loadVpu(); });

    expect(queryData.checkForTable).toHaveBeenCalledTimes(2);
    expect(useTimeSeriesStore.getState().loadingText).toBe('');
    consoleError.mockRestore();
  });

  it('says so when the vpu has no data, and leaves it said', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.checkForTable.mockResolvedValue(false);
    queryData.loadVpuData.mockRejectedValue(new Error('404'));
    useDataStreamStore.setState({ cache_key: 'vpu-99' });

    await act(async () => { await loadVpu(); });

    expect(useTimeSeriesStore.getState().loadingText).toBe('No data available for selected VPU');
    expect(useTimeSeriesStore.getState().loading).toBe(false);
    consoleError.mockRestore();
  });

  it('does nothing without a vpu selected', async () => {
    await act(async () => { await loadVpu(); });
    expect(queryData.checkForTable).not.toHaveBeenCalled();
  });

  it('lets the newest vpu request win', async () => {
    let releaseFirst;
    queryData.checkForTable
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve; }))
      .mockResolvedValue(true);

    useDataStreamStore.setState({ cache_key: 'vpu-A' });
    const first = loadVpu();

    useDataStreamStore.setState({ cache_key: 'vpu-B' });
    await act(async () => { await loadVpu(); });

    await act(async () => {
      releaseFirst(true);
      await first;
    });

    // Only vpu-B may continue past its table check; the abandoned vpu-A must write nothing.
    expect(queryData.getFeatureIDs).toHaveBeenCalledTimes(1);
  });

  it('loads the vpu and charts the selected feature', async () => {
    useDataStreamStore.setState({ cache_key: 'vpu-01', vpu: 'VPU_01' });
    queryData.getVariables.mockResolvedValue(['flow', 'precipitation']);
    queryData.getDistinctFeatureIds.mockResolvedValue(['wb-1']);
    queryData.getDistinctTimes.mockResolvedValue(['2022-08-01T00:00:00Z']);
    queryData.getVpuVariableFlat.mockResolvedValue(Float32Array.from([1]));

    await act(async () => { await loadVpu(); });

    expect(useDataStreamStore.getState().variables).toEqual(['flow', 'precipitation']);
    expect(useTimeSeriesStore.getState().variable).toBe('flow');
    expect(useVPUStore.getState().valuesByVar.flow).toHaveLength(1);
    expect(useTimeSeriesStore.getState().loadingText).toBe('');
  });
});

describe('vpu load failures after the table check', () => {
  it.each([
    ['getFeatureIDs', 'getFeatureIDs'],
    ['getVariables', 'getVariables'],
    ['getVpuVariableFlat', 'getVpuVariableFlat'],
  ])('reports a generic vpu failure when %s rejects', async (_name, fn) => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData[fn].mockRejectedValueOnce(new Error('query blew up'));
    useDataStreamStore.setState({ cache_key: 'vpu-01', vpu: 'VPU_01' });

    await act(async () => { await loadVpu(); });

    expect(useTimeSeriesStore.getState().loadingText).toBe('Failed to load data for VPU_01');
    expect(useTimeSeriesStore.getState().last_error).toEqual({ kind: 'vpu', cacheKey: 'vpu-01' });
    expect(useTimeSeriesStore.getState().loading).toBe(false);
    consoleError.mockRestore();
  });

  it('distinguishes a vpu with no data from a vpu that failed', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.checkForTable.mockResolvedValue(false);
    queryData.loadVpuData.mockRejectedValue(new Error('404'));
    useDataStreamStore.setState({ cache_key: 'vpu-99' });

    await act(async () => { await loadVpu(); });

    expect(useTimeSeriesStore.getState().last_error).toEqual({ kind: 'vpu-missing', cacheKey: 'vpu-99' });
    consoleError.mockRestore();
  });
});

describe('failures are readable without parsing prose', () => {
  it('names the feature and variable a series load failed on', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    useDataStreamStore.setState({ cache_key: 'vpu-01', vpu: 'VPU_01' });
    queryData.getTimeseries.mockRejectedValueOnce(new Error('nope'));

    await load({ featureId: 'wb-505', variable: 'flow' });

    expect(useTimeSeriesStore.getState().last_error).toEqual({
      kind: 'timeseries', featureId: 'wb-505', variable: 'flow',
    });
    consoleError.mockRestore();
  });

  it('clears itself on the next successful load', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.getTimeseries.mockRejectedValueOnce(new Error('nope'));
    await load({ featureId: 'wb-505' });
    expect(useTimeSeriesStore.getState().last_error).not.toBe(null);

    await load({ featureId: 'wb-606' });

    expect(useTimeSeriesStore.getState().last_error).toBe(null);
    consoleError.mockRestore();
  });
});

describe('the in-flight counters always come back down', () => {
  it('does not wedge clicks when the vpu reset itself throws', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    useDataStreamStore.setState({ cache_key: 'vpu-01', vpu: 'VPU_01' });
    const resetVPU = useVPUStore.getState().resetVPU;
    useVPUStore.setState({
      resetVPU: () => { throw new Error('reset exploded'); },
    });

    await act(async () => { await loadVpu(); });
    useVPUStore.setState({ resetVPU });

    // A leaked vpu counter would defer every later click for the life of the page.
    await load({ featureId: 'wb-1' });
    expect(queryData.getTimeseries).toHaveBeenCalledTimes(1);
    expect(useTimeSeriesStore.getState().loading).toBe(false);
    consoleError.mockRestore();
  });

  it('leaves loading false when a series load throws before its fetch', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const reset_series = useTimeSeriesStore.getState().reset_series;
    useTimeSeriesStore.setState({
      reset_series: () => { throw new Error('reset exploded'); },
    });

    await load({ featureId: 'wb-2' });
    useTimeSeriesStore.setState({ reset_series });

    expect(useTimeSeriesStore.getState().loading).toBe(false);
    consoleError.mockRestore();
  });
});

describe('a vpu load and a series load together', () => {
  const deferred = () => {
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    return { promise, release };
  };

  it('keeps the series failure message its own vpu load produced', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    useFeatureStore.setState({ selected_feature: { _id: 'wb-77' } });
    useDataStreamStore.setState({ cache_key: 'vpu-01', vpu: 'VPU_01' });
    queryData.getTimeseries.mockRejectedValueOnce(new Error('table gone'));

    await act(async () => { await loadVpu(); });

    // loadVpu used to clear this unconditionally, erasing the only report of the failure.
    expect(useTimeSeriesStore.getState().loadingText).toMatch(/Failed to load timeseries/);
    expect(useTimeSeriesStore.getState().loading).toBe(false);
    consoleError.mockRestore();
  });

  it('still clears the message when there was no feature to chart', async () => {
    useDataStreamStore.setState({ cache_key: 'vpu-01', vpu: 'VPU_01' });

    await act(async () => { await loadVpu(); });

    expect(useTimeSeriesStore.getState().loadingText).toBe('');
  });

  it('defers a click that lands while the vpu is still loading', async () => {
    const gate = deferred();
    queryData.checkForTable.mockImplementationOnce(() => gate.promise);
    useDataStreamStore.setState({ cache_key: 'vpu-01', vpu: 'VPU_01' });

    const vpuLoad = loadVpu();
    await load({ featureId: 'wb-88' });

    // The table it would read is being rebuilt, so the selection is recorded and nothing else.
    expect(useTimeSeriesStore.getState().feature_id).toBe('wb-88');
    expect(queryData.getTimeseries).not.toHaveBeenCalled();

    useFeatureStore.setState({ selected_feature: { _id: 'wb-88' } });
    await act(async () => { gate.release(true); await vpuLoad; });

    // The vpu load's own closing call picks the selection up once the table is there.
    expect(queryData.getTimeseries).toHaveBeenCalledTimes(1);
    expect(queryData.getTimeseries.mock.calls[0][0]).toBe('88');
  });

  it('stops a series load that a vpu load has overtaken', async () => {
    const gate = deferred();
    queryData.getTimeseries.mockImplementationOnce(() => gate.promise);
    useDataStreamStore.setState({ cache_key: 'vpu-01', vpu: 'VPU_01' });

    const series = loadTimeseries({ featureId: 'wb-11' });
    await act(async () => { await loadVpu(); });

    await act(async () => {
      gate.release([{ time: '2022-08-01T00:00:00Z', flow: 5 }]);
      await series;
    });

    // Its table was replaced mid-flight, so it must not chart or claim to be loaded.
    expect(useTimeSeriesStore.getState().series).toHaveLength(0);
    expect(useTimeSeriesStore.getState().last_loaded_key).toBe(null);
  });
});
