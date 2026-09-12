/**
 * The unified ControlMenu (U4/KTD5): one map-chrome control that holds the model-run selector,
 * the layer toggles, and the light/dark theme toggle -- previously three disconnected regions
 * (run selector in the forecast sheet, layer menu in the navbar, no manual theme control).
 *
 * It composes existing behavior rather than reimplementing it: the run cascade is
 * `DataMenuControls` (`useDataStreamStore` + `useS3DataStreamBucketStore` + `loadVpu`), the
 * toggles are `LayerControl` (`useLayersStore`), the theme control is the U2 `ThemeToggle`. These
 * tests pin that all three are present and that run loading and layer visibility still behave as
 * before (R6).
 */
import fs from 'fs';
import path from 'path';

import { act, fireEvent, render, screen } from '@testing-library/react';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import { useLayersStore, useFeatureStore } from 'features/DataStream/store/Layers';

jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({ terminateDatabase: jest.fn() }));
jest.mock('features/DataStream/lib/utils', () => ({
  ...jest.requireActual('features/DataStream/lib/utils'),
  getCacheKey: () => 'vpu-01',
}));
jest.mock('features/DataStream/lib/s3Utils', () => ({
  ...jest.requireActual('features/DataStream/lib/s3Utils'),
  getOptionsFromURL: jest.fn(async () => []),
  makePrefix: () => 'prefix/',
}));
jest.mock('features/DataStream/components/SelectComponent', () => function SelectComponent() {
  return null;
});

const { loadVpu } = require('features/DataStream/actions/loadVpu');
const { ControlMenu } = require('features/DataStream/components/menus/ControlMenu');

const initial = {
  ts: useTimeSeriesStore.getState(),
  ds: useDataStreamStore.getState(),
  s3: useS3DataStreamBucketStore.getState(),
  ls: useLayersStore.getState(),
  fs: useFeatureStore.getState(),
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useDataStreamStore.setState(initial.ds, true);
  useS3DataStreamBucketStore.setState(initial.s3, true);
  useLayersStore.setState(initial.ls, true);
  useFeatureStore.setState(initial.fs, true);
  loadVpu.mockReset();
  loadVpu.mockResolvedValue(undefined);
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: query.includes('min-width: 769px'),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
});

afterEach(() => { delete window.matchMedia; });

describe('the three groups', () => {
  it('renders the run selector, the layer toggles, and the theme toggle together', () => {
    useS3DataStreamBucketStore.setState({ models: [{ value: 'm1', label: 'm1' }] });

    render(<ControlMenu />);

    expect(screen.getByRole('heading', { name: /change the run/i })).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();

    expect(screen.getByLabelText(/catchments/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/flowpaths/i)).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: /switch to (light|dark) theme/i })
    ).toHaveAttribute('aria-pressed');
  });
});

describe('run switching (unchanged behavior)', () => {
  it('pressing Update calls loadVpu with the built cache key and prefix', async () => {
    useFeatureStore.setState({ selected_feature: { _id: 'cat-1' } });
    useDataStreamStore.setState({ vpu: 'VPU_01', outputFile: 'troute.parquet' });

    render(<ControlMenu />);

    await act(async () => {
      screen.getByRole('button', { name: /update/i }).click();
    });

    expect(loadVpu).toHaveBeenCalled();
    expect(useDataStreamStore.getState().cache_key).toBe('vpu-01');
    expect(useS3DataStreamBucketStore.getState().prefix).toBe('prefix/');
  });

  it('refuses to load with no output file, so the button is disabled', () => {
    useFeatureStore.setState({ selected_feature: { _id: 'cat-1' } });
    useDataStreamStore.setState({ vpu: 'VPU_01', outputFile: null });

    render(<ControlMenu />);

    expect(screen.getByRole('button', { name: /update/i })).toBeDisabled();
    expect(loadVpu).not.toHaveBeenCalled();
  });
});

describe('layer toggling (unchanged behavior)', () => {
  it('flipping a switch updates its visibility through useLayersStore', () => {
    render(<ControlMenu />);

    expect(useLayersStore.getState().catchments.visible).toBe(true);

    fireEvent.click(screen.getByLabelText(/catchments/i));

    expect(useLayersStore.getState().catchments.visible).toBe(false);
  });
});

describe('the old homes are emptied', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

  it('the Tethys navbar no longer renders the old layer menu', () => {
    const header = read('../../Tethys/components/layout/Header.js');
    expect(header).not.toMatch(/LayersMenu/);
  });

  it('the layer menu component is removed, not left as dead code', () => {
    expect(fs.existsSync(path.join(__dirname, '../components/menus/LayersMenu.js'))).toBe(false);
  });

  it('the slimmed ForecastMenu no longer imports or renders the run selector', () => {
    const forecast = read('../components/menus/ForecastMenu.js');
    expect(forecast).not.toMatch(/DataMenu/);
  });
});
