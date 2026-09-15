/**
 * Feature-state flowpath colouring for the build-less NRDS client (migration unit U3c, KTD2), the
 * vanilla replacement for the React deck.gl `PathLayer` overlay. Rather than draw a second network
 * on top of the map, this colours the map's own `flowpaths` line layer in place: each reach's value
 * at the current time frame is quantised into a ramp class (a "bin"), stored on the feature through
 * maplibre `setFeatureState`, and turned into a colour by a data-driven `match` paint expression
 * over that bin. The same feature state carries a 0..1 width factor (`wf`) that a second expression
 * turns into a per-reach line width, reproducing the deck.gl 0.5..3.0x factor and the 0.35x no-data
 * width.
 *
 * BINS vs CONTINUOUS (the KTD2 benchmark decision). Two colourings were on the table:
 *   - continuous: write each reach's exact interpolated colour (the ported `writeColorInto`) every
 *     frame, which needs an O(reaches) `setFeatureState` sweep with no useful frame-to-frame diff
 *     because a reach's colour changes by a shade almost every step;
 *   - bins (chosen): quantise into the ramp's own classes, so between frames only the reaches that
 *     actually cross a class boundary change, and the per-frame `setFeatureState` work is the small
 *     diff, not the whole network.
 * Bins were chosen because the ramp is six stops, so the binned colour is visually close to the
 * continuous ramp, while the frame diff stays cheap enough to keep playback smooth. The continuous
 * path (`writeColorInto`) remains available in `lib/valueRamp.js` if smoother gradients are wanted
 * later; it is deliberately not built here.
 *
 * Reach-id mapping. The `flowpath-geometry` source keeps the tiles' native feature id (no
 * `promoteId`); that id is each reach's numeric `divide_id` and, unlike the `divide_id` property, is
 * present at every zoom, so the colouring reaches the whole network at CONUS scale rather than only
 * above zoom 7 where the property survives. It is the same numeric key the flowpaths-highlight filter
 * uses. The VPU animation arrays are keyed by `feature_id` (the
 * distinct, sorted ids from the timeseries table), whose numeric part equals that `divide_id`; the
 * flat value array is ordered by (feature_id, time), so a reach's row block index is its position in
 * `vpu.featureIds` and also its `vpu.featureIdToIndex` value. This module therefore looks each
 * reach's value up by that index and writes the state under the numeric `divide_id`.
 */
import { readMapTheme } from '../../lib/mapTheme.js';
import { resolveRamp, orientRamp } from '../../lib/valueRamp.js';
import {
  boundsFor,
  getValueAtTimeFlat,
  normalizeValue,
} from '../../lib/flowpathValues.js';
import { scaledBounds } from '../../lib/colorScale.js';
import { NO_DATA_VALUE } from '../../lib/valueRamp.js';
import { FLOWPATHS_WIDTH_STOPS } from '../../lib/flowpaths.js';
import { numericPartOf } from '../../lib/utils.js';

/** The pmtiles source, its vector source-layer, and the line layer these all belong to. */
const SOURCE_ID = 'flowpath-geometry';
const SOURCE_LAYER = 'flowpaths';
const LAYER_ID = 'flowpaths-line';

/** The bin a reach carries when it is in the VPU but has no value at this frame. */
export const NODATA_BIN = 0;

/** The bin `coalesce` falls back to for a reach with no feature state: not in the VPU at all. */
export const UNSET_BIN = -1;

/** The colour a reach with no value at this frame is drawn in, ported from valueRamp's MISSING_COLOR. */
const MISSING_COLOR_CSS = 'rgba(100, 100, 100, 0.588)';

/** The width factor for a reach, as a multiple of the static flowpath, matching flowPathLayer.js. */
const FACTOR_MIN = 0.5;
const FACTOR_RANGE = 2.5;
const FACTOR_NO_DATA = 0.35;

/** Whether a raw reach value is the ngen no-data sentinel or otherwise unusable. */
const isNoData = (value) =>
  value === null || value === undefined || !Number.isFinite(value) || value <= NO_DATA_VALUE;

/**
 * The ramp class a value falls in, 1..classes, or NODATA_BIN (0) when the value is missing.
 *
 * The value is reshaped onto 0..1 by `normalizeValue` (which honours the scale carried by
 * ``bounds``) and split into ``classes`` equal buckets, so bin ``k`` maps to ramp stop ``k - 1``.
 */
export function valueToBin(value, bounds, classes) {
  if (isNoData(value)) return NODATA_BIN;
  const n = Math.max(1, classes || 1);
  const t = normalizeValue(value, bounds);
  const cls = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
  return cls + 1;
}

/** The 0..1 width factor input for a value, or 0 when the value is missing. */
export function widthFactor(value, bounds) {
  if (isNoData(value)) return 0;
  return normalizeValue(value, bounds);
}

/** The numeric reach id (the promoted `divide_id`) for a VPU feature id. */
export function reachIdOf(featureId) {
  if (typeof featureId === 'number') return featureId;
  const numeric = numericPartOf(featureId);
  return numeric === null ? featureId : Number(numeric);
}

