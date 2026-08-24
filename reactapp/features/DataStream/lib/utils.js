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
  const cleanForecast = forecast.replace(/_/g, ' ');
  const cleanId = separateWords(feature_id);
  return capitalizeWords(`${cleanId} ${cleanForecast} Forecast`);
};

/** The run, named for the caption under the panel's heading. */
export const makeRunLabel = (forecast) =>
  capitalizeWords(`${String(forecast ?? '').replace(/_/g, ' ')} Forecast`);

/** The panel's title when there is no forecast to name. */
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

/** The ids worth looking for, given whatever was typed. */
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

/** A byte count a reader can take in at a glance. */
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

/** One name for a selection, used as the duckdb table and as what the UI reports. */
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

/** A measurement rounded to something readable at a glance. */
export const formatMeasurement = (value) => {
  if (!Number.isFinite(value)) return null;
  const magnitude = Math.abs(value);
  if (magnitude === 0) return '0';
  if (magnitude < 0.01) return value.toExponential(1);
  if (magnitude < 1) return value.toFixed(2);
  if (magnitude < 100) return value.toFixed(1);
  return Math.round(value).toLocaleString();
};

/** How far into the forecast a time step is, in the same form the slider shows. */
export const timeOffsetLabel = (times, index) => {
  const first = times?.[0];
  const at = times?.[index];
  if (first === undefined || at === undefined) return null;
  const from = new Date(first).getTime();
  const to = new Date(at).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return `T+${Math.round((to - from) / 3600000)}h`;
};

/** A feature property as a reader should see it. */
export const formatPropertyValue = (value) => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatMeasurement(value) ?? String(value);
  return String(value);
};

/** What to tell the reader when the cache could not be written or read. */
export function cacheFailureReason(err) {
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
      return null;
  }
}

/** The frame's own timestamp, as the reader would write it. */
export const formatFrameTime = (value) => {
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

/** A time format that gives every tick a different label. */
const TICK_FORMATS = ['%m/%d', '%m/%d %H:%M', '%H:%M', '%H:%M:%S'];

/** A tick format that does not print two ticks on one day identically. */
export const distinctTickFormat = (ticks, format) => {
  const values = (ticks || []).filter((t) => t instanceof Date || Number.isFinite(t));
  if (values.length < 2) return TICK_FORMATS[0];

  const sameDay = values.every(
    (t) => new Date(t).toDateString() === new Date(values[0]).toDateString()
  );
  const candidates = sameDay ? ['%H:%M', '%H:%M:%S'] : TICK_FORMATS;

  for (const candidate of candidates) {
    const labels = values.map((t) => format(candidate)(t));
    if (new Set(labels).size === labels.length) return candidate;
  }
  return candidates[candidates.length - 1];
};
