import PropTypes from 'prop-types';
import { NO_DATA_VALUE } from 'features/DataStream/lib/valueRamp';
import { readMapTheme } from './mapTheme';
import { quantiseZoom } from 'features/DataStream/lib/flowpaths';
/** The lowest zoom at which flowpath geometry exists. */
export const FLOWPATHS_MIN_ZOOM = 1;

/** The lowest zoom at which catchment geometry exists. */
export const DIVIDES_MIN_ZOOM = 7;

/** Our flowpaths layer, and the one in the basemap style it stands in for. */
export const FLOWPATHS_LAYER_ID = 'flowpaths-line';
export const FLOWPATHS_HIGHLIGHT_LAYER_ID = 'flowpaths-highlight';
const STYLE_FLOWPATHS_LAYER_ID = 'flowpaths';

/** The vpu boundary layer, which belongs to the basemap style. */
const STYLE_VPU_LAYER_ID = 'vpu';

/** Show or hide the style's vpu boundaries. */
export const setVpuVisibility = (map, visible) => {
  if (!map?.getLayer?.(STYLE_VPU_LAYER_ID)) return;
  map.setLayoutProperty(STYLE_VPU_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
};

/** The layers a click acts on, given what is currently shown. */
export const clickableLayerIds = ({ isCatchmentsVisible = false } = {}) => {
  const ids = [];
  if (isCatchmentsVisible) ids.push('divides');
  return ids;
};

/** Hide the basemap style's own flowpaths, so it neither double-draws nor answers queries. */
export const hideStyleFlowpaths = (map) => {
  if (!map?.getLayer?.(STYLE_FLOWPATHS_LAYER_ID)) return;
  map.setLayoutProperty(STYLE_FLOWPATHS_LAYER_ID, 'visibility', 'none');
};

export const reorderLayers = (map) => {
  if (!map) return;
  const LAYER_ORDER = [
    FLOWPATHS_LAYER_ID,
    FLOWPATHS_HIGHLIGHT_LAYER_ID,
    'conus-gauges',
    'divides',
    'divides-highlight',
  ];

  LAYER_ORDER.forEach((id) => {
    if (map.getLayer(id)) {
      map.moveLayer(id);
    }
  });
};

const isPosition = (c) =>
  Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);

/** The positions that describe a geometry's outline. */
const positionsOf = (geometry) => {
  const { type, coordinates } = geometry ?? {};
  if (!Array.isArray(coordinates)) return [];
  switch (type) {
    case 'Point':
      return [coordinates];
    case 'MultiPoint':
    case 'LineString':
      return coordinates;
    case 'MultiLineString':
      return coordinates.flat();
    case 'Polygon':
      return coordinates[0] ?? [];
    case 'MultiPolygon':
      return coordinates.flatMap((polygon) => polygon?.[0] ?? []);
    default:
      return [];
  }
};

/** Where a selected feature sits, as [lon, lat], or null when it cannot be placed. */
export const selectionLngLat = (feature) => {
  const lat = feature?.lat ?? feature?.latitude;
  const lon = feature?.lon ?? feature?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lon, lat];
};

/** The mean of a geometry's outline positions, or nulls when it has none to average. */
export const getCentroid = (feature) => {
  const positions = positionsOf(feature?.geometry).filter(isPosition);
  if (positions.length === 0) return { lon: null, lat: null };

  let sumLon = 0;
  let sumLat = 0;
  for (const [lon, lat] of positions) {
    sumLon += lon;
    sumLat += lat;
  }
  return { lon: sumLon / positions.length, lat: sumLat / positions.length };
};

/** Colours for the legend symbols, read from the same tokens the map layers use. */
export const symbologyColors = () => {
  const map = readMapTheme();
  return {
    cursorFill: map.cursorSymbolFill,
    cursorStroke: map.pointStroke,
    catchmentFill: map.dividesHighlightFill,
    catchmentStroke: map.dividesOutline,
    flowStroke: map.flowpaths,
    gaugeFill: map.gauges,
    gaugeStroke: map.pointStroke,
    vpuStroke: map.vpuBoundary,
  };
}

// --- Small SVG legend symbols ----------------------------------

