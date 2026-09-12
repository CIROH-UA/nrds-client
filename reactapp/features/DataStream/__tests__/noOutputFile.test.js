/**
 * A selection with no output file left the previous one on screen.
 *
 * Changing model, date, forecast, cycle or ensemble refetches the output-file listing. When
 * that listing came back empty the controls updated but nothing else did, so the flowpath
 * animation and the chart from the last output file stayed up, presented as though they
 * belonged to the selection now showing. Pressing Update could not correct it either, since
 * there was nothing to load, so the stale view was permanent.
 */
import { act, render, screen, waitFor } from '@testing-library/react';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { useVPUStore } from 'features/DataStream/store/VPU';

jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));
jest.mock('features/DataStream/lib/utils', () => ({
  ...jest.requireActual('features/DataStream/lib/utils'),
  getCacheKey: () => 'vpu-01',
}));
jest.mock('features/DataStream/lib/duckdbClient', () => ({ terminateDatabase: jest.fn() }));
jest.mock('features/DataStream/lib/queryData', () => ({
  getTimeseries: jest.fn(), checkForTable: jest.fn(), getVariables: jest.fn(),
}));
jest.mock('features/DataStream/lib/s3Utils', () => ({
  getOptionsFromURL: jest.fn(),
  makePrefix: () => 'prefix/',
  initialS3Data: jest.fn(),
}));

/* eslint-disable react/prop-types -- a one-prop stand-in, not a component. */
jest.mock('features/DataStream/components/SelectComponent', () => function SelectComponent({ inputId, onChangeHandler }) {
  return <button onClick={() => onChangeHandler({ value: 'changed', label: 'changed' })}>{`pick ${inputId}`}</button>;
});

const { getOptionsFromURL } = require('features/DataStream/lib/s3Utils');
const { DataMenuControls } = require('features/DataStream/components/forecast/dataMenu');

const initial = {
  ts: useTimeSeriesStore.getState(),
  ds: useDataStreamStore.getState(),
  fs: useFeatureStore.getState(),
  vpu: useVPUStore.getState(),
  s3: useS3DataStreamBucketStore.getState(),
};

const withLoadedAnimation = () => {
  useFeatureStore.setState({ selected_feature: { _id: 'cat-2884494' } });
  useDataStreamStore.setState({
    vpu: 'VPU_16', model: 'cfe_nom', date: 'ngen.20260819',
    forecast: 'short_range', cycle: '00', outputFile: 'troute_output_1.parquet',
  });
  useS3DataStreamBucketStore.setState({
    dates: [{ value: 'ngen.20260819', label: 'ngen.20260819' }],
    outputFiles: [{ value: 'troute_output_1.parquet', label: 'troute_output_1.parquet' }],
  });
  useVPUStore.getState().setAnimationIndex(['2884494'], ['t0', 't1']);
  useVPUStore.getState().setVarData('flow', Float32Array.from([1, 2]));
  useTimeSeriesStore.setState({ feature_id: 'cat-2884494', series: [{ x: 1, y: 2 }] });
};

const hasAnimation = () => {
  const s = useVPUStore.getState();
  return Object.keys(s.valuesByVar).length > 0 && s.times.length > 0;
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useDataStreamStore.setState(initial.ds, true);
  useFeatureStore.setState(initial.fs, true);
  useVPUStore.setState(initial.vpu, true);
  useS3DataStreamBucketStore.setState(initial.s3, true);
});

const changeDate = async () => {
  render(<DataMenuControls />);
  await act(async () => { screen.getByRole('button', { name: /pick select-date/i }).click(); });
};

