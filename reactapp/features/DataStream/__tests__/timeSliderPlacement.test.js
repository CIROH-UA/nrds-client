/**
 * The time slider is a map control now, not a panel one.
 *
 * It drives the animation, so it belongs beside it rather than in a panel the reader has to look
 * away to reach — and the panel only opens when a feature is selected, while the animation runs
 * whenever a vpu is loaded.
 *
 * Only half of the move is testable here. That the slider renders inside the map is verified in
 * a browser: no test in this repo mounts Mapg, because doing so constructs a maplibregl.Map and
 * asks the canvas for a WebGL context that jsdom does not provide. Every map test drives an
 * extracted function against a fake map instead. Adding a render(<MainMap />) here would fail at
 * map construction rather than at any assertion, so this covers what the panel does and what the
 * slider does on its own.
 */
import { render, screen } from '@testing-library/react';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { TimeSlider } from 'features/DataStream/components/forecast/TimeSlider';

jest.mock('features/DataStream/components/forecast/dataMenu', () => function DataMenu() {
  return <div data-testid="data-menu" />;
});
jest.mock('features/DataStream/components/forecast/TimeseriesCard', () => function Card() {
  return <div data-testid="timeseries-card" />;
});
jest.mock('features/DataStream/components/forecast/variablesMenu', () => function Variables() {
  return <div data-testid="variables-menu" />;
});

const ForecastMenu = require('features/DataStream/components/menus/ForecastMenu').default;

const initial = {
  ts: useTimeSeriesStore.getState(),
  vpu: useVPUStore.getState(),
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useVPUStore.setState(initial.vpu, true);
});

describe('the side panel', () => {
  it('no longer carries the time slider', () => {
    // The panel opens on a selected feature, so give it one.
    useTimeSeriesStore.setState({ feature_id: 'cat-7' });

    render(<ForecastMenu />);

    // By role, not by id: the id would still pass if the control were rendered unreachable.
    expect(screen.queryByRole('slider', { name: /animation time/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play the animation/i })).not.toBeInTheDocument();
  });

  it('still carries the variables menu that shared its block', () => {
    // That block held both. Removing one should not have taken the other with it.
    useTimeSeriesStore.setState({ feature_id: 'cat-7' });

    render(<ForecastMenu />);

    expect(screen.getByTestId('variables-menu')).toBeInTheDocument();
  });
});

describe('the slider on the map', () => {
  it('stays present and disabled when the clock is empty', () => {
    // Not absent. It is the only control that scrubs time, and one that vanishes whenever a load
    // empties the clock reads as breakage rather than as context.
    useVPUStore.setState({ times: [] });

    render(<TimeSlider />);

    expect(screen.getByRole('slider', { name: /animation time/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /play the animation/i })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /playback speed/i })).toBeDisabled();
  });

  it('enables itself once the animation has a clock', () => {
    useVPUStore.setState({ times: [1787364000000, 1787367600000] });

    render(<TimeSlider />);

    expect(screen.getByRole('slider', { name: /animation time/i })).not.toBeDisabled();
  });
});
