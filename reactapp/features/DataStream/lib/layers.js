import PropTypes from 'prop-types';
import { readMapTheme } from './mapTheme';
import { quantiseZoom } from 'features/DataStream/lib/flowpaths';
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

/** Show or hide the style's vpu boundaries. */
export const setVpuVisibility = (map, visible) => {
  if (!map?.getLayer?.(STYLE_VPU_LAYER_ID)) return;
  map.setLayoutProperty(STYLE_VPU_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
};

/**
 * The layers a click acts on, given what is currently shown.
 *
 * One list, because there were two describing the same set: a frozen pair that set the cursor
 * and a visibility-tracked pair that answered the click. Only the second followed a toggle, so
 * turning catchments off and on left the pointer behind, and any layer added to one would have
 * been missed by the other.
 *
 * Deliberately narrower than the hoverable set, which also carries gauges and flowpaths. Both
 * can be hovered and neither can be selected: a gauge has no timeseries in this app, and a reach
 * is selected by clicking the catchment it runs through, which highlights the reach. A pointer
 * over either would promise a click that does nothing. Keeping the two questions apart is what
 * stops that.
 */
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
  // Draw order from bottom → top
  const LAYER_ORDER = [
    FLOWPATHS_LAYER_ID,
    FLOWPATHS_HIGHLIGHT_LAYER_ID,
    'conus-gauges',
    'divides',
    'divides-highlight',
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

/**
 * Where a selected feature sits, as [lon, lat], or null when it cannot be placed.
 *
 * The selection is assembled from two sources that name these differently: a map click flattens
 * the geometry's centroid into latitude/longitude, and the hydrofabric index supplies lat/lon.
 * Anything that wants to move the map to the selection has to read both.
 *
 * ?? rather than ||, so a feature on the equator or the prime meridian keeps its real
 * coordinate instead of falling through to the other spelling. And a feature that cannot be
 * placed returns null rather than a pair of undefineds, because flying to those lands the map
 * at 0,0 in the Gulf of Guinea with nothing on screen to explain why.
 */
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
 * computeBounds, remembered for the array it was computed from.
 *
 * The map layer and the legend have to describe the same ramp, and they are now in different
 * components -- the reaches on the map, the key in the layer panel. Recomputing in both places
 * would be correct, since computeBounds is pure, but it sorts a sample of up to a hundred
 * thousand values and would do it twice for every vpu.
 *
 * One entry, keyed on identity rather than contents. The flat arrays are replaced wholesale when
 * a variable or a vpu changes and are never mutated in place, so identity is a sound key and a
 * miss costs only what the old behaviour cost anyway.
 */
let lastValues;
let lastBounds = null;

export const boundsFor = (values) => {
  if (values === lastValues) return lastBounds;
  lastValues = values;
  lastBounds = values ? computeBounds(values) : null;
  return lastBounds;
};

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
 * Keyed on the path id so a reach seen from three viewports is stored once. Nothing is ever
 * removed: the geometry has to outlive the viewport that produced it, or panning drops reaches
 * out of a running animation and deck.gl, which has no zoom limit of its own, has nothing to
 * draw over a wide view.
 *
 * Each reach remembers two zooms, because they answer two different questions.
 *
 * ``zoom`` is the finest it has been seen at, and decides which geometry to keep.
 * First-seen-wins was the original defect: the tileset serves a simplified subset at low zoom,
 * so a reach first met over the whole state kept that coarse shape even after the reader zoomed
 * in on it, and captures from different zooms left steps in density along tile edges.
 *
 * ``minZoom`` is the coarsest it has been served at, and decides when to draw it -- see
 * pathsVisibleAt. It has to be tracked separately and it has to be able to fall. A main stem
 * first met close up would otherwise be marked as fine detail for ever, because the order the
 * reader happened to travel in is not a fact about the river.
 *
 * Both are quantised here rather than at the call site. pathsVisibleAt compares minZoom against
 * the overlay's zoom, which is quantised to keep the animation from rebuilding on every frame of
 * a pinch -- so a raw tag and a quantised comparison are different units. A reach served at 7.124
 * was tagged 7.124, compared against 7.0, and disappeared until the reader zoomed another eighth
 * of a level in. Quantising on the way in makes the two agree by construction, which a second
 * call site cannot then undo.
 *
 * The count is what tells the caller whether to hand deck.gl a new array.
 */
export function addPaths(store, features, featureIdToIndex, rawZoom = 0) {
  const zoom = quantiseZoom(rawZoom);
  let changed = 0;
  for (const path of convertFeaturesToPaths(features, featureIdToIndex)) {
    const held = store.get(path.id);
    const minZoom = held ? Math.min(held.minZoom ?? held.zoom ?? zoom, zoom) : zoom;

    // Nothing new: the geometry is already at least this detailed and the floor has not moved.
    if (held && held.zoom >= zoom && held.minZoom === minZoom) continue;

    const geometry = held && held.zoom >= zoom ? held : path;
    store.set(path.id, { ...geometry, zoom: Math.max(held?.zoom ?? zoom, zoom), minZoom });
    changed += 1;
  }
  return changed;
}

/**
 * The reaches worth drawing at a given zoom.
 *
 * The store accumulates and never prunes, so handing all of it to deck.gl drew whatever the
 * reader had ever been close to. Zoom into half a vpu and back out, and that half kept its
 * close-up density while the rest stayed coarse: one region at two resolutions, lasting the
 * whole session, because the store is only cleared when the vpu changes.
 *
 * Filtering rather than pruning. A reach is drawn when the tileset would serve it at this zoom,
 * which is what minZoom records, so the density matches the static network at every scale and
 * nothing is lost when the reader moves away.
 *
 * A path with no zoom recorded is drawn. Anything arriving from somewhere that does not tag is
 * geometry the animation had before this existed, and it should not disappear to it.
 */
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

