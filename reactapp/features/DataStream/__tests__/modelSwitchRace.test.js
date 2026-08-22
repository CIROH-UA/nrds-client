/**
 * Switching model twice before the first answer arrives must leave the controls describing the
 * second model, not the first.
 *
 * Each control change starts a chain of dependent S3 listings, and nothing used to say which
 * chain an answer belonged to, so two overlapping chains both wrote in whatever order their
 * requests came back. The model select itself is written synchronously and so always showed the
 * last click, while every control under it could be left describing the previous model. Probing
 * the date list for readable output turned one round trip into as many as twelve, which is what
 * made an always-present race easy to hit by hand.
 *
 * The first request of the first chain is held open here rather than timed, so the ordering is
 * decided by the test rather than by how fast the machine happens to be.
 */
import { act, render, screen } from '@testing-library/react';

import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import useDataStreamStore from 'features/DataStream/store/Datastream';

jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({ terminateDatabase: jest.fn() }));
/* eslint-disable react/prop-types -- a three-prop stand-in for react-select, not a component. */
jest.mock('features/DataStream/components/SelectComponent', () => function SelectComponent({
  inputId, optionsList, onChangeHandler, isLoading,
}) {
  return (
    <span data-testid={`${inputId}-loading`} data-loading={String(Boolean(isLoading))}>
      {(optionsList ?? []).map((option) => (
        <button
          type="button"
          key={option.value}
          data-testid={`${inputId}-${option.value}`}
          onClick={() => onChangeHandler(option)}
        >
          {option.value}
        </button>
      ))}
    </span>
  );
});

const { DataMenuControls } = require('features/DataStream/components/forecast/dataMenu');

const prefixOf = (url) => decodeURIComponent(new URL(url).searchParams.get('prefix'));

// Distinct dated runs per model, so the store's date list says which chain wrote last.
const DATES = { slow: ['ngen.20260101'], fast: ['ngen.20260202'] };

let releaseSlow;

beforeEach(() => {
  releaseSlow = null;
  useS3DataStreamBucketStore.setState({
    models: [{ value: 'slow', label: 'slow' }, { value: 'fast', label: 'fast' }],
    dates: [], forecasts: [], cycles: [], ensembles: [], outputFiles: [],
  });

  global.fetch = jest.fn((url) => {
    const prefix = prefixOf(url);
    const model = prefix.split('/')[1];
    const xml = (inner) => ({
      ok: true, status: 200, statusText: 'OK',
      text: async () => `<?xml version="1.0"?><ListBucketResult>${inner}</ListBucketResult>`,
    });
    const body = () => {
      if (!new URL(url).searchParams.has('delimiter')) {
        return xml(`<Contents><Key>${prefix}f/c/VPU_16/ngen-run/outputs/troute/o.parquet</Key></Contents>`);
      }
      const children = prefix.endsWith('v2.2_hydrofabric/') ? DATES[model] : ['aa', 'bb'];
      return xml(children.map((c) => `<CommonPrefixes><Prefix>${prefix}${c}/</Prefix></CommonPrefixes>`).join(''));
    };
    // Only the slow model's first request waits; the rest of its chain runs normally afterwards.
    if (model === 'slow' && !releaseSlow) {
      return new Promise((resolve) => { releaseSlow = () => resolve(body()); });
    }
    return Promise.resolve(body());
  });
});

it('lets the second model switch win when the first is still in flight', async () => {
  render(<DataMenuControls />);

  await act(async () => {
    screen.getByTestId('select-model-slow').click();
  });
  await act(async () => {
    screen.getByTestId('select-model-fast').click();
  });
  await act(async () => {
    releaseSlow();
  });

  expect(useS3DataStreamBucketStore.getState().dates.map((d) => d.value))
    .toEqual(['ngen.20260202']);
});

/**
 * Leaving a vpu invalidates the chain as well. Every listing a chain is midway through is for
 * the vpu being left, and its output-file answer would otherwise arrive after the move and
 * describe somewhere the user is no longer looking.
 */
it('drops a chain left behind by a vpu change', async () => {
  useDataStreamStore.getState().set_vpu('VPU_16');
  render(<DataMenuControls />);

  await act(async () => {
    screen.getByTestId('select-model-slow').click();
  });
  act(() => {
    useDataStreamStore.getState().set_vpu('VPU_02');
  });
  await act(async () => {
    releaseSlow();
  });

  expect(useS3DataStreamBucketStore.getState().dates).toEqual([]);
});

/**
 * The controls say they are working while a chain runs, and the Update button refuses.
 *
 * A chain is up to a dozen sequential requests. Without this the selects sit inert and the
 * app reads as broken; worse, Update stayed pressable against a half-built selection -- a new
 * model with the previous model's date still under it, which would have loaded and charted a
 * combination the user never chose.
 */
it('shows the controls working while a chain runs, and refuses Update until it ends', async () => {
  render(<DataMenuControls />);

  await act(async () => {
    screen.getByTestId('select-model-slow').click();
  });

  expect(screen.getByTestId('select-model-loading')).toHaveAttribute('data-loading', 'true');
  expect(screen.getByRole('button', { name: /update/i })).toBeDisabled();

  await act(async () => {
    releaseSlow();
  });

  expect(screen.getByTestId('select-model-loading')).toHaveAttribute('data-loading', 'false');
});
