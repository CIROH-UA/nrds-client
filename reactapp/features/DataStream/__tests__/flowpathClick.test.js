/**
 * Selecting a feature the hydrofabric index has to name.
 *
 * The search box and a clicked flowpath arrive from opposite directions and need the same
 * finish. Search has an id and no position; a flowpath has a position and a catchment id but no
 * vpu, because upstream_index/flowpaths.pmtiles carries divide_id and drops vpuid. Sending a
 * flowpath through the ordinary click path would have read that missing field and set the vpu
 * to the string "VPU_undefined".
 */
import { selectIndexedFeature } from 'features/DataStream/actions/selectIndexedFeature';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useFeatureStore } from 'features/DataStream/store/Layers';

jest.mock('features/DataStream/lib/queryData', () => ({ getFeatureProperties: jest.fn() }));
jest.mock('features/DataStream/actions/loadTimeseries', () => ({ loadTimeseries: jest.fn() }));

const { getFeatureProperties } = require('features/DataStream/lib/queryData');
const { loadTimeseries } = require('features/DataStream/actions/loadTimeseries');

const initial = {
  ds: useDataStreamStore.getState(),
  fs: useFeatureStore.getState(),
};

beforeEach(() => {
  useDataStreamStore.setState(initial.ds, true);
  useFeatureStore.setState(initial.fs, true);
  loadTimeseries.mockResolvedValue(undefined);
});

it('names the vpu from the index, which is the field the tile does not carry', async () => {
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

it('does not chart when the click lands in another vpu', async () => {
  useDataStreamStore.setState({ vpu: 'VPU_01' });
  getFeatureProperties.mockResolvedValue([{ id: 'cat-7', vpuid: '16' }]);

  await selectIndexedFeature(['cat-7']);

  expect(loadTimeseries).not.toHaveBeenCalled();
  expect(useDataStreamStore.getState().vpu).toBe('VPU_16');
});

it('changes nothing when the index holds no candidate', async () => {
  // A stray click says nothing; the search box is the one that reports a miss out loud.
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
