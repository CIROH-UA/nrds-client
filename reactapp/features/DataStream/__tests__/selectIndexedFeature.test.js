/**
 * Selecting a feature the hydrofabric index has to name.
 *
 * The search box has an id and nothing else: no position, and no vpu to load it from. The index
 * is what supplies both, and these pin what follows from a hit, a miss, and an id the index
 * knows by a different name than the one that was asked for.
 */
import { selectIndexedFeature } from 'features/DataStream/actions/selectIndexedFeature';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { useVPUStore } from 'features/DataStream/store/VPU';

jest.mock('features/DataStream/lib/queryData', () => ({ getFeatureProperties: jest.fn() }));
jest.mock('features/DataStream/actions/loadTimeseries', () => ({ loadTimeseries: jest.fn() }));
jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));
jest.mock('features/DataStream/actions/loadState', () => ({
  ...jest.requireActual('features/DataStream/actions/loadState'),
  vpuLoadInFlight: jest.fn(() => false),
}));

const { getFeatureProperties } = require('features/DataStream/lib/queryData');
const { loadTimeseries } = require('features/DataStream/actions/loadTimeseries');
const { loadVpu } = require('features/DataStream/actions/loadVpu');
const { vpuLoadInFlight } = require('features/DataStream/actions/loadState');

const initial = {
  ds: useDataStreamStore.getState(),
  fs: useFeatureStore.getState(),
  vpu: useVPUStore.getState(),
};

beforeEach(() => {
  useDataStreamStore.setState(initial.ds, true);
  useFeatureStore.setState(initial.fs, true);
  useVPUStore.setState(initial.vpu, true);
  vpuLoadInFlight.mockReturnValue(false);
  loadTimeseries.mockResolvedValue(undefined);
  loadVpu.mockResolvedValue(undefined);
});

it('names the vpu from the index, which the caller has no other way to know', async () => {
  useDataStreamStore.setState({ vpu: 'VPU_01' });
  getFeatureProperties.mockResolvedValue([{ id: 'cat-7', vpuid: '16', lon: -111, lat: 40 }]);

  const matched = await selectIndexedFeature(['cat-7']);

  expect(matched).toBe('cat-7');
  expect(useDataStreamStore.getState().vpu).toBe('VPU_16');
  expect(useFeatureStore.getState().selected_feature).toMatchObject({ _id: 'cat-7' });
});

it('selects the id the index holds, not the one asked for', async () => {
  // Searching a bare number offers several candidates; the index decides which one exists.
  getFeatureProperties.mockResolvedValue([{ id: 'cat-2884494', vpuid: '01' }]);

  const matched = await selectIndexedFeature(['cat-2884494', 'wb-2884494', '2884494']);

  expect(matched).toBe('cat-2884494');
});

it('charts straight away only when the vpu is already loaded', async () => {
  // Switching vpu starts a load that charts the selection when it finishes, so charting here as
  // well would draw the same series twice.
  useDataStreamStore.setState({ vpu: 'VPU_16' });
  getFeatureProperties.mockResolvedValue([{ id: 'cat-7', vpuid: '16' }]);

  await selectIndexedFeature(['cat-7']);

  expect(loadTimeseries).toHaveBeenCalledWith({ featureId: 'cat-7' });
});

it('does not chart when the match is in another vpu', async () => {
  useDataStreamStore.setState({ vpu: 'VPU_01' });
  getFeatureProperties.mockResolvedValue([{ id: 'cat-7', vpuid: '16' }]);

  await selectIndexedFeature(['cat-7']);

  expect(loadTimeseries).not.toHaveBeenCalled();
  expect(useDataStreamStore.getState().vpu).toBe('VPU_16');
});

it('changes nothing when the index holds no candidate', async () => {
  // The caller owns the message: the search box reports a miss out loud.
  useDataStreamStore.setState({ vpu: 'VPU_01' });
  getFeatureProperties.mockResolvedValue([]);

  const matched = await selectIndexedFeature(['cat-nope']);

  expect(matched).toBeNull();
  expect(useDataStreamStore.getState().vpu).toBe('VPU_01');
  expect(useFeatureStore.getState().selected_feature).toBe(initial.fs.selected_feature);
});

it('asks for nothing when there are no candidates', async () => {
  expect(await selectIndexedFeature([])).toBeNull();
  expect(await selectIndexedFeature(null)).toBeNull();
  expect(getFeatureProperties).not.toHaveBeenCalled();
});

/**
 * The search box selects the same way the map click does.
 *
 * These two paths drifted: the click learned that charting alone is not enough once the panel has
 * been closed, and the search box kept calling loadTimeseries directly for a release afterwards.
 * A search made in that state drew a plot with no variable selected, no animated reaches and no
 * slider -- the exact bug the click had just been fixed for. Both now go through chartSelection,
 * and these are here so the next fix to one is a failure in the other rather than a silence.
 */
describe('recovering an animation the panel took down', () => {
  it('rebuilds the vpu instead of charting alone', async () => {
    // A closed panel still has a cache_key: the table stays built, only the arrays are dropped.
    useDataStreamStore.setState({ vpu: 'VPU_16', cache_key: 'cfe_nom_d_short_range_00_VPU_16_t' });
    useVPUStore.setState({ times: [] });
    getFeatureProperties.mockResolvedValue([{ id: 'cat-7', vpuid: '16' }]);

    await selectIndexedFeature(['cat-7']);
    // The rebuild is behind a dynamic import, so it lands a couple of microtasks later.
    await Promise.resolve();
    await Promise.resolve();

    expect(loadVpu).toHaveBeenCalled();
    expect(loadTimeseries).not.toHaveBeenCalled();
  });

  it('waits for a first load rather than starting a second', async () => {
    useDataStreamStore.setState({ vpu: 'VPU_16', cache_key: 'cfe_nom_d_short_range_00_VPU_16_t' });
    useVPUStore.setState({ times: [] });
    vpuLoadInFlight.mockReturnValue(true);
    getFeatureProperties.mockResolvedValue([{ id: 'cat-7', vpuid: '16' }]);

    await selectIndexedFeature(['cat-7']);

    expect(loadVpu).not.toHaveBeenCalled();
  });

  it('does not rebuild from a key that still names the previous vpu', async () => {
    useDataStreamStore.setState({ vpu: 'VPU_16', cache_key: 'cfe_nom_d_short_range_00_VPU_09_t' });
    useVPUStore.setState({ times: [] });
    getFeatureProperties.mockResolvedValue([{ id: 'cat-7', vpuid: '16' }]);

    await selectIndexedFeature(['cat-7']);

    expect(loadVpu).not.toHaveBeenCalled();
  });

  it('charts without rebuilding while the animation is on screen', async () => {
    useDataStreamStore.setState({ vpu: 'VPU_16', cache_key: 'cfe_nom_d_short_range_00_VPU_16_t' });
    useVPUStore.setState({ times: [1, 2, 3] });
    getFeatureProperties.mockResolvedValue([{ id: 'cat-7', vpuid: '16' }]);

    await selectIndexedFeature(['cat-7']);

    expect(loadTimeseries).toHaveBeenCalledWith({ featureId: 'cat-7' });
    expect(loadVpu).not.toHaveBeenCalled();
  });
});
