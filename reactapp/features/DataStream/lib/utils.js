import { isMissing, isStalled } from 'features/DataStream/lib/fetchParquet';
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
 * The run, named for the caption under the panel's heading.
 *
 * It used to be part of the heading, which made a two-line title in a 400px panel out of two
 * facts of different kinds: which catchment this is, which does not change while the panel is
 * open, and which run produced the numbers, which the controls below can change. The first is
 * the name of the thing; the second is a property of it.
 */
export const makeRunLabel = (forecast) =>
  capitalizeWords(`${String(forecast ?? '').replace(/_/g, ' ')} Forecast`);

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
    case 'divides':
      return 'divide_id';
    default:
      return null;
  }
};

// The prefixes the hydrofabric index uses for things this app can show, in the order it cares
// about: a catchment is what gets charted and its flowpath is the same reach. nex- was tried
// third until the nexus layer was removed; the index still carries those rows, but a search
// hitting one would fly the map to a point where nothing is drawn and nothing can be selected.
const ID_PREFIXES = ['cat', 'wb'];

/**
 * The ids worth looking for, given whatever was typed.
 *
 * A bare number is the useful case: people read "2884494" off a chart title or a popup and
 * should not have to know that the catchment is cat-2884494 while its flowpath is wb-2884494.
 * Anything already carrying a prefix is taken as written.
 */
// The nexus family: a plain nexus, and the terminal, coastal and internal variants. The index
// still carries 409,122 of these rows, and none of them can be shown since the nexus layer was
// removed, so a search naming one is a miss rather than a place to fly to.
const UNMAPPED_PREFIXES = /^(nex|tnx|cnx|inx)-/;

export const searchCandidates = (input) => {
  const trimmed = String(input ?? '').trim().toLowerCase();
  if (!trimmed) return [];
  if (UNMAPPED_PREFIXES.test(trimmed)) return [];
  if (!/^\d+$/.test(trimmed)) return [trimmed];
  return [...ID_PREFIXES.map((prefix) => `${prefix}-${trimmed}`), trimmed];
};

/**
 * A byte count a reader can take in at a glance.
 *
 * Lived in opfsCache while the cache reported what it had stored; it is a formatting helper with
 * no storage concern, so it outlived that file.
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/** The duckdb table a key names: the same key without its extension. */
export const tableNameForKey = (key) => String(key).replace(/\.parquet$/i, "");

/**
 * One name for a selection, used as the duckdb table and as what the UI reports.
 *
 * Every separator a hydrofabric path can carry becomes an underscore, because the result is a
 * SQL identifier. It no longer rewrites a .nc extension to .arrow: the app reads parquet, and
 * a NetCDF output is filtered out of the listing before it can be selected.
 */
export function getCacheKey(model, date, forecast, cycle, ensemble, vpu, outputFile) {
  const parts = ensemble
    ? `${model}_${date}_${forecast}_${cycle}_${ensemble}_${vpu}`
    : `${model}_${date}_${forecast}_${cycle}_${vpu}`;
  return parts.replace(/\./g, '_').replace(/\//g, '_') + `_${outputFile}`;
}

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
 * A few words when it can place the failure, and null when it cannot, so the caller can keep its
 * own wording rather than print a phrase that says nothing. This used to fall back to the
 * exception's own text: two hundred characters naming a web api and a cache path, nothing anyone
 * could act on, long enough to push the retry button off the screen. Even the first replacements
 * read as sentences, so they are phrases now. The raw error goes to the console, where a
 * developer can have all of it.
 */
export function cacheFailureReason(err) {
  // Asked through the same predicates the fetch decides with, so the two cannot drift apart.
  if (isStalled(err)) return 'the download stopped';
  if (isMissing(err)) return 'the file is not there';

  switch (err?.name) {
    case 'TimeoutError':
      return 'the download stopped';
    case 'DatabaseTimeoutError':
      return 'the database is not responding';
    case 'TypeError':
      return 'could not fetch it';
    default:
      // null rather than a phrase: a caller that cannot place the failure has a better sentence
      // of its own, and the reader was being shown "see the console" as if it were a reason.
      return null;
  }
}


/**
 * The frame's own timestamp, as the reader would write it.
 *
 * The slider said "T+5h", which is only meaningful if you already know when the forecast starts
 * -- and the reader is usually asking the opposite question: what time is this frame. The times
 * are epoch milliseconds out of duckdb, Dates tolerated because the chart's series carries those.
 *
 * Rendered in UTC and labelled as such. Forecast cycles are named in UTC and the reader's own
 * timezone would quietly shift every frame away from the cycle it belongs to.
 */
export const formatFrameTime = (value) => {
  // Rejected before Number(), which turns null and '' into 0 and would render them as 1970.
  if (value === null || value === undefined || value === '') return '';

  const ms = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(ms)) return '';

  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
};

/**
 * A time format that gives every tick a different label.
 *
 * The axis used to pick its format from the forecast name -- %H:%M for short range, %m/%d for
 * anything longer -- which says nothing about how the ticks actually fall. A medium-range chart
 * spanning under two days gets two ticks on the same calendar day and drew them both as
 * "08/31": an axis with two identical labels, which is an axis with none.
 *
 * The ticks are what decide. Coarsest format first, refined only when it collides, so a chart
 * that spans days is not labelled to the minute for no reason.
 *
 * Returns a d3 format string. Ordered coarse to fine; the last is the fallback when even
 * seconds collide, which means the ticks are duplicates and no format can separate them.
 */
const TICK_FORMATS = ['%m/%d', '%m/%d %H:%M', '%H:%M', '%H:%M:%S'];

export const distinctTickFormat = (ticks, format) => {
  const values = (ticks || []).filter((t) => t instanceof Date || Number.isFinite(t));
  if (values.length < 2) return TICK_FORMATS[0];

  const sameDay = values.every(
    (t) => new Date(t).toDateString() === new Date(values[0]).toDateString()
  );
  // Within one day the date is the same on every tick, so it is noise rather than a label.
  const candidates = sameDay ? ['%H:%M', '%H:%M:%S'] : TICK_FORMATS;

  for (const candidate of candidates) {
    const labels = values.map((t) => format(candidate)(t));
    if (new Set(labels).size === labels.length) return candidate;
  }
  return candidates[candidates.length - 1];
};
