import { mapFeatureId } from 'features/DataStream/lib/layers';

// Ours, not the feature's: added below so the popup can place itself and dedupe.
const BOOKKEEPING = new Set(['_id', 'layerId', 'hoverId', 'longitude', 'latitude']);

/** How hard a layer is to aim at, smallest target first. */
const TARGET_ORDER = ['conus-gauges', 'flowpaths-line', 'divides'];

/** The feature the reader most likely meant, out of everything under the pointer. */
export function pickHoverFeature(features) {
  if (!features?.length) return null;

  let best = null;
  let bestRank = Infinity;
  for (const feature of features) {
    const rank = TARGET_ORDER.indexOf(feature?.layer?.id);
    const effective = rank === -1 ? TARGET_ORDER.length : rank;
    if (effective < bestRank) {
      best = feature;
      bestRank = effective;
    }
  }
  return best;
}

/** What the hover popup should show for a rendered map feature, or null for nothing. */
export function hoveredFeatureOf(feature, lngLat) {
  if (!feature) return null;

  const layerId = feature.layer?.id;
  const hoverId =
    layerId === 'divides' ? feature.properties?.divide_id : mapFeatureId(feature);
  if (!hoverId) return null;

  return {
    _id: hoverId,
    layerId,
    ...feature.properties,
    hoverId,
    longitude: lngLat?.lng,
    latitude: lngLat?.lat,
  };
}

/** The rows worth showing: the feature's own properties, without our additions. */
export function hoverRows(hovered) {
  if (!hovered) return [];
  return Object.entries(hovered).filter(([key, value]) => {
    if (BOOKKEEPING.has(key)) return false;
    return value !== null && value !== undefined && value !== '';
  });
}
