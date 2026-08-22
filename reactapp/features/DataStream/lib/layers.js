import PropTypes from 'prop-types';
import { readMapTheme } from './mapTheme';
/**
 * The lowest zoom at which flowpath geometry exists.
 *
 * Read from the tileset, not chosen. This was 7, because merged.pmtiles declares
 * conus_flowpaths as minzoom 7: below that its tiles carry no flowpath features at all, so
 * queryRenderedFeatures came back empty, the animated PathLayer had nothing to build from, and
 * playback over a wide view drew an empty frame.
 *
 * Flowpaths now come from upstream_index/flowpaths.pmtiles, which declares its `flowpaths`
 * layer as zoom 1 to 10. Measured against the live archive, a zoom 2 tile over the Great Basin
 * holds 16,665 reaches and a zoom 4 tile holds 7,466, both carrying numeric MVT feature ids
 * that buildFeatureIdToIndex already registers alongside the wb- form. Low zooms hold a
 * filtered subset rather than every reach, which is the right amount of detail at that scale.
 */
export const FLOWPATHS_MIN_ZOOM = 1;

/**
 * The lowest zoom at which catchment geometry exists.
 *
 * Read from the tileset: merged.pmtiles declares conus_divides as minzoom 7, so below that its
 * tiles carry no polygons and a click cannot hit one however carefully it is aimed. The map
 * looks the same at zoom 4 either way, which is why clicking there reads as the app being
 * broken rather than as there being nothing to click.
 */
export const DIVIDES_MIN_ZOOM = 7;

/**
 * Our flowpaths layer, and the one in the basemap style it stands in for.
 *
 * A distinct id is load bearing. The style at map/styles/*-style.json already defines a layer
 * called `flowpaths` on its own `hydrofabric` source, and react-map-gl updates an existing
 * layer rather than replacing it: its updateLayer only touches layout, paint, filter and zoom
 * range, never the source. Reusing the id meant this layer silently kept reading merged.pmtiles
 * no matter what source was declared here, so pointing it at an archive that carries flowpaths
 * below zoom 7 would have done nothing at all.
 */
export const FLOWPATHS_LAYER_ID = 'flowpaths-line';
export const FLOWPATHS_HIGHLIGHT_LAYER_ID = 'flowpaths-highlight';
const STYLE_FLOWPATHS_LAYER_ID = 'flowpaths';

/**
 * The vpu boundary layer, which belongs to the basemap style.
 *
 * It is the teal outline visible across the country at low zoom, drawn from map/vpu.pmtiles at
 * zooms 0 to 6 by the style itself. Nothing in this app creates it, so its switch sets
 * visibility on the style's layer rather than mounting one of ours.
 */
const STYLE_VPU_LAYER_ID = 'vpu';

/** The colour the basemap style draws vpu boundaries in, so the legend can match it. */
const VPU_BOUNDARY_COLOR = 'rgb(0, 153, 136)';

/** Show or hide the style's vpu boundaries. */
export const setVpuVisibility = (map, visible) => {
  if (!map?.getLayer?.(STYLE_VPU_LAYER_ID)) return;
  map.setLayoutProperty(STYLE_VPU_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
};

/** Hide the basemap style's own flowpaths, so it neither double-draws nor answers queries. */
export const hideStyleFlowpaths = (map) => {
  if (!map?.getLayer?.(STYLE_FLOWPATHS_LAYER_ID)) return;
  map.setLayoutProperty(STYLE_FLOWPATHS_LAYER_ID, 'visibility', 'none');
};

export const reorderLayers = (map) => {
  if (!map) return;
  // Draw order from bottom → top
  const LAYER_ORDER = [
    FLOWPATHS_LAYER_ID,
    FLOWPATHS_HIGHLIGHT_LAYER_ID,
    'conus-gauges',
    'divides',
    'divides-highlight',
    'nexus-points',
    'nexus-highlight',
  ];

  LAYER_ORDER.forEach((id) => {
    if (map.getLayer(id)) {
      // moveLayer with no beforeId = move to top
      map.moveLayer(id);
    }
  });
};

const isPosition = (c) =>
  Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);

