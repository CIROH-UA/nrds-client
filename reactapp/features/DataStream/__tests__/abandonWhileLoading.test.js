/**
 * Reaching a dead end by changing a control did not disown the load already running.
 *
 * Leaving a vpu does: set_vpu bumps the vpu generation, so a load fetching the vpu being left
 * stops writing. Arriving at "there is nothing to read here" through a control change is the same
 * situation and had no such bump, so the load ran on and wrote its animation arrays in behind the
 * refusal -- the class of race fixed once already for the cache clear and once for the vpu
 * switch, on a third path.
 *
 * In its own file because noOutputFile.test.js mocks loadVpu away, and this needs the real one.
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

const queryData = require('features/DataStream/lib/queryData');
const { loadVpu } = require('features/DataStream/actions/loadVpu');
const { abandonSelectionWithNoOutput } = require('features/DataStream/actions/noOutputFile');
const { resetLoadState } = require('features/DataStream/actions/loadState');
const useDataStreamStore = require('features/DataStream/store/Datastream').default;
const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;
const useS3Store = require('features/DataStream/store/s3Store').default;
const { useFeatureStore } = require('features/DataStream/store/Layers');
const { useVPUStore } = require('features/DataStream/store/VPU');

const initial = {
  ds: useDataStreamStore.getState(),
  ts: useTimeSeriesStore.getState(),
  vpu: useVPUStore.getState(),
  fs: useFeatureStore.getState(),
  s3: useS3Store.getState(),
};

beforeEach(() => {
  resetLoadState();
  useDataStreamStore.setState(initial.ds, true);
  useTimeSeriesStore.setState(initial.ts, true);
  useVPUStore.setState(initial.vpu, true);
  useFeatureStore.setState(initial.fs, true);
  useS3Store.setState(initial.s3, true);
  queryData.loadVpuData.mockResolvedValue('6.2 MB');
  queryData.getFeatureIDs.mockResolvedValue(['cat-1']);
  queryData.getVariables.mockResolvedValue(['flow']);
  queryData.getDistinctFeatureIds.mockResolvedValue(['cat-1']);
  queryData.getDistinctTimes.mockResolvedValue(['t0', 't1']);
  queryData.getVpuVariableFlat.mockResolvedValue(Float32Array.from([5, 5]));
});

describe('abandoning a selection while a load is in flight', () => {
  it('the load cannot come back with data for a selection that has none', async () => {
    let releaseCheck;
    queryData.checkForTable.mockImplementation(() => new Promise((r) => { releaseCheck = r; }));
    useDataStreamStore.setState({ cache_key: 'a.parquet', vpu: 'VPU_16' });
    useS3Store.setState({ prefix: 'outputs/' });
    useFeatureStore.setState({ selected_feature: { _id: 'cat-1' } });

    const inFlight = loadVpu();
    await Promise.resolve();
    abandonSelectionWithNoOutput();
    releaseCheck(false);
    await inFlight;

    expect(useVPUStore.getState().times).toEqual([]);
    expect(useTimeSeriesStore.getState().last_error).toEqual({ kind: 'no-output-file' });
  });
});
