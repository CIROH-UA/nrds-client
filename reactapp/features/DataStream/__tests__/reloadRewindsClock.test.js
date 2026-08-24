/**
 * Reloading the same vpu has to rewind the clock.
 *
 * reset_series keeps the clock when the VPU store still holds times, so that closing the panel
 * leaves the animation running. loadVpu called it before resetVPU, so on a reload the check read
 * the outgoing run's times, concluded an animation was live, and kept currentTimeIndex. Nothing
 * re-clamps that index until set_series lands at the end of the load, and the layers read it raw
 * -- so a shorter run drew a neighbouring reach's values until the query returned.
 *
 * The teardown has to happen before the question is asked. noOutputFile already ordered it that
 * way.
 */
jest.mock('features/DataStream/lib/queryData', () => ({
  checkForTable: jest.fn(),
  loadVpuData: jest.fn(),
  getFeatureIDs: jest.fn(),
  getVariables: jest.fn(),
  getDistinctFeatureIds: jest.fn(),
  getDistinctTimes: jest.fn(),
  getVpuVariableFlat: jest.fn(),
}));
jest.mock('features/DataStream/actions/loadTimeseries', () => ({ loadTimeseries: jest.fn() }));

const { checkForTable } = require('features/DataStream/lib/queryData');
const useDataStreamStore = require('features/DataStream/store/Datastream').default;
const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;
const { useVPUStore } = require('features/DataStream/store/VPU');
const { loadVpu } = require('features/DataStream/actions/loadVpu');

const initial = {
  ds: useDataStreamStore.getState(),
  ts: useTimeSeriesStore.getState(),
  vpu: useVPUStore.getState(),
};

const advancedIntoALoadedRun = () => {
  useVPUStore.getState().setAnimationIndex(['cat-1'], ['t0', 't1', 't2', 't3']);
  useVPUStore.getState().setVarData('flow', Float32Array.from([1, 2, 3, 4]));
  useTimeSeriesStore.setState({ isPlaying: true, currentTimeIndex: 3 });
  useDataStreamStore.setState({ vpu: 'VPU_16', cache_key: 'VPU_16/medium_range' });
};

beforeEach(() => {
  require('features/DataStream/actions/loadState').resetLoadState();
  useDataStreamStore.setState(initial.ds, true);
  useTimeSeriesStore.setState(initial.ts, true);
  useVPUStore.setState(initial.vpu, true);
  checkForTable.mockReset();
});

describe('reloading a vpu while the animation is advanced', () => {
  it('rewinds the clock instead of carrying the old index into the new run', async () => {
    advancedIntoALoadedRun();
    checkForTable.mockImplementation(() => {
      expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(0);
      throw new Error('stop here; the reset has already been observed');
    });

    await loadVpu();

    expect(useTimeSeriesStore.getState().currentTimeIndex).toBe(0);
    expect(useTimeSeriesStore.getState().isPlaying).toBe(false);
  });

  it('clears the outgoing run before asking whether one is playing', async () => {
    advancedIntoALoadedRun();
    const real = useTimeSeriesStore.getState().reset_series;
    let timesWhenAsked = null;
    useTimeSeriesStore.setState({
      reset_series: () => {
        timesWhenAsked = useVPUStore.getState().times.length;
        return real();
      },
    });
    checkForTable.mockImplementation(() => { throw new Error('stop here'); });

    await loadVpu();

    expect(timesWhenAsked).toBe(0);
  });
});
