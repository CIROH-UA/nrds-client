import { getCentroid } from './flowpathValues.js';
import { numericPartOf } from './utils.js';

/**
 * The pure decisions behind a map click (migration unit U5), kept clear of maplibre so they can be
 * unit-tested without a canvas: which property names a feature on a given layer, which vpu a clicked
 * feature belongs to, the flattened payload a selection is stored as, and the highlight-layer
 * filters that draw the selected divide. Ported from the React DataStream lib/{utils,layers} and the
 * selectMapFeature action, which computed the same values inline.
 */

/**
 * The zoom a selection is shown at. The divides fill only reaches full opacity at 11, so returning
 * to the selection at any less would centre the reader on a highlight they still could not see.
 * Ported from the React showSelection SELECTION_ZOOM.
 */
export const SELECTION_ZOOM = 11;

/** The property that names a feature on a layer, or null for a layer whose features cannot be charted. */
export const layerIdToFeatureType = (layerId) => (layerId === 'divides' ? 'divide_id' : null);

/** The layers a click may act on, in the order a chartable feature is preferred over the rest. */
export const SELECTABLE_LAYERS = ['divides', 'flowpaths-line', 'conus-gauges'];

/**
 * The vpu a clicked feature belongs to, as `VPU_<id>`, or null when the feature does not carry one.
 * React read `VPU_${vpuid}` unconditionally; catchments always carry vpuid, but returning null for a
 * feature without one lets the caller keep the loaded vpu rather than load a `VPU_undefined`.
 */
export const resolveVpuName = (feature) => {
  const vpuid = feature?.properties?.vpuid;
  return vpuid == null || vpuid === '' ? null : `VPU_${vpuid}`;
};

/**
 * The flattened selection a clicked feature becomes, or null when the layer gives it no id to be
 * named by. The stored feature carries its centroid as latitude/longitude (the popup anchor), the
 * layer it came from, its id as `_id`, and its raw properties spread flat (no nested `.properties`).
 */
export const selectionPayload = (feature, layerId) => {
  const featureIdProperty = layerIdToFeatureType(layerId);
  const featureId = featureIdProperty ? feature?.properties?.[featureIdProperty] : undefined;
  if (featureId == null) return null;

  const { lon, lat } = getCentroid(feature);
  return {
    featureId,
    payload: {
      latitude: lat,
      longitude: lon,
      layerId,
      _id: featureId,
      ...feature.properties,
    },
  };
};

/** The divide_id of a stored (flattened) or raw feature, or null when it has none. */
export const divideIdOf = (feature) => {
  if (!feature) return null;
  return feature.divide_id ?? feature.properties?.divide_id ?? null;
};

/** The divides-highlight filter: the selected divide, or an expression that matches nothing. */
export const dividesHighlightFilter = (divideId) =>
  divideId != null
    ? ['any', ['==', ['get', 'divide_id'], divideId]]
    : ['==', ['get', 'divide_id'], ''];

/**
 * The flowpaths-highlight filter, keyed on the tile's native feature id (which equals the numeric
 * `divide_id`). The native id is used rather than the `divide_id` property because the property is
 * dropped below zoom 7, so a property filter would lose the highlight at low zoom; the native id is
 * present at every zoom.
 */
export const flowpathsHighlightFilter = (divideId) => {
  const numeric = numericPartOf(divideId);
  return numeric ? ['==', ['id'], Number(numeric)] : ['==', ['id'], -1];
};

/**
 * The clicked feature worth acting on: the topmost one whose layer can be charted, and only when
 * none can, the plain topmost. queryRenderedFeatures returns features top-first, so a flowpath drawn
 * over a catchment would otherwise win the click and select nothing.
 */
export const pickClickedFeature = (features) => {
  if (!features?.length) return null;
  return features.find((f) => layerIdToFeatureType(f?.layer?.id)) ?? features[0];
};