export const VpuSymbol = ({ stroke }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path
      d="M2 13 L6 5 L11 9 L16 3"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

VpuSymbol.propTypes = { stroke: PropTypes.string };

export const CatchmentSymbol = ({ fill, stroke }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    style={{ marginRight: '8px' }}
  >
    <rect
      x="3"
      y="4"
      width="12"
      height="10"
      rx="2"
      ry="2"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.5"
    />
  </svg>
);

export const FlowPathSymbol = ({ stroke }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    style={{ marginRight: '8px' }}
  >
    <path
      d="M2 13 C 5 9, 9 11, 16 5"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const GaugeSymbol = ({ fill, stroke }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    style={{ marginRight: '8px' }}
  >
    <circle cx="9" cy="9" r="4" fill={fill} stroke={stroke} strokeWidth="1.5" />
  </svg>
);

export const CursorSymbol = ({
  fill = '#1f78b4',
  stroke = '#f7fafe',
}) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    style={{ marginRight: '6px' }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M4 3 L4 18 L8.5 14.5 L11 20 L13 19 L10.5 13.5 L15 13 Z"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.2"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

const baseProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': 'true',
};

export const FileIcon = (props) => (
  <svg {...baseProps} {...props}>
    <path
      d="M6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4C4 2.89543 4.89543 2 6 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M14 2V8H20"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export function getValueAtTimeFlat(varData, numTimes, featureIndex, timeIndex) {
  if (!varData || featureIndex === undefined || featureIndex === null) return null;
  const idx = featureIndex * numTimes + timeIndex;
  if (idx < 0 || idx >= varData.length) return null;
  return varData[idx];
}

// Sampling keeps the sort cheap: a vpu's flat array runs to millions of values, and every
// hundredth one is plenty to find a percentile.
const BOUNDS_SAMPLE_CAP = 100000;
const LOW_PERCENTILE = 0.02;
const HIGH_PERCENTILE = 0.98;

/** The range the ramp spans, trimmed at both ends. */
export function computeBounds(varData) {
  const length = varData?.length ?? 0;
  const stride = Math.max(1, Math.ceil(length / BOUNDS_SAMPLE_CAP));
  const sample = [];
  for (let i = 0; i < length; i += stride) {
    const v = varData[i];
    if (v > NO_DATA_VALUE && Number.isFinite(v)) sample.push(v);
  }
  if (!sample.length) return { min: 0, max: 1 };

  sample.sort((a, b) => a - b);
  const last = sample.length - 1;
  const min = sample[Math.floor(last * LOW_PERCENTILE)];
  const high = sample[Math.ceil(last * HIGH_PERCENTILE)];
  const max = high > min ? high : min + 1;
  const median = sample[Math.round(last * 0.5)];
  return { min, max, curve: fitCurve(median - min, max - min) };
}

/** How hard to bend the ramp, so the median reach lands in the middle of it. */
function fitCurve(medianOffset, span) {
  if (!(medianOffset > 0) || !(span > medianOffset)) return 1;
  let low = 1e-6;
  let high = 1e9;
  for (let i = 0; i < 60; i++) {
    const k = Math.sqrt(low * high);
    if (Math.log1p(k * medianOffset) / Math.log1p(k * span) < 0.5) low = k;
    else high = k;
  }
  return Math.sqrt(low * high);
}

/** computeBounds, remembered for the array it was computed from. */
let lastValues;
let lastBounds = null;

export const boundsFor = (values) => {
  if (values === lastValues) return lastBounds;
  lastValues = values;
  lastBounds = values ? computeBounds(values) : null;
  return lastBounds;
};

/** Where a value sits on the ramp, 0 to 1. */
export function normalizeValue(value, bounds) {
  if (!Number.isFinite(value) || !bounds) return 0;
  const span = bounds.max - bounds.min;
  if (!(span > 0)) return 0;
  const offset = Math.min(Math.max(value - bounds.min, 0), span);
  const curve = bounds.curve > 0 ? bounds.curve : 1;
  return Math.log1p(curve * offset) / Math.log1p(curve * span);
}

/** The value at a given position on the ramp, the inverse of normalizeValue. */
export function valueAtRampPosition(t, bounds) {
  if (!bounds) return 0;
  const span = bounds.max - bounds.min;
  if (!(span > 0)) return bounds.min;
  const curve = bounds.curve > 0 ? bounds.curve : 1;
  const clamped = Math.min(Math.max(t, 0), 1);
  const offset = (Math.exp(clamped * Math.log1p(curve * span)) - 1) / curve;
  return bounds.min + Math.min(Math.max(offset, 0), span);
}

/** A fresh store for collected paths. */
export const createPathStore = () => new Map();

/** The id a rendered map feature is known by. */
export const mapFeatureId = (feature) =>
  feature?.id ?? feature?.properties?.id ?? feature?.properties?.divide_id ?? null;

/** Collect paths, keeping the most detailed version of each, and report how many changed. */
export function addPaths(store, features, featureIdToIndex, rawZoom = 0) {
  const zoom = quantiseZoom(rawZoom);
  let changed = 0;
  for (const path of convertFeaturesToPaths(features, featureIdToIndex)) {
    const held = store.get(path.id);
    const minZoom = held ? Math.min(held.minZoom ?? held.zoom ?? zoom, zoom) : zoom;

    if (held && held.zoom >= zoom && held.minZoom === minZoom) continue;

    const geometry = held && held.zoom >= zoom ? held : path;
    store.set(path.id, { ...geometry, zoom: Math.max(held?.zoom ?? zoom, zoom), minZoom });
    changed += 1;
  }
  return changed;
}

/** The reaches worth drawing at a given zoom. */
export const pathIsVisibleAt = (path, zoom) => (path.minZoom ?? -Infinity) <= zoom;

export const pathsVisibleAt = (paths, zoom) => {
  if (!paths?.length) return [];
  if (!Number.isFinite(zoom)) return paths;
  return paths.filter((p) => pathIsVisibleAt(p, zoom));
};

function convertFeaturesToPaths(features, featureIdToIndex) {
  const out = [];

  for (const f of features) {
    const rawId = mapFeatureId(f);
    if (rawId == null) continue;

    const id = String(rawId);
    const featureIndex = featureIdToIndex[id];
    if (featureIndex === undefined) continue;

    const geom = f.geometry;
    if (!geom) continue;

    if (geom.type === "LineString") {
      out.push({ id, featureIndex, path: geom.coordinates, properties: f.properties });
    } else if (geom.type === "MultiLineString") {
      geom.coordinates.forEach((line, i) => {
        out.push({ id: `${id}-${i}`, featureIndex, path: line, properties: f.properties });
      });
    }
  }

  return out;
}

