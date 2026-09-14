/**
 * The pure decisions behind a map hover, the vanilla port of the React hoverFeature action that the
 * migration dropped: which rendered feature under the pointer the reader most likely meant, the id it
 * is known by, and the flattened hover payload the popup positions itself with. Kept clear of
 * maplibre so the pick and payload logic can be unit-tested without a canvas; the wiring lives in
 * components/map/hover.js.
 */

/** How hard a layer is to aim at, smallest target first, so a gauge wins over the flowpath over it. */
export const HOVER_TARGET_ORDER = ['conus-gauges', 'flowpaths-line', 'divides'];

/** The id a rendered map feature is known by. */
export const mapFeatureId = (feature) =>
  feature?.id ?? feature?.properties?.id ?? feature?.properties?.divide_id ?? null;

/** The feature the reader most likely meant, out of everything under the pointer. */
export function pickHoverFeature(features) {
  if (!features?.length) return null;
  let best = null;
  let bestRank = Infinity;
  for (const feature of features) {
    const rank = HOVER_TARGET_ORDER.indexOf(feature?.layer?.id);
    const effective = rank === -1 ? HOVER_TARGET_ORDER.length : rank;
    if (effective < bestRank) {
      best = feature;
      bestRank = effective;
    }
  }
  return best;
}

/**
 * The flattened hover payload for a rendered feature, or null when it carries no id to key on. A
 * divide is named by its `divide_id`; everything else by `mapFeatureId`. Longitude/latitude come
 * from the pointer so the popup follows the cursor.
 */
export function hoveredFeatureOf(feature, lngLat) {
  if (!feature) return null;
  const layerId = feature.layer?.id;
  const hoverId = layerId === 'divides' ? feature.properties?.divide_id : mapFeatureId(feature);
  if (hoverId == null) return null;
  return {
    _id: hoverId,
    layerId,
    ...feature.properties,
    hoverId,
    longitude: lngLat?.lng,
    latitude: lngLat?.lat,
  };
}
