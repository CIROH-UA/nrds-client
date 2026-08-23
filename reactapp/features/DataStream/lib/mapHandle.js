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
 * Set on map load and cleared on unload, so a caller either gets a live map or nothing.
 */
let handle = null;

export const setMapHandle = (map) => {
  handle = map ?? null;
};

export const getMapHandle = () => handle;