/**
 * The per-reach feature state for one frame, as a Map of reach id -> { bin, wf }.
 *
 * Pure over its inputs: it reads the flat value array by each reach's index and quantises. This is
 * the whole-frame state; the caller diffs it against the previous frame to decide what to write.
 */
export function frameStates({
  values,
  numTimes,
  timeIndex,
  featureIds,
  featureIdToIndex,
  bounds,
  classes,
}) {
  const out = new Map();
  if (!values || !numTimes || !featureIds?.length) return out;
  for (let i = 0; i < featureIds.length; i++) {
    const featureId = featureIds[i];
    const featureIndex = featureIdToIndex?.[featureId] ?? i;
    const value = getValueAtTimeFlat(values, numTimes, featureIndex, timeIndex);
    out.set(reachIdOf(featureId), {
      bin: valueToBin(value, bounds, classes),
      wf: widthFactor(value, bounds),
    });
  }
  return out;
}

/**
 * The reaches whose bin differs from the previous frame (a new reach counts as changed), as an
 * array of { id, bin, wf }. This is the per-frame diff: only these need a `setFeatureState`.
 */
export function changedStates(prevStates, nextStates) {
  const out = [];
  for (const [id, state] of nextStates) {
    const prev = prevStates.get(id);
    if (!prev || prev.bin !== state.bin) out.push({ id, bin: state.bin, wf: state.wf });
  }
  return out;
}

/** One ramp colour as a maplibre-legible `rgb(...)` string. */
const rgbCss = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;

/**
 * The `line-color` expression: the reach's bin picks a ramp colour, a reach with no value at this
 * frame (bin 0) is grey, and a reach outside the VPU (no state, bin coalesces to UNSET) keeps the
 * static base colour so the wider CONUS network is unaffected.
 */
export function colorMatchExpression(ramp, baseColor) {
  const expr = ['match', ['coalesce', ['feature-state', 'bin'], UNSET_BIN]];
  expr.push(UNSET_BIN, baseColor);
  expr.push(NODATA_BIN, MISSING_COLOR_CSS);
  for (let i = 0; i < ramp.length; i++) expr.push(i + 1, rgbCss(ramp[i]));
  expr.push(baseColor);
  return expr;
}

/**
 * The `line-width` expression: the static zoom-stop width multiplied by a per-reach factor. A reach
 * outside the VPU keeps factor 1 (the static width), a no-data reach uses the 0.35x factor, and a
 * reach with a value scales 0.5..3.0x with its width factor, matching the deck.gl layer.
 */
export function widthExpression(stops = FLOWPATHS_WIDTH_STOPS) {
  const factor = [
    'match',
    ['coalesce', ['feature-state', 'bin'], UNSET_BIN],
    UNSET_BIN,
    1,
    NODATA_BIN,
    FACTOR_NO_DATA,
    ['+', FACTOR_MIN, ['*', FACTOR_RANGE, ['coalesce', ['feature-state', 'wf'], 0]]],
  ];
  const expr = ['interpolate', ['linear'], ['zoom']];
  for (const [z, w] of stops) expr.push(z, ['*', w, factor]);
  return expr;
}

/**
 * Drive the `flowpaths` layer's colouring from the store: recolour when the frame, variable, scale,
 * VPU data, or theme changes, and reapply on map idle so reaches whose tiles stream in after a paint
 * still pick up their state. Returns a teardown that removes the subscription and idle listener.
 */