describe('changing to a selection with no output file', () => {
  test('stops animating the previous output file', async () => {
    withLoadedAnimation();
    expect(hasAnimation()).toBe(true);
    getOptionsFromURL.mockResolvedValue([]);

    await changeDate();

    expect(hasAnimation()).toBe(false);
  });

  test('clears the chart from the previous output file', async () => {
    withLoadedAnimation();
    getOptionsFromURL.mockResolvedValue([]);

    await changeDate();

    expect(useTimeSeriesStore.getState().series).toHaveLength(0);
  });

  test('lets go of the key that names the previous output file', async () => {
    withLoadedAnimation();
    useDataStreamStore.setState({ cache_key: 'the_previous_selection.parquet' });
    getOptionsFromURL.mockResolvedValue([]);

    await changeDate();

    expect(useDataStreamStore.getState().cache_key).toBe(null);
  });

  test('says so, as a failure rather than as progress', async () => {
    withLoadedAnimation();
    getOptionsFromURL.mockResolvedValue([]);

    await changeDate();

    expect(useTimeSeriesStore.getState().loadingText).toMatch(/No output file for this selection/);
    expect(useTimeSeriesStore.getState().last_error).toMatchObject({ kind: 'no-output-file' });
  });

  test('leaves the selection alone, so the panel stays open mid-interaction', async () => {
    withLoadedAnimation();
    getOptionsFromURL.mockResolvedValue([]);

    await changeDate();

    expect(useTimeSeriesStore.getState().feature_id).toBe('cat-2884494');
  });

  test('keeps the animation when the listing is not empty', async () => {
    withLoadedAnimation();
    getOptionsFromURL.mockResolvedValue([{ value: 'troute_output_2.parquet', label: 'b' }]);

    await changeDate();

    expect(hasAnimation()).toBe(true);
    expect(useTimeSeriesStore.getState().last_error).toBeNull();
  });
});

