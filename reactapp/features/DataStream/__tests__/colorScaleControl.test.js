/**
 * The "Color scale" selector and the legend note that follows it.
 *
 * The selector lives in the unified ControlMenu next to the layer controls. Changing it writes the
 * chosen scale to the VPU store, which is the single seam the map's recolour and the legend both
 * read -- so the two can never describe different scales. The legend appends the scale's name when
 * it is anything but the plain linear default.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import { useLayersStore, useFeatureStore } from 'features/DataStream/store/Layers';
import { useVPUStore } from 'features/DataStream/store/VPU';

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
jest.mock('features/DataStream/components/SelectComponent', () =>
  function SelectComponent({ inputId, optionsList, value, onChangeHandler }) {
    return (
      <select
        id={inputId}
        value={value?.value ?? ''}
        onChange={(e) => onChangeHandler(optionsList.find((o) => o.value === e.target.value))}
      >
        {optionsList.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
);

const { ControlMenu } = require('features/DataStream/components/menus/ControlMenu');
const { ValueLegend, ValueLegendPanel } = require('features/DataStream/components/map/ValueLegend');
const { LIGHT_RAMP } = require('features/DataStream/lib/valueRamp');

const initial = {
  ts: useTimeSeriesStore.getState(),
  ds: useDataStreamStore.getState(),
  s3: useS3DataStreamBucketStore.getState(),
  ls: useLayersStore.getState(),
  fs: useFeatureStore.getState(),
  vpu: useVPUStore.getState(),
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useDataStreamStore.setState(initial.ds, true);
  useS3DataStreamBucketStore.setState(initial.s3, true);
  useLayersStore.setState(initial.ls, true);
  useFeatureStore.setState(initial.fs, true);
  useVPUStore.setState(initial.vpu, true);
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: query.includes('min-width: 769px'),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
});

afterEach(() => {
  delete window.matchMedia;
});

describe('the Color scale selector', () => {
  it('is present in the control menu, defaulting to linear', () => {
    render(<ControlMenu />);

    const select = screen.getByLabelText('Color scale');
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('linear');
    expect(useVPUStore.getState().scale).toBe('linear');
  });

  it('writes the chosen scale to the store, which is what re-colours the map', () => {
    render(<ControlMenu />);

    act(() => {
      fireEvent.change(screen.getByLabelText('Color scale'), { target: { value: 'log' } });
    });

    expect(useVPUStore.getState().scale).toBe('log');
  });
});

describe('the legend names the scale', () => {
  const bounds = { min: 0, max: 100, curve: 1 };

  it('says nothing extra for the linear default', () => {
    render(<ValueLegend bounds={bounds} ramp={LIGHT_RAMP} variable="flow" scale="linear" />);

    expect(screen.getByText((t) => t.startsWith('flow') && !t.includes('·'))).toBeInTheDocument();
  });

  it('appends the scale name when it is not linear', () => {
    render(<ValueLegend bounds={bounds} ramp={LIGHT_RAMP} variable="flow" scale="log" />);

    expect(screen.getByText((t) => t.includes('· log'))).toBeInTheDocument();
  });

  it('reads the scale from the store in the panel', () => {
    useLayersStore.getState().set_flowpaths_visibility(true);
    useVPUStore.setState({
      times: [1, 2, 3],
      valuesByVar: { flow: Float32Array.from([1, 2, 3, 4]) },
      scale: 'quantile',
    });
    useTimeSeriesStore.setState({ variable: 'flow' });

    render(<ValueLegendPanel />);

    expect(screen.getByText((t) => t.includes('· rank'))).toBeInTheDocument();
  });
});
