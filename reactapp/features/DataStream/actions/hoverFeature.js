import { mapFeatureId } from 'features/DataStream/lib/layers';

// Ours, not the feature's: added below so the popup can place itself and dedupe.
const BOOKKEEPING = new Set(['_id', 'layerId', 'hoverId', 'longitude', 'latitude']);

/**
 * How hard a layer is to aim at, smallest target first.
 *
 * The handler took features[0], the topmost rendered feature. Divides are fill polygons that
 * cover every pixel of the map and are drawn above the flowpaths, so with catchments on the
 * answer was always the catchment and a flowpath could never be hovered at all. A 4px line the
 * reader deliberately aimed at should beat a polygon that happens to be under the whole cursor.
 */
const TARGET_ORDER = ['nexus-points', 'conus-gauges', 'flowpaths-line', 'divides'];

/** The feature the reader most likely meant, out of everything under the pointer. */
export function pickHoverFeature(features) {
  if (!features?.length) return null;

  let best = null;
  let bestRank = Infinity;
  for (const feature of features) {
    const rank = TARGET_ORDER.indexOf(feature?.layer?.id);
    // An unranked layer still beats nothing, but never a ranked one.
    const effective = rank === -1 ? TARGET_ORDER.length : rank;
    if (effective < bestRank) {
      best = feature;
      bestRank = effective;
    }
  }
  return best;
}

/**
 * What the hover popup should show for a rendered map feature, or null for nothing.
 *
 * Lifted out of the map's mousemove handler so the id resolution can be asserted without a
 * canvas. That handler read feature.properties.id for every layer except divides, which is
 * where the flowpath id lived in merged.pmtiles. The flowpath source now carries its id on the
 * feature instead, with no properties.id at all, so hovering a flowpath resolved to undefined
 * and was discarded before it could ever become a popup.
 *
 * Divides stay explicit: divide_id is the catchment the reader means, not whatever the tile
 * happens to identify the polygon by.
 */
export function hoveredFeatureOf(feature, lngLat) {
  if (!feature) return null;

  const layerId = feature.layer?.id;
  const hoverId =
    layerId === 'divides' ? feature.properties?.divide_id : mapFeatureId(feature);
  if (!hoverId) return null;

  return {
    // _id is where the feature store looks first for an identity. Without it the store fell back
    // through id and properties.id, found neither on a flowpath from this archive, keyed the
    // hover as null, read null as unchanged, and dropped every update: hovering a flowpath could
    // never produce a popup while hovering a catchment always could.
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