describe('how obvious it is', () => {
  test('states the reason as an alert, not a caption', () => {
    useDataStreamStore.setState({ vpu: 'VPU_01' });
    useS3DataStreamBucketStore.setState({ outputFiles: [] });
    render(<DataMenuControls />);

    expect(screen.getByRole('alert')).toHaveTextContent(/No output file for this selection/);
  });

  test('says nothing before a selection has been made, when the panel first opens', () => {
    useDataStreamStore.setState({ vpu: null });
    useS3DataStreamBucketStore.setState({ outputFiles: [] });
    render(<DataMenuControls />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('disables Update, because pressing it could only fail', () => {
    useDataStreamStore.setState({ outputFile: '' });
    useS3DataStreamBucketStore.setState({ outputFiles: [] });
    render(<DataMenuControls />);

    expect(screen.getByRole('button', { name: /update/i })).toBeDisabled();
  });

  test('enables Update once there is something to read', () => {
    useDataStreamStore.setState({ outputFile: 'troute_output_1.parquet' });
    useS3DataStreamBucketStore.setState({
      outputFiles: [{ value: 'troute_output_1.parquet', label: 'a' }],
    });
    render(<DataMenuControls />);

    expect(screen.getByRole('button', { name: /update/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('what an empty chart says', () => {
  const TimeSeriesCard = require('features/DataStream/components/forecast/TimeseriesCard').default;

  test('asks for a selection only when there is none', () => {
    render(<TimeSeriesCard />);
    expect(screen.getByText(/select a catchment/i)).toBeInTheDocument();
  });

  test('names the selected catchment instead of asking for one already chosen', () => {
    useTimeSeriesStore.setState({
      feature_id: 'cat-2884494', series: [], loading: false,
      last_answered_key: 'key|flow|cat-2884494',
    });
    render(<TimeSeriesCard />);

    expect(screen.queryByText(/select a catchment/i)).toBeNull();
    expect(screen.getByText(/No data to chart for cat-2884494/i)).toBeInTheDocument();
  });

  test('does not call a load in progress an absence of data', () => {
    useTimeSeriesStore.setState({ feature_id: 'cat-2884494', series: [], loading: true });
    render(<TimeSeriesCard />);

    expect(screen.queryByText(/No data to chart/i)).toBeNull();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('waits through the gap between the click and the load starting', () => {
    useTimeSeriesStore.setState({ feature_id: 'cat-2884494', series: [], loading: false });
    render(<TimeSeriesCard />);

    expect(screen.queryByText(/No data to chart/i)).toBeNull();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('an answer of "nothing" is an answer, not a load still running', () => {
    useTimeSeriesStore.setState({
      feature_id: 'cat-2884494', series: [], loading: false,
      last_loaded_key: null, last_answered_key: 'key|flow|cat-2884494',
    });
    render(<TimeSeriesCard />);

    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(screen.getByText(/No data to chart for cat-2884494/i)).toBeInTheDocument();
  });

  test('calls a failed load a failure rather than waiting for ever', () => {
    useTimeSeriesStore.setState({
      feature_id: 'cat-2884494', series: [], loading: false,
      last_error: { kind: 'timeseries', featureId: 'cat-2884494' },
    });
    render(<TimeSeriesCard />);

    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i);
  });
});

describe('clicking a catchment while the selection has no output file', () => {
  const queryData = require('features/DataStream/lib/queryData');
  const { loadTimeseries } = require('features/DataStream/actions/loadTimeseries');

  test('charts nothing, rather than the output file that is still cached', async () => {
    useDataStreamStore.setState({ cache_key: null, forecast: 'MEDIUM_RANGE' });
    useTimeSeriesStore.setState({ feature_id: 'cat-2860749', series: [] });

    await loadTimeseries({ featureId: 'cat-2860749' });

    expect(queryData.getTimeseries).not.toHaveBeenCalled();
    expect(useTimeSeriesStore.getState().series).toHaveLength(0);
  });

  test('leaves the reason on screen rather than replacing it with a load message', async () => {
    useDataStreamStore.setState({ cache_key: null });
    useTimeSeriesStore.setState({
      loadingText: 'No output file for this selection',
      last_error: { kind: 'no-output-file' },
    });

    await loadTimeseries({ featureId: 'cat-2860749' });

    expect(useTimeSeriesStore.getState().loadingText).toMatch(/no output file/i);
    expect(useTimeSeriesStore.getState().last_error).toEqual({ kind: 'no-output-file' });
  });
});

describe('the first load of a vpu with no output file', () => {
  const s3Utils = require('features/DataStream/lib/s3Utils');
  const { loadVpu } = require('features/DataStream/actions/loadVpu');
  const { InitialS3Loader } = require('features/DataStream/views/InitialS3Loader');

  test('does not key a table that cannot exist, and says so', async () => {
    s3Utils.initialS3Data.mockResolvedValue({
      models: [{ value: 'cfe_nom' }], dates: [{ value: 'a' }, { value: 'b' }],
      forecasts: [{ value: 'short_range' }], cycles: [{ value: '00' }],
      ensembles: [], outputFiles: [],
    });
    useDataStreamStore.setState({ vpu: 'VPU_16', cache_key: 'previous.parquet' });
    useTimeSeriesStore.setState({ series: [{ x: 1, y: 2 }] });

    render(<InitialS3Loader />);
    await waitFor(() => expect(useDataStreamStore.getState().cache_key).toBe(null));

    expect(useTimeSeriesStore.getState().series).toHaveLength(0);
    expect(useTimeSeriesStore.getState().last_error).toEqual({ kind: 'no-output-file' });
    expect(loadVpu).not.toHaveBeenCalled();
  });
});

describe('both routes into "nothing to read" agree', () => {
  const { abandonSelectionWithNoOutput } = require('features/DataStream/actions/noOutputFile');
  const useS3Store = require('features/DataStream/store/s3Store').default;

  const stateAfter = () => ({
    cacheKey: useDataStreamStore.getState().cache_key,
    outputFile: useDataStreamStore.getState().outputFile,
    prefix: useS3Store.getState().prefix,
    series: useTimeSeriesStore.getState().series.length,
    title: useTimeSeriesStore.getState().layout.title,
    errorKind: useTimeSeriesStore.getState().last_error?.kind,
    times: useVPUStore.getState().times.length,
  });

  test('the shared action leaves the state the reader is told about', () => {
    withLoadedAnimation();
    useFeatureStore.setState({ selected_feature: { _id: 'cat-2884494' } });
    useDataStreamStore.setState({ cache_key: 'previous.parquet' });
    useS3Store.setState({ prefix: 'outputs/previous/' });

    abandonSelectionWithNoOutput();

    expect(stateAfter()).toEqual({
      cacheKey: null, outputFile: '', prefix: '', series: 0,
      title: 'Cat 2884494', errorKind: 'no-output-file', times: 0,
    });
  });

  test('a control change reaches exactly that state', async () => {
    withLoadedAnimation();
    useFeatureStore.setState({ selected_feature: { _id: 'cat-2884494' } });
    getOptionsFromURL.mockResolvedValue([]);

    await changeDate();

    expect(stateAfter()).toMatchObject({
      cacheKey: null, series: 0, title: 'Cat 2884494', errorKind: 'no-output-file',
    });
  });
});
