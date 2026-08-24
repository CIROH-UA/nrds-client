/**
 * The time cursor runs on the animation's clock, not the chart's.
 *
 * currentTimeIndex drives both the map animation and the chart cursor, but only the chart's
 * series depends on a feature being selected. With nothing selected the series is empty, so
 * bounding the index by it made every mutator return early: the slider would report the
 * animation's full length and then refuse to move a single step. The series stays as the
 * fallback for a chart with no animation behind it.
 */
import { render, screen } from '@testing-library/react';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { TimeSlider } from 'features/DataStream/components/forecast/TimeSlider';

const HOUR = 3600000;
const T0 = 1787364000000;
// What duckdb hands back for this column: epoch milliseconds, an hour apart.
const times = (n) => Array.from({ length: n }, (_, i) => T0 + i * HOUR);

const initial = {
  ts: useTimeSeriesStore.getState(),
  vpu: useVPUStore.getState(),
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useVPUStore.setState(initial.vpu, true);
});

describe('the index bounds', () => {
  it('steps through the animation with no feature selected', () => {
    // The case R3 exists for, and the one that could not work before: series is empty here.
    useVPUStore.setState({ times: times(24) });
    useTimeSeriesStore.setState({ series: [], currentTimeIndex: 0 });

    useTimeSeriesStore.getState().stepForward();

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(1);
  });

  it('wraps at the end of the animation, not the end of the series', () => {
    useVPUStore.setState({ times: times(24) });
    useTimeSeriesStore.setState({ series: [], currentTimeIndex: 23 });

    useTimeSeriesStore.getState().stepForward();

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(0);
  });

  it('steps backward from the start to the last animation frame', () => {
    useVPUStore.setState({ times: times(24) });
    useTimeSeriesStore.setState({ series: [], currentTimeIndex: 0 });

    useTimeSeriesStore.getState().stepBackward();

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(23);
  });

  it('lets the scrub reach the last animation frame', () => {
    useVPUStore.setState({ times: times(24) });
    useTimeSeriesStore.setState({ series: [], currentTimeIndex: 0 });

    useTimeSeriesStore.getState().setCurrentTimeIndex(23);

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(23);
  });

  it('clamps past the end rather than running off it', () => {
    useVPUStore.setState({ times: times(24) });
    useTimeSeriesStore.setState({ series: [], currentTimeIndex: 0 });

    useTimeSeriesStore.getState().setCurrentTimeIndex(99);

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(23);
  });

  /**
   * The fourth clamp. stepForward, stepBackward and setCurrentTimeIndex all moved onto the
   * animation's length; set_series kept bounding on the chart's. Selecting a feature whose rows
   * stop short of the vpu's forecast horizon then rewound the clock the map runs on, which is
   * the one thing decoupling the two was for.
   */
  it('does not rewind the animation when a short series is charted', () => {
    useVPUStore.setState({ times: times(24) });
    useTimeSeriesStore.setState({ currentTimeIndex: 20 });

    useTimeSeriesStore.getState().set_series([{ x: 1, y: 1 }, { x: 2, y: 2 }]);

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(20);
  });

  it('still clamps to the series when there is no animation', () => {
    useVPUStore.setState({ times: [] });
    useTimeSeriesStore.setState({ currentTimeIndex: 20 });

    useTimeSeriesStore.getState().set_series([{ x: 1, y: 1 }, { x: 2, y: 2 }]);

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(1);
  });

  it('falls back to the series when no animation is loaded', () => {
    // A chart on its own still steps, which is how this behaved before the map had a clock.
    useVPUStore.setState({ times: [] });
    useTimeSeriesStore.setState({ series: [{ x: 1, y: 1 }, { x: 2, y: 2 }], currentTimeIndex: 0 });

    useTimeSeriesStore.getState().stepForward();

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(1);
  });

  it('does not move when there is neither', () => {
    useVPUStore.setState({ times: [] });
    useTimeSeriesStore.setState({ series: [], currentTimeIndex: 0 });

    useTimeSeriesStore.getState().stepForward();
    useTimeSeriesStore.getState().stepBackward();

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(0);
  });
});

