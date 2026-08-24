import { getFeatureProperties } from 'features/DataStream/lib/queryData';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { chartSelection } from 'features/DataStream/actions/chartSelection';
import { showSelection } from 'features/DataStream/actions/showSelection';

/**
 * Select the feature an id names, using the hydrofabric index to fill in what the caller cannot
 * know.
 *
 * The search box is the caller: it has an id and nothing else, and needs three things to follow
 * from it -- the selection recorded under the id the index actually holds, the vpu pointed at
 * the right place, and the feature drawn if that vpu is already loaded.
 *
 * It has one caller, so it exists to name a rule rather than to be reused. The rule is that an
 * id alone is enough to select something: the index turns it into a vpu and a canonical id, and
 * what follows from there is the same as any other selection. Keeping it beside selectMapFeature
 * is what makes the two comparable, and the drift below is what happens when they are not.
 *
 * Drawing only when the vpu already matches is deliberate and predates this: switching vpu starts
 * a load that draws the selection when it finishes, so drawing here as well would do it twice.
 *
 * What it draws is chartSelection's decision, shared with the map click. This called
 * loadTimeseries directly until the click learned that charting alone is not enough after the
 * panel has been closed -- a search made in that state produced a plot with no variable selected
 * and no animation, which was the exact bug the click had just been fixed for.
 *
 * Returns the id the index matched, or null when it holds nothing for any candidate. The caller
 * owns what to say about that; the search box says so out loud.
 *
 * The two lines it does not share with selectMapFeature are here because the map click does not
 * need them. pending, because the click's own gesture is visible and a typed search is not: the
 * second before the load reports anything looked like the search had been ignored. And the
 * explicit flight, because the store drops a re-selection of the same id, so nothing changes and
 * the effect that flies on a changed selection never runs -- which is exactly the search a
 * reader makes after zooming away from the feature they are charting.
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
  // The id the index holds, not the one asked for: "2884494" selects cat-2884494.
  const matchedId = feature.id ?? ids[0];
  const vpuName = `VPU_${feature.vpuid}`;
  const { vpu, set_vpu } = useDataStreamStore.getState();

  const before = useFeatureStore.getState().selected_feature;
  useFeatureStore.getState().set_selected_feature({ _id: matchedId, ...feature });
  // Only when the store kept what it had, or the change moves the map and this flies twice.
  if (useFeatureStore.getState().selected_feature === before) showSelection();

  useTimeSeriesStore.setState({
    loadingText: vpuName === vpu ? `Loading ${matchedId}` : `Loading ${vpuName}`,
    last_error: null,
    pending: true,
  });

  if (vpuName === vpu) {
    chartSelection({ featureId: matchedId, vpuName });
  }
  set_vpu(vpuName);

  return matchedId;
}
