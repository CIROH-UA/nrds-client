import { FLOWPATHS_MIN_ZOOM, getValueAtTimeFlat, normalizeValue, writeColorInto } from '../../lib/layers';

// Stands in for the frame index while the layer is hidden. deck.gl gates drawing on `visible`
// but not attribute updates, so with a live index it would keep recomputing colour and width
// for every path on every frame of a playback nobody can see. Freezing costs one recompute
// when the layer is toggled rather than one per frame while it is off.
const HIDDEN = 'hidden';

/**
 * How wide an animated reach is drawn, in pixels.
 *
 * Narrow deliberately. The width carries the value, so it has to vary visibly, but the static
 * flowpaths underneath are 0.6 to 2 px and the animation reading five times heavier than the
 * network it follows buried the basemap at every zoom. WIDTH_NO_DATA is thinner than the
 * minimum so a reach with nothing to report recedes rather than asserting a low value.
 */
const WIDTH_MIN = 1.5;
const WIDTH_RANGE = 3;
const WIDTH_NO_DATA = 1;

/**
 * The props for the animated flowpath layer, or null when there is nothing to draw.
 *
 * Returns plain props rather than a PathLayer, and lives apart from the map component, so the
 * update-trigger behaviour can be asserted without maplibre, deck.gl, or a canvas.
 */
export function flowPathLayerProps({
  visible,
  valuesByVar,
  timesArr,
  variable,
  bounds,
  pathData,
  currentTimeIndex,
  pathTick,
}) {
  const numTimes = timesArr?.length || 0;
  if (!valuesByVar || !numTimes || !pathData?.length) return null;

  const frame = visible ? currentTimeIndex : HIDDEN;
  return {
    id: 'flowpaths-anim',
    data: pathData,
    // Toggled, not removed: deck.gl keeps a hidden layer's GPU resources.
    visible,
    getPath: (d) => d.path,
    getColor: (d, { target }) => {
      const v = getValueAtTimeFlat(valuesByVar, numTimes, d.featureIndex, currentTimeIndex);
      return writeColorInto(v, bounds, target);
    },
    getWidth: (d) => {
      const v = getValueAtTimeFlat(valuesByVar, numTimes, d.featureIndex, currentTimeIndex);
      if (v === null || v <= -9998) return WIDTH_NO_DATA;
      // The same curve the colour uses, so a reach cannot read wide and cool at once.
      return WIDTH_MIN + normalizeValue(v, bounds) * WIDTH_RANGE;
    },
    widthUnits: 'pixels',
    widthMinPixels: WIDTH_NO_DATA,
    widthMaxPixels: WIDTH_MIN + WIDTH_RANGE,
    capRounded: true,
    jointRounded: true,
    pickable: false,
    updateTriggers: {
      getColor: [frame, variable, pathTick],
      getWidth: [frame, variable, pathTick],
    },
  };
}

/**
 * Whether to tell the reader that the view, not the data, is why nothing is animating.
 *
 * Only when there is something to draw and nothing drawn yet. Raised with no data loaded it
 * would send someone zooming in to find an empty map, and raised once paths have been
 * collected it would contradict the animation running in front of them.
 */
export function shouldPromptZoom({ visible, valuesByVar, timesArr, zoom, collectedPaths = 0 }) {
  if (!visible || !valuesByVar || !timesArr?.length) return false;
  // Geometry already collected keeps drawing at any zoom, so there is nothing to prompt about.
  if (collectedPaths > 0) return false;
  return Number.isFinite(zoom) && zoom < FLOWPATHS_MIN_ZOOM;
}
