/** The colours the basemaps actually paint, sampled from the style files. */
export const LIGHT_SURFACES = Object.freeze({
  earth: '#e2dfda',
  background: '#cccccc',
  water: '#80deea',
  grassland: '#d2efcf',
  beach: '#e8e4d0',
  industrial: '#d1dde1',
});

export const DARK_SURFACES = Object.freeze({
  earth: '#1f1f1f',
  background: '#34373d',
  water: '#31353f',
  grassland: '#1e291f',
  runway: '#333333',
  buildings: '#111111',
});

/** Every stop must clear this against every surface of its own basemap. */
export const MIN_CONTRAST = 3;
