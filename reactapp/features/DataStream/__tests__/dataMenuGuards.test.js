/**
 * handleVisulization refuses to load under three conditions and explains each one. Those
 * messages used to be cleared on the line after they were set, so none of them ever appeared;
 * this pins that they survive, and that a stale one cannot be mistaken for the current answer.
 */
import { act, render, screen } from '@testing-library/react';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useFeatureStore } from 'features/DataStream/store/Layers';

jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));
jest.mock('features/DataStream/lib/utils', () => ({
  ...jest.requireActual('features/DataStream/lib/utils'),
  getCacheKey: () => 'vpu-01',
}));
jest.mock('features/DataStream/lib/duckdbClient', () => ({ terminateDatabase: jest.fn() }));
jest.mock('features/DataStream/lib/s3Utils', () => ({
  getOptionsFromURL: jest.fn(async () => []),
  makePrefix: () => 'prefix/',
}));
jest.mock('features/DataStream/components/SelectComponent', () => function SelectComponent() {
  return null;
});

const { loadVpu } = require('features/DataStream/actions/loadVpu');
const { DataMenuControls } = require('features/DataStream/components/forecast/dataMenu');

const initial = {
  ts: useTimeSeriesStore.getState(),
  ds: useDataStreamStore.getState(),
  fs: useFeatureStore.getState(),
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useDataStreamStore.setState(initial.ds, true);
  useFeatureStore.setState(initial.fs, true);
  loadVpu.mockResolvedValue(undefined);
});

const press = async () => {
  await act(async () => {
    screen.getByRole('button', { name: /update|visuali/i }).click();
  });
};

describe('the visualize button', () => {
  it('asks for a feature when none is selected, and leaves the message up', async () => {
    // An output file, so the button is pressable: without one it is disabled outright now.
    useDataStreamStore.setState({ outputFile: 'troute.parquet' });
    render(<DataMenuControls />);

    await press();

    expect(useTimeSeriesStore.getState().loadingText).toBe('Select a feature on the map first');
    expect(loadVpu).not.toHaveBeenCalled();
  });

  it('cannot be pressed at all without an output file', async () => {
    useFeatureStore.setState({ selected_feature: { _id: 'cat-1' } });
    useDataStreamStore.setState({ vpu: 'VPU_01', outputFile: null });
    render(<DataMenuControls />);

    // The refusal moved out of the press and into the control: a button whose only possible
    // outcome is a complaint should not invite the press. The panel states the reason instead,
    // which noOutputFile.test.js covers. The handler keeps its own guard for callers that are
    // not this button.
    expect(screen.getByRole('button', { name: /update/i })).toBeDisabled();
    await press();
    expect(loadVpu).not.toHaveBeenCalled();
  });

  it('says a load is already running rather than starting a second', async () => {
    useFeatureStore.setState({ selected_feature: { _id: 'cat-1' } });
    useDataStreamStore.setState({ vpu: 'VPU_01', outputFile: 'troute.parquet' });
    useTimeSeriesStore.setState({ loading: true });
    render(<DataMenuControls />);

    await press();

    expect(useTimeSeriesStore.getState().loadingText).toBe('Data is already loading, please wait');
    expect(loadVpu).not.toHaveBeenCalled();
  });

  it('loads when everything it needs is there', async () => {
    useFeatureStore.setState({ selected_feature: { _id: 'cat-1' } });
    useDataStreamStore.setState({ vpu: 'VPU_01', outputFile: 'troute.parquet' });
    render(<DataMenuControls />);

    await press();

    expect(loadVpu).toHaveBeenCalled();
    expect(useDataStreamStore.getState().cache_key).toBe('vpu-01');
  });

  it('drops the previous complaint when pressed again', async () => {
    useDataStreamStore.setState({ outputFile: 'troute.parquet' });
    render(<DataMenuControls />);
    await press();
    expect(useTimeSeriesStore.getState().loadingText).toMatch(/Select a feature/);

    // Inside act, so the handler sees the new values rather than the render it closed over.
    await act(async () => {
      useFeatureStore.setState({ selected_feature: { _id: 'cat-1' } });
      useDataStreamStore.setState({ vpu: 'VPU_01', outputFile: 'troute.parquet' });
    });
    await press();

    // A stale refusal must not read as the answer to this press.
    expect(useTimeSeriesStore.getState().loadingText).not.toMatch(/Select a feature/);
  });
});
