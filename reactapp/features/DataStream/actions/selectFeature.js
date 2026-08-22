import { getCentroid } from 'features/DataStream/lib/layers';
import { layerIdToFeatureType } from 'features/DataStream/lib/utils';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { loadTimeseries } from 'features/DataStream/actions/loadTimeseries';

/**
 * Record a map feature as the selection, and chart it when it belongs to the loaded vpu.
 *
 * Lifted out of the map's click handler so that selecting a catchment is a function call
 * rather than something only a real canvas click can do. The handler keeps the part that is
 * genuinely maplibre's -- turning a click point into rendered features -- and this takes the
 * decision from there, which is also the part worth testing.
 *
 * When the feature belongs to another vpu, only the vpu changes here; loading it brings the
 * new dataset in and its closing call charts whatever is selected by then.
 */
export function selectMapFeature(feature, layerId) {
  const featureIdProperty = layerIdToFeatureType(layerId);
  const featureId = feature.properties?.[featureIdProperty];
  const { lon, lat } = getCentroid(feature);

  // A feature we cannot name is not a selection. This used to be recorded anyway and dropped by
  // the store, whose dedupe guard read an unidentifiable key as "unchanged" and so happened to
  // act as a validity check. That guard is gone, because it was also silently dropping hovers
  // it could not key, so the decision belongs here where it can be stated.
  if (featureId != null) {
    useFeatureStore.getState().set_selected_feature({
      latitude: lat,
      longitude: lon,
      layerId,
      _id: featureId,
      ...feature.properties,
    });
  }

  const vpuName = `VPU_${feature.properties?.vpuid}`;
  const { vpu, set_vpu } = useDataStreamStore.getState();

  /**
   * Say something now, while the click is still the last thing that happened.
   *
   * Nothing used to report until well after the press. A click into another vpu only called
   * set_vpu, and the first message came from loadVpu -- which the loader effect reaches only
   * after an S3 round trip for the output listing. A click inside the current vpu reached
   * loadTimeseries, which asks duckdb whether the table exists before it says anything, and that
   * question queues behind the index build for most of a second after a page load. Both left the
   * reader looking at an unchanged screen wondering whether the click had registered.
   *
   * Worded as whichever step is actually next, so the message refines rather than flickers.
   */
  if (featureId != null) {
    useTimeSeriesStore.setState({
      loadingText: vpuName === vpu ? `Loading ${featureId}` : `Loading ${vpuName}`,
      last_error: null,
    });
  }
  // Only for a feature we could name: loadTimeseries falls back to the store's feature_id, so
  // passing nothing re-charted the previous selection as though it had been clicked again.
  if (featureId != null && vpuName === vpu) {
    // Not awaited: a click returns immediately and the load reports itself. The catch is the
    // backstop for anything that escapes its own reporting, so it cannot become an unhandled
    // rejection that leaves the click looking ignored.
    loadTimeseries({ featureId }).catch((err) => {
      console.error('Could not chart', featureId, err);
    });
  }
  set_vpu(vpuName);

  return featureId;
}
