import { getFeatureProperties } from 'features/DataStream/lib/queryData';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { loadTimeseries } from 'features/DataStream/actions/loadTimeseries';

/**
 * Select the feature an id names, using the hydrofabric index to fill in what the caller cannot
 * know.
 *
 * The search box is the caller: it has an id and nothing else, and needs three things to follow
 * from it -- the selection recorded under the id the index actually holds, the vpu pointed at
 * the right place, and the chart drawn if that vpu is already loaded.
 *
 * It lived inline in SearchBar. It was lifted out when a clicked flowpath briefly needed the
 * same lookup, because that archive drops vpuid and only the index could name it; clicking the
 * catchment replaced that, so this has one caller again. Keeping it out here is a judgement
 * call, not a necessity -- SearchBar is rendered and tested directly, so "testable without a
 * component" is not the reason. The reason is that the vpu-and-chart consequences of a match
 * are a rule worth stating once, somewhere a second caller can find it.
 *
 * Charting only when the vpu already matches is deliberate and predates this: switching vpu
 * starts a load that charts the selection when it finishes, so charting here as well would draw
 * the same series twice.
 *
 * Returns the id the index matched, or null when it holds nothing for any candidate. The caller
 * owns what to say about that; the search box says so out loud.
 */
export async function selectIndexedFeature(candidates) {
  const ids = (Array.isArray(candidates) ? candidates : [candidates]).filter(Boolean);
  if (!ids.length) return null;

  const features = await getFeatureProperties({
    cacheKey: 'index_data_table',
    feature_id: ids,
  });
  if (!features.length) return null;

  const feature = features[0];
  // The id the index holds, not the one asked for: searching "2884494" selects cat-2884494, and
  // everything downstream keys off that.
  const matchedId = feature.id ?? ids[0];
  useFeatureStore.getState().set_selected_feature({ _id: matchedId, ...feature });

  const vpuName = `VPU_${feature.vpuid}`;
  const { vpu, set_vpu } = useDataStreamStore.getState();
  if (vpuName === vpu) {
    loadTimeseries({ featureId: matchedId }).catch((err) => {
      console.error('Could not chart', matchedId, err);
    });
  }
  set_vpu(vpuName);

  return matchedId;
}
