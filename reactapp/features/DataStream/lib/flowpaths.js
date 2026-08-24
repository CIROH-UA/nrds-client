import { useMemo } from 'react';

import { pathsVisibleAt } from 'features/DataStream/lib/layers';

/** What the static flowpaths layer and the animated overlay have to agree about. */

/** The zoom curve the flowpaths are drawn on. */
export const FLOWPATHS_WIDTH_STOPS = Object.freeze(
  [[2, 0.6], [7, 1], [10, 2]].map((pair) => Object.freeze(pair))
);

/** The width a stop curve gives at one zoom, matching how maplibre reads the same array. */
export const widthAtZoom = (zoom, stops = FLOWPATHS_WIDTH_STOPS) => {
  if (!Number.isFinite(zoom)) return stops[0][1];
  if (zoom <= stops[0][0]) return stops[0][1];

  const last = stops[stops.length - 1];
  if (zoom >= last[0]) return last[1];

  const i = stops.findIndex(([z]) => z > zoom);
  const [z0, w0] = stops[i - 1];
  const [z1, w1] = stops[i];
  return w0 + ((zoom - z0) / (z1 - z0)) * (w1 - w0);
};

/** Whether the animation is on the map. */
export const animationIsOnMap = ({ times, flowpathsVisible }) =>
  Boolean(flowpathsVisible) && (times?.length ?? 0) > 0;

/** The zoom rounded to the step the animated width is actually redrawn at. */
export const QUANTISED_ZOOM_STEP = 0.25;

export const quantiseZoom = (zoom) => {
  if (!Number.isFinite(zoom)) return 0;
  return Math.round(zoom / QUANTISED_ZOOM_STEP) * QUANTISED_ZOOM_STEP;
};

/** The drawable paths, held stable across animation frames. */
export const useVisiblePaths = (pathDataRef, zoom, pathTick) =>
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pathTick stands in for the ref's contents
  useMemo(() => pathsVisibleAt(pathDataRef.current, zoom), [pathDataRef, zoom, pathTick]);

/** Run something whenever the map settles, until the caller lets go. */
export const onMapSettled = (map, run) => {
  map.once('idle', run);
  map.on('moveend', run);
  map.on('zoomend', run);
  return () => {
    map.off('idle', run);
    map.off('moveend', run);
    map.off('zoomend', run);
  };
};
