import {
  FLOWPATHS_MIN_ZOOM,
  getValueAtTimeFlat,
  normalizeValue,
} from '../../lib/layers';
import { writeColorInto } from '../../lib/valueRamp';
import { widthAtZoom } from '../../lib/flowpaths';

// Stands in for the frame index while the layer is hidden. deck.gl gates drawing on `visible`
// but not attribute updates, so with a live index it would keep recomputing colour and width
// for every path on every frame of a playback nobody can see. Freezing costs one recompute
// when the layer is toggled rather than one per frame while it is off.
const HIDDEN = 'hidden';

/**
 * How wide an animated reach is drawn, as a multiple of the static flowpath beneath it.
 *
 * These used to be pixel widths that ignored zoom -- a flat 1 to 4.5 px against a network drawn
 * at 0.6 px when zoomed out to CONUS and 2 px up close, so the animation read as several times
 * heavier than the reaches it was following. They are factors now, and the curve they multiply
 * is the one the static layer publishes, so the animation is the same network at every scale.
 *
 * The value varies the width between half the static width and three times it. Starting below
 * the network rather than at it is deliberate: at CONUS scale every headwater draws at once, and
 * with the floor at the network's own weight that was a lot of ink for reaches carrying almost
 * nothing. A quiet reach now recedes under the network and a busy one still stands well clear.
 * NO_DATA sits below even that, so a reach with nothing to report is the faintest thing on the
 * map rather than asserting a low value.
 *
 * MIN_PIXELS stops anything vanishing outright where the curve goes sub-pixel, and is 0.25
 * rather than 0.5 because at 0.5 it swallowed the bottom of the ramp: below zoom 7 the curve is
 * under 1, so the quietest fifth of real values and a no-data reach all clamped to the same
 * width and the distinction the factors describe did not survive to the screen. It is still a
 * floor, so the very bottom compresses at CONUS scale -- colour is what separates them there.
 *
 * The ceiling stays at 4.5 px, which is where the old constants topped out: at zoom 10 the curve
 * alone is 2 px and a maximum value would reach 6, and 4.5 is the figure that stopped the
 * animation burying the basemap.
 */
const FACTOR_MIN = 0.5;
const FACTOR_RANGE = 2.5;
const FACTOR_NO_DATA = 0.35;
const MAX_PIXELS = 4.5;
const MIN_PIXELS = 0.25;

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
  zoom,
  ramp,
}) {
  const numTimes = timesArr?.length || 0;
  if (!valuesByVar || !numTimes || !pathData?.length || !ramp) return null;

  const frame = visible ? currentTimeIndex : HIDDEN;
  return {
    id: 'flowpaths-anim',
    data: pathData,
    // Toggled, not removed: deck.gl keeps a hidden layer's GPU resources.
    visible,
    getPath: (d) => d.path,
    getColor: (d, { target }) => {
      const v = getValueAtTimeFlat(valuesByVar, numTimes, d.featureIndex, currentTimeIndex);
      return writeColorInto(v, bounds, target, ramp);
    },
    getWidth: (d) => {
      const v = getValueAtTimeFlat(valuesByVar, numTimes, d.featureIndex, currentTimeIndex);
      if (v === null || v <= -9998) return FACTOR_NO_DATA;
      // The same curve the colour uses, so a reach cannot read wide and cool at once.
      return FACTOR_MIN + normalizeValue(v, bounds) * FACTOR_RANGE;
    },
    // A uniform, so the view rescales what is drawn; hence no zoom in updateTriggers.
    widthScale: widthAtZoom(zoom),
    widthUnits: 'pixels',
    widthMinPixels: MIN_PIXELS,
    widthMaxPixels: MAX_PIXELS,
    capRounded: true,
    jointRounded: true,
    pickable: false,
    updateTriggers: {
      // The ramp is in here because a theme switch changes no frame, no variable and no tick.
      // Without it the reaches keep the old theme's colours until the animation next steps, and
      // for ever if it is paused.
      getColor: [frame, variable, pathTick, ramp],
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
  // Anything collected at all means the reader has data somewhere, so this would be telling
  // them to zoom in on ground they have already covered.
  //
  // Not the same as "something is drawn": paths are filtered to the zoom the tileset serves them
  // at, so a store full of headwaters draws nothing over a whole vpu. That gap is unreachable
  // in practice -- FLOWPATHS_MIN_ZOOM is 1 and the check below needs a zoom under it -- and
  // counting the visible subset here would put an O(n) filter over the store into every render
  // of the map component to fix a case that cannot happen.
  if (collectedPaths > 0) return false;
  return Number.isFinite(zoom) && zoom < FLOWPATHS_MIN_ZOOM;
}
