import { FEATURE_PROPERTIES } from "./data";

function separateWords(word){
  return word.replace(/-/g, ' '); 
}

const capitalizeWords = (str) => str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

export const getYesterdayDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

export const makeTitle = (forecast, feature_id) => {
  const cleanForecast = forecast.replace(/_/g, ' '); // replace all underscores
  const cleanId = separateWords(feature_id);
  return capitalizeWords(`${cleanId} ${cleanForecast} Forecast`);
};

/**
 * The panel's title when there is no forecast to name.
 *
 * makeTitle asserts a forecast, and a selection whose output-file listing is empty has none: the
 * header went on reading "Cat 2884494 Short Range Forecast" over an empty chart while the
 * controls showed a different forecast entirely. The catchment is still selected, so it keeps
 * the header, and with it the control that closes the panel.
 */
export const makeFeatureTitle = (feature_id) =>
  capitalizeWords(separateWords(String(feature_id ?? '')));

export const formatLabel = (key) =>{
 return FEATURE_PROPERTIES[key] || key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}


export const layerIdToFeatureType = (layerId) => {
  switch(layerId) {
    case 'nexus-points':
      return 'id';
    case 'divides':
      return 'divide_id';
    default:
      return null;
  }
};

// The prefixes the hydrofabric index actually uses, in the order the app cares about: a
// catchment is what gets charted, its flowpath is the same reach, and a nexus is the junction
// below it. Lakes carry no prefix, so the bare number is tried last.
const ID_PREFIXES = ['cat', 'wb', 'nex'];

/**
 * The ids worth looking for, given whatever was typed.
 *
 * A bare number is the useful case: people read "2884494" off a chart title or a popup and
 * should not have to know that the catchment is cat-2884494 while its flowpath is wb-2884494.
 * Anything already carrying a prefix is taken as written.
 */
export const searchCandidates = (input) => {
  const trimmed = String(input ?? '').trim().toLowerCase();
  if (!trimmed) return [];
  if (!/^\d+$/.test(trimmed)) return [trimmed];
  return [...ID_PREFIXES.map((prefix) => `${prefix}-${trimmed}`), trimmed];
};

/** The numeric part of a hydrofabric id, which is what the timeseries tables are keyed by. */
export const numericPartOf = (id) => {
  const match = /(\d+)\s*$/.exec(String(id ?? ''));
  return match ? match[1] : null;
};

/**
 * A measurement rounded to something readable at a glance.
 *
 * Streamflow spans orders of magnitude in one vpu, so a fixed number of decimals is either
 * noise at the top of the range or nothing at the bottom. Shared with the map's colour key so
 * the same number reads the same in both places.
 */
export const formatMeasurement = (value) => {
  if (!Number.isFinite(value)) return null;
  const magnitude = Math.abs(value);
  if (magnitude === 0) return '0';
  if (magnitude < 0.01) return value.toExponential(1);
  if (magnitude < 1) return value.toFixed(2);
  if (magnitude < 100) return value.toFixed(1);
  return Math.round(value).toLocaleString();
};

/**
 * How far into the forecast a time step is, in the same form the slider shows.
 *
 * Read from the vpu's own time axis rather than the charted series, because that is the axis the
 * animated values are indexed by. A value without its time invites the reader to take it as the
 * flow rather than the flow at one step of eighteen.
 */
export const timeOffsetLabel = (times, index) => {
  const first = times?.[0];
  const at = times?.[index];
  if (first === undefined || at === undefined) return null;
  const from = new Date(first).getTime();
  const to = new Date(at).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return `T+${Math.round((to - from) / 3600000)}h`;
};

/**
 * A feature property as a reader should see it.
 *
 * Areas and lengths arrive from the tiles as raw doubles, and "36.32444856899953" is not a
 * measurement anyone reads. FeatureInformation already rounds the same fields, so the hover
 * popup should not disagree with the panel about the size of the same catchment.
 */
export const formatPropertyValue = (value) => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatMeasurement(value) ?? String(value);
  return String(value);
};

/**
 * What to tell the reader when the cache could not be written or read.
 *
 * The index failing showed "the id index could not be loaded" and nothing else, with the real
 * reason only in a console error, which is easy to miss behind a level filter. Every cause here
 * is a browser storage condition rather than anything about the data, and each one has a
 * different remedy, so naming which one saves the reader guessing.
 *
 * A few words in every case, the unplaceable one included. This used to fall back to the
 * exception's own text: two hundred characters naming a web api and a cache path, nothing anyone
 * could act on, long enough to push the retry button off the screen. Even the first replacements
 * read as sentences, so they are phrases now. The raw error goes to the console, where a
 * developer can have all of it.
 */
export function cacheFailureReason(err) {
  // By message, not name: duckdb-wasm rethrows the browser's DOMException as a plain Error.
  const text = err?.message ?? '';
  if (/Access Handles cannot be created|createSyncAccessHandle/.test(text)) {
    return 'another tab is using it';
  }
  if (/could not be found/.test(text)) return 'the cache changed, reload';

  switch (err?.name) {
    case 'SecurityError':
    case 'NotAllowedError':
      return 'storage is blocked';
    case 'QuotaExceededError':
      return 'storage is full';
    case 'NoModificationAllowedError':
      return 'another tab is using it';
    case 'TimeoutError':
    case 'AbortError':
      return 'the download stopped';
    case 'DatabaseTimeoutError':
      return 'the database is not responding';
    case 'TypeError':
      return 'could not fetch it';
    default:
      return 'see the console';
  }
}