export function attachFlowpathColoring(map, store) {
  if (!map) return () => {};

  /** The last per-reach state written, so a frame change only writes the reaches that changed. */
  let prevStates = new Map();
  /** True when a paint could not write because the source was not yet loaded; idle retries it. */
  let pendingPaint = false;
  /** Whether the data-driven paint expressions (not the static fallback) are on the layer. */
  let expressionsApplied = false;
  /** The ramp/base identity the expressions were last built for, so theme changes re-apply them. */
  let appliedThemeKey = null;
  /** The state signature the idle handler last fully re-applied, so it re-applies only once per state. */
  let lastIdleSig = null;

  const layerReady = () => Boolean(map.getLayer?.(LAYER_ID) && map.getSource?.(SOURCE_ID));

  const activeData = () => {
    const s = store.get();
    const variable = s.timeseries.variable;
    const values = s.vpu.valuesByVar?.[variable];
    const featureIds = s.vpu.featureIds;
    const numTimes = s.vpu.times.length;
    if (!variable || !values || !featureIds?.length || !numTimes) return null;
    return {
      variable,
      values,
      featureIds,
      numTimes,
      featureIdToIndex: s.vpu.featureIdToIndex,
      scale: s.vpu.scale,
      timeIndex: s.timeseries.currentTimeIndex,
    };
  };

  const stateSig = (data, t) =>
    `${data.variable}|${data.scale}|${data.timeIndex}|${t.theme}|${t.rampName}|${t.rampReversed}`;

  /** Clear every reach's feature-state on the source, so no stale bins survive a data change. */
  const clearFeatureState = () => {
    if (layerReady()) map.removeFeatureState({ source: SOURCE_ID, sourceLayer: SOURCE_LAYER });
  };

  /** Restore the plain static look when there is no VPU data to colour. */
  const restoreStatic = () => {
    prevStates = new Map();
    lastIdleSig = null;
    if (!expressionsApplied || !layerReady()) return;
    clearFeatureState();
    const theme = readMapTheme();
    map.setPaintProperty(LAYER_ID, 'line-color', theme.flowpaths);
    map.setPaintProperty(LAYER_ID, 'line-width', { stops: FLOWPATHS_WIDTH_STOPS });
    expressionsApplied = false;
    appliedThemeKey = null;
  };

  /** Put the data-driven expressions on the layer, rebuilding them when the theme's ramp changes. */
  const ensureExpressions = (theme) => {
    const themeKey = `${theme.flowpaths}|${theme.ramp?.length}|${theme.ramp?.[0]?.join(',')}`;
    if (expressionsApplied && appliedThemeKey === themeKey) return;
    map.setPaintProperty(LAYER_ID, 'line-color', colorMatchExpression(theme.ramp, theme.flowpaths));
    map.setPaintProperty(LAYER_ID, 'line-width', widthExpression());
    expressionsApplied = true;
    appliedThemeKey = themeKey;
  };

  /**
   * Recolour for the current store state. ``full`` rewrites every reach (first paint, and after a
   * data or theme change); otherwise only the reaches whose bin changed since the last frame.
   * ``resetState`` first clears every reach's feature-state, so a VPU switch never leaves the
   * previous VPU's reaches frozen at their stale bins (their ids are absent from the new frame).
   */
  const paint = (full, resetState = false) => {
    if (!layerReady()) return;
    const data = activeData();
    if (!data) {
      restoreStatic();
      return;
    }
    if (resetState) {
      clearFeatureState();
      prevStates = new Map();
    }
    const base = readMapTheme();
    const t = store.get().theme;
    const theme = { ...base, ramp: orientRamp(resolveRamp(t.rampName, base.ramp), t.rampReversed) };
    ensureExpressions(theme);

    if (!map.isSourceLoaded?.(SOURCE_ID)) {
      pendingPaint = true;
      return;
    }

    const bounds = scaledBounds({
      bounds: boundsFor(data.values),
      values: data.values,
      scale: data.scale,
      variable: data.variable,
      classes: theme.ramp.length,
    });

    const next = frameStates({
      values: data.values,
      numTimes: data.numTimes,
      timeIndex: data.timeIndex,
      featureIds: data.featureIds,
      featureIdToIndex: data.featureIdToIndex,
      bounds,
      classes: theme.ramp.length,
    });

    const prev = full ? new Map() : prevStates;
    for (const { id, bin, wf } of changedStates(prev, next)) {
      map.setFeatureState({ source: SOURCE_ID, sourceLayer: SOURCE_LAYER, id }, { bin, wf });
    }
    prevStates = next;
    pendingPaint = false;
    lastIdleSig = stateSig(data, store.get().theme);
  };

  const s0 = store.get();
  let prevVariable = s0.timeseries.variable;
  let prevScale = s0.vpu.scale;
  let prevValues = s0.vpu.valuesByVar?.[prevVariable];
  let prevFeatureIds = s0.vpu.featureIds;
  let prevTimeIndex = s0.timeseries.currentTimeIndex;
  let prevTheme = s0.theme.theme;
  let prevRampName = s0.theme.rampName;
  let prevReversed = s0.theme.rampReversed;

  const unsubscribe = store.subscribe((s) => {
    const variable = s.timeseries.variable;
    const scale = s.vpu.scale;
    const values = s.vpu.valuesByVar?.[variable];
    const featureIds = s.vpu.featureIds;
    const timeIndex = s.timeseries.currentTimeIndex;
    const theme = s.theme.theme;
    const rampName = s.theme.rampName;
    const reversed = s.theme.rampReversed;

    const reachesChanged = featureIds !== prevFeatureIds;
    const dataChanged =
      variable !== prevVariable ||
      scale !== prevScale ||
      values !== prevValues ||
      reachesChanged;
    const themeChanged =
      theme !== prevTheme || rampName !== prevRampName || reversed !== prevReversed;
    const frameChanged = timeIndex !== prevTimeIndex;
    if (!dataChanged && !themeChanged && !frameChanged) return;

    prevVariable = variable;
    prevScale = scale;
    prevValues = values;
    prevFeatureIds = featureIds;
    prevTimeIndex = timeIndex;
    prevTheme = theme;
    prevRampName = rampName;
    prevReversed = reversed;

    if (themeChanged) {
      expressionsApplied = false;
      appliedThemeKey = null;
    }
    paint(dataChanged || themeChanged, reachesChanged);
  });

  const onIdle = () => {
    if (!layerReady()) return;
    const data = activeData();
    if (!data) return;
    const sig = stateSig(data, store.get().theme);
    if (!pendingPaint && sig === lastIdleSig) return;
    paint(true);
    lastIdleSig = sig;
  };
  map.on('idle', onIdle);

  paint(true);

  return () => {
    unsubscribe();
    map.off?.('idle', onIdle);
  };
}

export default attachFlowpathColoring;
