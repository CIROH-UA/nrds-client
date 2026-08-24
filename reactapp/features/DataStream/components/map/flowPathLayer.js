import {
  FLOWPATHS_MIN_ZOOM,
  pathIsVisibleAt,
  getValueAtTimeFlat,
  normalizeValue,
} from '../../lib/layers';
import { NO_DATA_VALUE, writeColorInto } from '../../lib/valueRamp';
import { widthAtZoom } from '../../lib/flowpaths';

// Stands in for the frame index while the layer is hidden. deck.gl gates drawing on `visible`
// but not attribute updates, so with a live index it would keep recomputing colour and width
// for every path on every frame of a playback nobody can see. Freezing costs one recompute
// when the layer is toggled rather than one per frame while it is off.
const HIDDEN = 'hidden';

/** How wide an animated reach is drawn, as a multiple of the static flowpath beneath it. */
const FACTOR_MIN = 0.5;
const FACTOR_RANGE = 2.5;
const FACTOR_NO_DATA = 0.35;
const MAX_PIXELS = 4.5;
const MIN_PIXELS = 0.25;

/** The props for the animated flowpath layer, or null when there is nothing to draw. */
/** The deck.gl PathLayer props for the animated network. */
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
    visible,
    getPath: (d) => d.path,
    getColor: (d, { target }) => {
      const v = getValueAtTimeFlat(valuesByVar, numTimes, d.featureIndex, currentTimeIndex);
      return writeColorInto(v, bounds, target, ramp);
    },
    getWidth: (d) => {
      const v = getValueAtTimeFlat(valuesByVar, numTimes, d.featureIndex, currentTimeIndex);
      if (v === null || v <= NO_DATA_VALUE) return FACTOR_NO_DATA;
      return FACTOR_MIN + normalizeValue(v, bounds) * FACTOR_RANGE;
    },
    widthScale: widthAtZoom(zoom),
    widthUnits: 'pixels',
    widthMinPixels: MIN_PIXELS,
    widthMaxPixels: MAX_PIXELS,
    capRounded: true,
    jointRounded: true,
    pickable: false,
    updateTriggers: {
      getColor: [frame, variable, pathTick, ramp],
      getWidth: [frame, variable, pathTick],
    },
  };
}

const EMPTY_PATHS = [];

/** Whether to tell the reader that the view, not the data, is why nothing is animating. */
export function shouldPromptZoom({ visible, valuesByVar, timesArr, zoom, paths = EMPTY_PATHS }) {
  if (!visible || !valuesByVar || !timesArr?.length) return false;
  if (!Number.isFinite(zoom) || zoom >= FLOWPATHS_MIN_ZOOM) return false;
  return !paths.some((path) => pathIsVisibleAt(path, zoom));
}
