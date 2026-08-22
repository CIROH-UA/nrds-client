/**
 * The colours the basemaps actually paint, sampled from the style files.
 *
 * The ramp has to stay visible against these, so they are the test's fixtures. They were read
 * from the two style documents this app loads, not guessed:
 *
 *   https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/styles/light-style.json
 *   https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/styles/dark-style.json
 *
 * Planning assumed the panel tokens stood in for them and was wrong in both directions, which
 * understated how bad the light theme was. Water is here because it is the trap: the shipped
 * ramp's midpoint was #90e0ef against a water fill of #80deea, a contrast of 1.04, so reaches
 * carrying median flow were drawn the colour of lakes.
 *
 * These are a snapshot of files owned elsewhere. If the basemap ever looks wrong, re-sample
 * before believing anything computed from them.
 */
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
