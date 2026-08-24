/**
 * The live map, reachable from outside the map component.
 *
 * Almost nothing should want this. react-map-gl's useMap covers anything rendered inside <Map>,
 * and reaching for a global handle instead of a prop is usually a sign the thing asking is in
 * the wrong place.
 *
 * The exception is a control that belongs to the selected feature rather than to the map: it
 * lives in the feature panel, beside the chart it relates to, which is nowhere near the map's
 * React tree. Threading a ref up through the view and back down would couple three components
 * to something only one of them uses.
 *
 * Set on map load and released when that map unmounts, so a caller either gets a live map or
 * nothing. A stale handle would be worse than none: getMapHandle would answer with something
 * that looks usable, and flyTo on a map whose canvas has gone throws from inside maplibre
 * rather than returning the false every caller here checks for.
 */
let handle = null;

export const setMapHandle = (map) => {
  handle = map ?? null;
};

export const getMapHandle = () => handle;

/**
 * Let go of a map, if it is still the one held.
 *
 * Takes the map rather than clearing unconditionally because React's strict mode double-mounts:
 * the first map's cleanup runs after the second has already registered, and an unconditional
 * clear would leave the live map unreachable for the rest of the session.
 */
export const releaseMapHandle = (map) => {
  if (handle === map) handle = null;
};
