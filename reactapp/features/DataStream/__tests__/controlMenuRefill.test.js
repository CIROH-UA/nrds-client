/**
 * Refill states in the unified ControlMenu's run cascade (U4 point 2 / review finding D5).
 *
 * A run selection kicks off a chain of dependent S3 listings. Until that chain finishes, the
 * dependent dropdowns either hold options for the selection being replaced (stale) or none yet,
 * so a pick against them would load a run the reader never chose. The menu disables every
 * dependent dropdown and shows it loading while the chain runs, so it cannot be selected against;
 * the top-level Model stays live so a second switch can still supersede the first. This is wired
 * off the same `selecting`/`beginSelection` signal the cascade already uses -- not a parallel one.
 */
import { act, render, screen } from '@testing-library/react';

import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import useDataStreamStore from 'features/DataStream/store/Datastream';

jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({ terminateDatabase: jest.fn() }));
jest.mock('features/DataStream/lib/s3Utils', () => ({
  ...jest.requireActual('features/DataStream/lib/s3Utils'),
  getOptionsFromURL: jest.fn(async () => []),
  makePrefix: () => 'prefix/',
  readableDatesNewestFirst: jest.fn(),
}));

/* eslint-disable react/prop-types -- a test stand-in, not a real component. */
jest.mock('features/DataStream/components/SelectComponent', () => function SelectComponent({
  inputId, optionsList, onChangeHandler, isLoading, isDisabled,
}) {
  return (
    <span
      data-testid={`${inputId}-select`}
      data-loading={String(Boolean(isLoading))}
      data-disabled={String(Boolean(isDisabled))}
    >
      {!isDisabled &&
        (optionsList ?? []).map((option) => (
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

const { readableDatesNewestFirst, getOptionsFromURL } = require('features/DataStream/lib/s3Utils');
const { ControlMenu } = require('features/DataStream/components/menus/ControlMenu');

const s3Initial = useS3DataStreamBucketStore.getState();
const dsInitial = useDataStreamStore.getState();

let releaseSlow;

beforeEach(() => {
  useS3DataStreamBucketStore.setState(s3Initial, true);
  useDataStreamStore.setState(dsInitial, true);
  releaseSlow = null;

  getOptionsFromURL.mockResolvedValue([]);

  readableDatesNewestFirst.mockImplementation((model) => {
    if (model === 'slow') {
      return new Promise((resolve) => {
        releaseSlow = () => resolve([{ value: 'slow-date', label: 'slow-date' }]);
      });
    }
    return Promise.resolve([{ value: 'fast-date', label: 'fast-date' }]);
  });

  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: query.includes('min-width: 769px'),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
});

afterEach(() => { delete window.matchMedia; });

describe('while the dependent options refill', () => {
  beforeEach(() => {
    useS3DataStreamBucketStore.setState({
      models: [{ value: 'slow', label: 'slow' }, { value: 'fast', label: 'fast' }],
      dates: [{ value: 'old-date', label: 'old-date' }],
      forecasts: [{ value: 'old-fc', label: 'old-fc' }],
    });
  });

  it('disables the dependent dropdowns and shows them loading, but not Model', async () => {
    render(<ControlMenu />);

    await act(async () => {
      screen.getByTestId('select-model-slow').click();
    });

    expect(screen.getByTestId('select-model-select')).toHaveAttribute('data-disabled', 'false');

    const date = screen.getByTestId('select-date-select');
    expect(date).toHaveAttribute('data-disabled', 'true');
    expect(date).toHaveAttribute('data-loading', 'true');
    expect(screen.getByTestId('select-forecast-select')).toHaveAttribute('data-disabled', 'true');

    await act(async () => { releaseSlow(); });
  });

  it('renders no option to select against on a disabled dropdown', async () => {
    render(<ControlMenu />);

    await act(async () => {
      screen.getByTestId('select-model-slow').click();
    });

    expect(screen.queryByTestId('select-date-old-date')).not.toBeInTheDocument();

    await act(async () => { releaseSlow(); });
  });

  it('re-enables the dropdowns once the chain finishes', async () => {
    render(<ControlMenu />);

    await act(async () => {
      screen.getByTestId('select-model-slow').click();
    });
    await act(async () => { releaseSlow(); });

    expect(screen.getByTestId('select-date-select')).toHaveAttribute('data-disabled', 'false');
    expect(screen.getByTestId('select-date-select')).toHaveAttribute('data-loading', 'false');
  });
});

describe('a superseded selection', () => {
  beforeEach(() => {
    useS3DataStreamBucketStore.setState({
      models: [{ value: 'slow', label: 'slow' }, { value: 'fast', label: 'fast' }],
      dates: [], forecasts: [], cycles: [], ensembles: [], outputFiles: [],
    });
  });

  it('is dropped when a later switch overtakes it', async () => {
    render(<ControlMenu />);

    await act(async () => {
      screen.getByTestId('select-model-slow').click();
    });
    await act(async () => {
      screen.getByTestId('select-model-fast').click();
    });
    await act(async () => { releaseSlow(); });

    expect(useS3DataStreamBucketStore.getState().dates.map((d) => d.value)).toEqual(['fast-date']);
  });
});
