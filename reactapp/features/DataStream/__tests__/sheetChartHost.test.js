/**
 * The chart moved onto the feature: an anchored popup hosts it on desktop, so the desktop
 * ForecastMenu sidebar no longer carries the plot. The sheet is still the chart host on mobile,
 * so ForecastMenu renders the plot only at the sheet breakpoint. Everything else the panel
 * carries -- the header, the variable picker, the run controls -- stays.
 */
import { render, screen } from '@testing-library/react';

jest.mock('features/DataStream/components/forecast/TimeseriesCard', () =>
  function Card() { return <div data-testid="timeseries-card" />; });
jest.mock('features/DataStream/components/forecast/dataMenu', () =>
  function DataMenu() { return <div data-testid="data-menu" />; });
jest.mock('features/DataStream/components/forecast/variablesMenu', () =>
  function VariablesMenu() { return <div data-testid="variables-menu" />; });

const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;
const ForecastMenu = require('features/DataStream/components/menus/ForecastMenu').default;

let matches = false;
beforeAll(() => {
  window.matchMedia = (query) => ({
    get matches() { return matches; },
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

const initial = useTimeSeriesStore.getState();
beforeEach(() => {
  useTimeSeriesStore.setState(initial, true);
  useTimeSeriesStore.setState({ feature_id: 'cat-7', layout: { title: 'Cat 7', subtitle: '' } });
  matches = false;
});

describe('the desktop sidebar', () => {
  it('no longer carries the plot, because the popup does', () => {
    matches = false;
    render(<ForecastMenu />);

    expect(screen.queryByTestId('timeseries-card')).not.toBeInTheDocument();
  });

  it('still keeps the variable picker', () => {
    matches = false;
    render(<ForecastMenu />);

    expect(screen.getByTestId('variables-menu')).toBeInTheDocument();
  });
});

describe('the mobile sheet', () => {
  it('is still the chart host', () => {
    matches = true;
    render(<ForecastMenu />);

    expect(screen.getByTestId('timeseries-card')).toBeInTheDocument();
  });

  it('still writes the sheet geometry attribute it owns', () => {
    matches = true;
    render(<ForecastMenu />);

    expect(document.body.dataset.sheet).toBe('expanded');
  });
});
