/**
 * The pure decisions behind a map hover, the vanilla port of the React hoverFeature action that the
 * migration dropped: which rendered feature under the pointer the reader most likely meant, the id it
 * is known by, the flattened hover payload the popup positions itself with, and the animated reading
 * shown for it. Kept clear of maplibre so the pick, payload, and value logic can be unit-tested
 * without a canvas; the wiring lives in components/map/hover.js.
 */
import { getValueAtTimeFlat, mapFeatureId } from './flowpathValues.js';
import { getVariableUnits } from './data.js';
import { formatMeasurement, formatFrameTime, numericPartOf } from './utils.js';
import { NO_DATA_VALUE } from './valueRamp.js';

/** How hard a layer is to aim at, smallest target first, so a gauge wins over the flowpath over it. */
export const HOVER_TARGET_ORDER = ['conus-gauges', 'flowpaths-line', 'divides'];

/** The id a rendered map feature is known by, re-exported so the hover pipeline shares one source. */
export { mapFeatureId };

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

/**
 * The animated variable's reading for a hovered reach at the current frame, as { label, value } or
 * null. The value is read straight from the VPU arrays by feature index, so it does not depend on
 * tile feature-state and tracks `currentTimeIndex` -- the caller re-renders with a new index while
 * the animation plays. Ported from the React HoverValue component.
 */
export function hoverReading({ variable, times, varData, featureIdToIndex, currentTimeIndex, hoverId }) {
  if (hoverId == null || !variable || !varData || !times?.length || !featureIdToIndex) return null;
  const numeric = numericPartOf(hoverId);
  const featureIndex =
    featureIdToIndex[String(hoverId)] ?? (numeric != null ? featureIdToIndex[numeric] : undefined);
  if (featureIndex === undefined) return null;

  const value = getValueAtTimeFlat(varData, times.length, featureIndex, currentTimeIndex);
  if (value === null || value === undefined) return null;

  const units = getVariableUnits(variable);
  const at = formatFrameTime(times[currentTimeIndex]);
  const label = `${variable}${units ? ` (${units})` : ''}${at ? ` @ ${at}` : ''}`;
  const reading = value <= NO_DATA_VALUE ? 'no data' : formatMeasurement(value);
  return reading === null ? null : { label, value: reading };
}