describe('the slider', () => {
  it('offers the animation length and enables its controls with nothing selected', () => {
    useVPUStore.setState({ times: times(24) });
    useTimeSeriesStore.setState({ series: [], currentTimeIndex: 0 });

    render(<TimeSlider />);

    const scrub = screen.getByRole('slider', { name: /animation time/i });
    expect(scrub).toHaveAttribute('max', '23');
    expect(scrub).not.toBeDisabled();
  });

  it("labels the frame with its own time, not its offset from the start", () => {
    // "T+5h" only helps a reader who already knows when the cycle began, and the question is
    // usually the other way round: what time is this frame.
    useVPUStore.setState({ times: times(24) });
    useTimeSeriesStore.setState({ series: [], currentTimeIndex: 5 });

    render(<TimeSlider />);

    expect(screen.getByText('2026-08-22 07:00 UTC')).toBeInTheDocument();
  });

  it('says nothing rather than reading past the end of an empty list', () => {
    useVPUStore.setState({ times: [] });
    useTimeSeriesStore.setState({ series: [], currentTimeIndex: 0 });

    render(<TimeSlider />);

    expect(screen.getByRole('slider', { name: /animation time/i })).toBeDisabled();
  });
});

/**
 * Playback stops when there is nothing left to play.
 *
 * Every path that tears the animation down through resetVPU calls reset_series, which clears
 * isPlaying. Hiding the flowpaths layer is the one that does not: it takes the animation off the
 * map and unmounts the slider without touching any of it, so playback resumed by itself the
 * moment the layer came back.
 */
describe('stopping playback', () => {
  const { useLayersStore } = require('features/DataStream/store/Layers');

  it('stops when the flowpaths layer is hidden', () => {
    useVPUStore.setState({ times: times(24) });
    useLayersStore.getState().set_flowpaths_visibility(true);
    useTimeSeriesStore.setState({ isPlaying: true });

    useLayersStore.getState().set_flowpaths_visibility(false);

    expect(useTimeSeriesStore.getState().isPlaying).toBe(false);
  });

  it('stops when the clock empties', () => {
    useVPUStore.setState({ times: times(24) });
    useLayersStore.getState().set_flowpaths_visibility(true);
    useTimeSeriesStore.setState({ isPlaying: true });

    useVPUStore.getState().resetVPU();

    expect(useTimeSeriesStore.getState().isPlaying).toBe(false);
  });

  it('leaves playback alone while there is still something to play', () => {
    useVPUStore.setState({ times: times(24) });
    useLayersStore.getState().set_flowpaths_visibility(true);
    useTimeSeriesStore.setState({ isPlaying: true });

    useVPUStore.setState({ times: times(12) });

    expect(useTimeSeriesStore.getState().isPlaying).toBe(true);
  });
});

/**
 * The frame's timestamp.
 *
 * Rendered in UTC on purpose. Forecast cycles are named in UTC -- ngen.20260822 cycle 00 -- and
 * showing frames in the reader's own timezone would quietly shift every one of them away from
 * the cycle it belongs to, which is the one number they are most likely to be checking against.
 */
describe('formatFrameTime', () => {
  const { formatFrameTime } = require('features/DataStream/lib/utils');

  it('reads epoch milliseconds, which is what duckdb hands back', () => {
    expect(formatFrameTime(T0)).toBe('2026-08-22 02:00 UTC');
  });

  it('tolerates a Date, which is what the chart series carries', () => {
    expect(formatFrameTime(new Date(T0))).toBe('2026-08-22 02:00 UTC');
  });

  it('does not drift with the machine it renders on', () => {
    // The same instant, whatever the reader's offset. A local-time render would move a 00 cycle
    // frame onto the previous day for anyone west of Greenwich.
    expect(formatFrameTime(1787364000000)).toContain('UTC');
    expect(formatFrameTime(1787364000000)).toBe('2026-08-22 02:00 UTC');
  });

  it('pads, so the column does not jump between single and double digits', () => {
    expect(formatFrameTime(Date.UTC(2026, 0, 5, 9, 7))).toBe('2026-01-05 09:07 UTC');
  });

  it('says nothing for a time it cannot read', () => {
    // An empty label is a gap; "Invalid Date" is a bug report shown to the reader.
    expect(formatFrameTime(undefined)).toBe('');
    expect(formatFrameTime(null)).toBe('');
    expect(formatFrameTime(NaN)).toBe('');
    expect(formatFrameTime('not a time')).toBe('');
  });
});
