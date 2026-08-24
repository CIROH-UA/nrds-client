/**
 * Closing the panel is not the same as leaving the vpu.
 *
 * Closing used to call resetVPU, which drops valuesByVar, times, featureIds and featureIdToIndex
 * -- the whole animation dataset. An empty clock makes animationIsOnMap false, so the slider
 * unmounted and playback stopped, and reopening cost a full loadVpu. On a phone the only way to
 * see the map unobstructed was to close the sheet, and closing it turned off the thing worth
 * watching.
 *
 * Leaving the vpu still tears it down: set_vpu calls leaveCurrentVpu on an actual change, which
 * is where that belongs.
 */
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useVPUStore } from 'features/DataStream/store/VPU';

jest.mock('features/DataStream/components/forecast/dataMenu', () => function DataMenu() { return <div />; });
jest.mock('features/DataStream/components/forecast/TimeseriesCard', () => function Card() { return <div />; });
jest.mock('features/DataStream/components/forecast/variablesMenu', () => function Variables() { return <div />; });

const HOUR = 3600000;
const loadedVpu = () => {
  useVPUStore.setState({
    featureIds: ['wb-1', 'wb-2'],
    times: [1787364000000, 1787364000000 + HOUR],
    featureIdToIndex: { 'wb-1': 0, 'wb-2': 1 },
    valuesByVar: { flow: new Float32Array([1, 2, 3, 4]) },
    varDataOrder: ['flow'],
  });
};

const initial = {
  ts: useTimeSeriesStore.getState(),
  vpu: useVPUStore.getState(),
  ds: useDataStreamStore.getState(),
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useVPUStore.setState(initial.vpu, true);
  useDataStreamStore.setState(initial.ds, true);
});

describe('the panel\'s clear control', () => {
  const { render, screen, fireEvent } = require('@testing-library/react');
  const ForecastMenu = require('features/DataStream/components/menus/ForecastMenu').default;

  it('keeps the vpu loaded so the animation carries on', () => {
    loadedVpu();
    useTimeSeriesStore.setState({
      feature_id: 'wb-1', variable: 'flow', layout: { title: 'Cat 1', subtitle: '' },
    });
    render(<ForecastMenu />);

    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));

    expect(useVPUStore.getState().times).toHaveLength(2);
    expect(useVPUStore.getState().valuesByVar.flow).toHaveLength(4);
    expect(useTimeSeriesStore.getState().feature_id).toBeNull();
  });
});

describe('clearing the selection', () => {
  it('keeps the variable, which is what the animation is coloured by', () => {
    // Mapg reads s.valuesByVar[variable]. Blanking the variable leaves the data in the store and
    // nothing on the map, which is the same dead animation by another route.
    loadedVpu();
    useTimeSeriesStore.setState({ feature_id: 'wb-1', variable: 'flow' });

    useTimeSeriesStore.getState().reset();

    expect(useTimeSeriesStore.getState().variable).toBe('flow');
  });

  it('leaves playback and the clock where the reader had them', () => {
    loadedVpu();
    useTimeSeriesStore.setState({ feature_id: 'wb-1', variable: 'flow', currentTimeIndex: 1, isPlaying: true });

    useTimeSeriesStore.getState().reset();

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(1);
    expect(useTimeSeriesStore.getState().isPlaying).toBe(true);
  });

  it('still closes the panel and drops the chart', () => {
    loadedVpu();
    useTimeSeriesStore.setState({
      feature_id: 'wb-1', variable: 'flow',
      series: [{ x: 1, y: 1 }], last_loaded_key: 'k', last_error: { kind: 'x' },
    });

    useTimeSeriesStore.getState().reset();

    const s = useTimeSeriesStore.getState();
    expect(s.feature_id).toBeNull();
    expect(s.series).toHaveLength(0);
    expect(s.last_loaded_key).toBeNull();
    expect(s.last_error).toBeNull();
  });
});

describe('leaving the vpu', () => {
  it('still drops the animation', () => {
    loadedVpu();
    useDataStreamStore.setState({ vpu: 'VPU_01' });

    useDataStreamStore.getState().set_vpu('VPU_16');

    expect(useVPUStore.getState().times).toHaveLength(0);
    expect(useVPUStore.getState().valuesByVar).toEqual({});
  });

  it('does nothing when the vpu has not actually changed', () => {
    loadedVpu();
    useDataStreamStore.setState({ vpu: 'VPU_01' });

    useDataStreamStore.getState().set_vpu('VPU_01');

    expect(useVPUStore.getState().times).toHaveLength(2);
  });
});

/**
 * A second selection inside the same vpu does not stop the animation.
 *
 * The animation belongs to the vpu, not to the catchment being charted, so it ends when the vpu's
 * data is cleared and not before. loadTimeseries calls reset_series on every selection, which used
 * to zero the clock and stop playback -- so minimising the sheet to watch the map and then tapping
 * another catchment to compare froze the map and rewound it, which is the one workflow the
 * collapse exists to enable.
 */
describe('charting a second feature', () => {
  it('leaves the clock and playback alone while the vpu is still loaded', () => {
    loadedVpu();
    useTimeSeriesStore.setState({ feature_id: 'wb-1', currentTimeIndex: 30, isPlaying: true });

    useTimeSeriesStore.getState().reset_series();

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(30);
    expect(useTimeSeriesStore.getState().isPlaying).toBe(true);
  });

  it('still clears the chart it is replacing', () => {
    loadedVpu();
    useTimeSeriesStore.setState({ series: [{ x: 1, y: 1 }], last_loaded_key: 'k' });

    useTimeSeriesStore.getState().reset_series();

    expect(useTimeSeriesStore.getState().series).toHaveLength(0);
    expect(useTimeSeriesStore.getState().last_loaded_key).toBeNull();
  });

  it('rewinds and stops once the vpu clock is gone', () => {
    // Leaving the vpu is what ends the animation, and that is where the reset belongs.
    useVPUStore.setState({ times: [], valuesByVar: {}, featureIds: [] });
    useTimeSeriesStore.setState({ currentTimeIndex: 30, isPlaying: true });

    useTimeSeriesStore.getState().reset_series();

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(0);
    expect(useTimeSeriesStore.getState().isPlaying).toBe(false);
  });
});
