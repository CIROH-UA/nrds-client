/** The live map, reachable from outside the map component. */
let handle = null;

export const setMapHandle = (map) => {
  handle = map ?? null;
};

export const getMapHandle = () => handle;

/** Let go of a map, if it is still the one held. */
export const releaseMapHandle = (map) => {
  if (handle === map) handle = null;
};