/**
 * The positions that describe a geometry's outline.
 *
 * Outer rings only for polygons: a hole should not pull a catchment's centre around. Every
 * geometry type the tiles can carry is listed, because the version of this that handled only
 * Point and Polygon returned nothing for a MultiPolygon catchment -- and a null centre sent
 * the map to 0,0 in the Gulf of Guinea.
 */
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

/**
 * Colours for the legend symbols, read from the same tokens the map layers use.
 *
 * These used to be a hand-maintained copy of the map palette, branched on a theme argument that
 * came from styled-components' useTheme. Nothing in this app installs a ThemeProvider, so that
 * argument was always undefined and the legend was always the light branch, whatever the theme.
 * Reading the tokens means the legend cannot disagree with the map, because it is the map's
 * source.
 */
export const symbologyColors = () => {
  const map = readMapTheme();
  return {
    nexusFill: map.nexusCircle,
    nexusStroke: map.nexusStroke,
    catchmentFill: map.dividesHighlightFill,
    catchmentStroke: map.dividesOutline,
    flowStroke: map.flowpaths,
    gaugeFill: map.gauges,
    gaugeStroke: map.nexusStroke,
  };
}

// --- Small SVG legend symbols ----------------------------------

export const VpuSymbol = ({ stroke = VPU_BOUNDARY_COLOR }) => (
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

export const NexusSymbol = ({ fill, stroke }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    style={{ marginRight: '8px' }}
  >
    <circle cx="9" cy="9" r="5" fill={fill} stroke={stroke} strokeWidth="2" />
  </svg>
);

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
    {/* Arrow body */}
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

export const BasinSymbol = ({
  fill = 'rgba(91, 44, 111, 0.32)',
  stroke = 'rgba(91, 44, 111, 0.9)',
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    className="Eo3Yub"
  >
    <path
      d="M2.0975 7.12551L10.878 1.1499L18.5 13.8414L13.378 18.8502L1 16.5158L2.0975 7.12551Z"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.5"
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

// Model: small cube / block
export const ModelIcon = (props) => (
  <svg {...baseProps} {...props}>
    <path
      d="M7 9L12 6L17 9L12 12L7 9Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M7 9V15L12 18L17 15V9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

// Date: calendar
export const DateIcon = (props) => (
  <svg {...baseProps} {...props}>
    <rect
      x="4"
      y="6"
      width="16"
      height="14"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M8 4V7M16 4V7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M4 10H20"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

// Forecast: horizon + forward arrow
export const ForecastIcon = (props) => (
  <svg {...baseProps} {...props}>
    {/* horizon */}
    <path
      d="M4 16H14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    {/* rising curve */}
    <path
      d="M4 16C6.5 12 9 10 12 10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* forward arrow */}
    <path
      d="M13 7L18 12L13 17"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Cycle: circular arrows
export const CycleIcon = (props) => (
  <svg {...baseProps} {...props}>
    <path
      d="M7 8H12.5C14.9853 8 17 10.0147 17 12.5C17 13.3284 16.7893 14.1074 16.4189 14.7816"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M9 5L7 8L9 11"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 16H11.5C9.01472 16 7 13.9853 7 11.5C7 10.6716 7.21075 9.89257 7.58107 9.21835"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M15 19L17 16L15 13"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const EnsembleIcon = (props) => (
  <svg {...baseProps} {...props}>
    <path
      d="M4 9C5.2 8.4 6.4 8 8 8C10.5 8 11.5 10 14 10C15.6 10 16.8 9.6 18 9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M4 12C5.2 11.4 6.4 11 8 11C10.5 11 11.5 13 14 13C15.6 13 16.8 12.6 18 12"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      opacity="0.85"
    />
    <path
      d="M4 15C5.2 14.4 6.4 14 8 14C10.5 14 11.5 16 14 16C15.6 16 16.8 15.6 18 15"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      opacity="0.7"
    />
  </svg>
);

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

// Variable: axes + curve
export const VariableIcon = (props) => (
  <svg {...baseProps} {...props}>
    {/* axes */}
    <path
      d="M5 18V7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M5 18H18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    {/* curve */}
    <path
      d="M7 15C9 12 10 10 12 10C14 10 15 12 17 9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
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

// Hoisted to module scope: writeColorInto runs once per flowpath per animation frame, and
// rebuilding these seven arrays on every call cost about half its runtime.
export const COLOR_SCALE = [
  [0, 119, 187],
  [0, 180, 216],
  [144, 224, 239],
  [255, 186, 8],
  [255, 107, 53],
  [208, 0, 0],
];
const MISSING_COLOR = [100, 100, 100, 150];

/**
 * Writes the color for one value into ``target`` and returns it.
 *
 * deck.gl hands every accessor a reusable ``target`` array precisely so colors can be
 * produced without allocating (see the performance guide, "avoid creating new objects in
 * accessors"). This is called once per flowpath per animation frame, so returning a fresh
 * array meant tens of thousands of short-lived arrays per second.
 *
 * Alpha is always written. The array deck.gl supplies is reused between calls, so leaving
 * the fourth slot alone would inherit the previous path's alpha.
 */
export function writeColorInto(value, bounds, target) {
  if (value === null || value === undefined || value <= -9998) {
    target[0] = MISSING_COLOR[0];
    target[1] = MISSING_COLOR[1];
    target[2] = MISSING_COLOR[2];
    target[3] = MISSING_COLOR[3];
    return target;
  }
  const t = normalizeValue(value, bounds);
  const idx = t * (COLOR_SCALE.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const frac = idx - lower;
  const from = COLOR_SCALE[lower];
  const to = COLOR_SCALE[upper];
  target[0] = Math.round(from[0] + (to[0] - from[0]) * frac);
  target[1] = Math.round(from[1] + (to[1] - from[1]) * frac);
  target[2] = Math.round(from[2] + (to[2] - from[2]) * frac);
  target[3] = 255;
  return target;
}

// Sampling keeps the sort cheap: a vpu's flat array runs to millions of values, and every
// hundredth one is plenty to find a percentile.
const BOUNDS_SAMPLE_CAP = 100000;
const LOW_PERCENTILE = 0.02;
const HIGH_PERCENTILE = 0.98;

/**
 * The range the ramp spans, trimmed at both ends.
 *
 * The true minimum and maximum were the bounds before, which one main stem was enough to ruin:
 * a single reach three orders of magnitude above its neighbours pushed every other reach into
 * the bottom of the ramp, so a whole vpu drew in one blue with a handful of coloured lines
 * through it. Clipping to the 2nd and 98th percentiles means the ramp describes the reaches
 * there are rather than the widest pair, and anything beyond the ends simply saturates.
 */
export function computeBounds(varData) {
  const length = varData?.length ?? 0;
  const stride = Math.max(1, Math.ceil(length / BOUNDS_SAMPLE_CAP));
  const sample = [];
  for (let i = 0; i < length; i += stride) {
    const v = varData[i];
    if (v > -9998 && Number.isFinite(v)) sample.push(v);
  }
  if (!sample.length) return { min: 0, max: 1 };

  sample.sort((a, b) => a - b);
  const last = sample.length - 1;
  const min = sample[Math.floor(last * LOW_PERCENTILE)];
  const high = sample[Math.ceil(last * HIGH_PERCENTILE)];
  // Everything inside the trimmed range being identical is a real answer, not a failure.
  const max = high > min ? high : min + 1;
  const median = sample[Math.round(last * 0.5)];
  return { min, max, curve: fitCurve(median - min, max - min) };
}

/**
 * How hard to bend the ramp, so the median reach lands in the middle of it.
 *
 * log1p alone is nearly linear close to zero, which is where most reaches are: it left a third
 * of them in the bottom fifth of the ramp. Scaling the input first moves the bend down to where
 * the data actually is. Bisected rather than solved because there is no closed form, and it runs
 * once per variable rather than once per frame.
 */
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

/**
 * Where a value sits on the ramp, 0 to 1.
 *
 * Logarithmic, because streamflow is. A linear ramp, and even the square root this replaced,
 * put almost every reach at the bottom: the values are spread over orders of magnitude, so the
 * median reach sat at a fraction of a percent of the maximum and the map read as one flat
 * colour with a few bright lines. log1p is used rather than log so that a value sitting exactly
 * at the lower bound maps to 0 without an epsilon.
 *
 * Colour and width both come through here, so the two cannot describe the same value
 * differently.
 */
export function normalizeValue(value, bounds) {
  if (!Number.isFinite(value) || !bounds) return 0;
  const span = bounds.max - bounds.min;
  if (!(span > 0)) return 0;
  const offset = Math.min(Math.max(value - bounds.min, 0), span);
  // curve defaults to 1 so bounds built by hand, as tests do, still normalise sensibly.
  const curve = bounds.curve > 0 ? bounds.curve : 1;
  return Math.log1p(curve * offset) / Math.log1p(curve * span);
}


/**
 * The value at a given position on the ramp, the inverse of normalizeValue.
 *
 * A legend needs this: the ramp is logarithmic and bent to the median, so its midpoint is
 * nowhere near the midpoint of the range and labelling it linearly would misdescribe the map.
 */
export function valueAtRampPosition(t, bounds) {
  if (!bounds) return 0;
  const span = bounds.max - bounds.min;
  if (!(span > 0)) return bounds.min;
  const curve = bounds.curve > 0 ? bounds.curve : 1;
  const clamped = Math.min(Math.max(t, 0), 1);
  const offset = (Math.exp(clamped * Math.log1p(curve * span)) - 1) / curve;
  return bounds.min + Math.min(Math.max(offset, 0), span);
}

/**
 * A fresh store for collected paths.
 *
 * A factory rather than `new Map()` at the call site, because the map component imports
 * react-map-gl's default export as `Map`, which shadows the global. Constructing it there
 * built the React component instead of a Map and the whole map failed to initialise with
 * "is not a constructor", which no test caught because none of them render a canvas.
 */
export const createPathStore = () => new Map();

/**
 * The id a rendered map feature is known by.
 *
 * Tilesets disagree about where it lives, and reading only one of the two places is what has
 * now broken twice. merged.pmtiles puts it in properties as "wb-2862525" and leaves the MVT
 * feature id null; upstream_index/flowpaths.pmtiles puts the bare number on the feature itself
 * and carries no properties.id at all. Everything that needs a feature's identity goes through
 * here so the next tileset change is one edit rather than a hunt.
 */
export const mapFeatureId = (feature) =>
  feature?.id ?? feature?.properties?.id ?? feature?.properties?.divide_id ?? null;

/**
 * Collect paths, keeping the most detailed version of each, and report how many changed.
 *
 * Keyed on the path id so a reach seen from three viewports is stored once, and tagged with the
 * zoom it was read at so a closer look can replace a coarser one. First-seen-wins was the
 * defect: the tileset serves a filtered, simplified subset at low zoom, so a reach first seen
 * over the whole state kept that coarse geometry even after the reader zoomed in on it. Drawn
 * together, captures from different zooms left visible steps in density along tile edges.
 *
 * The count is what tells the caller whether to hand deck.gl a new array.
 */
export function addPaths(store, features, featureIdToIndex, zoom = 0) {
  let changed = 0;
  for (const path of convertFeaturesToPaths(features, featureIdToIndex)) {
    const held = store.get(path.id);
    if (held && held.zoom >= zoom) continue;
    store.set(path.id, { ...path, zoom });
    changed += 1;
  }
  return changed;
}

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

