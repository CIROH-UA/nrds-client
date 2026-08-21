/**
 * Changing vpu left the old one's animation running.
 *
 * The reset lived at the end of loadVpu, which only gets there after the s3 listing chain
 * resolves. Clicking a catchment in another vpu while playback was running therefore stepped the
 * arrays of the vpu just left for several seconds, under a title and controls that had already
 * moved on. Whoever changes the vpu knows it changed, so it happens there.
 */
const useDataStreamStore = require('features/DataStream/store/Datastream').default;
const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;
const { useVPUStore } = require('features/DataStream/store/Layers');

const initial = {
  ds: useDataStreamStore.getState(),
  ts: useTimeSeriesStore.getState(),
  vpu: useVPUStore.getState(),
};

const playing = () => {
  useVPUStore.getState().setAnimationIndex(['cat-1'], ['t0', 't1']);
  useVPUStore.getState().setVarData('flow', Float32Array.from([1, 2]));
  useTimeSeriesStore.setState({ isPlaying: true, currentTimeIndex: 1 });
  useDataStreamStore.setState({ vpu: 'VPU_16' });
};

beforeEach(() => {
  useDataStreamStore.setState(initial.ds, true);
  useTimeSeriesStore.setState(initial.ts, true);
  useVPUStore.setState(initial.vpu, true);
});

describe('moving to another vpu', () => {
  it('stops playback there and then, not when the next load finishes', () => {
    playing();

    useDataStreamStore.getState().set_vpu('VPU_10L');

    expect(useTimeSeriesStore.getState().isPlaying).toBe(false);
  });

  it('drops the arrays the animation was reading', () => {
    playing();

    useDataStreamStore.getState().set_vpu('VPU_10L');

    expect(useVPUStore.getState().times).toEqual([]);
    expect(Object.keys(useVPUStore.getState().valuesByVar)).toEqual([]);
  });

  it('leaves a running animation alone when the vpu has not changed', () => {
    playing();

    // Every map click calls this with the vpu it is already on.
    useDataStreamStore.getState().set_vpu('VPU_16');

    expect(useTimeSeriesStore.getState().isPlaying).toBe(true);
    expect(useVPUStore.getState().times).toHaveLength(2);
  });
});
