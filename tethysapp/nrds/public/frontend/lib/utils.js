import { FEATURE_PROPERTIES } from "./data.js";
import { isMissing, isStalled } from "./fetchParquet.js";

export const formatLabel = (key) =>{
 return FEATURE_PROPERTIES[key] || key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const separateWords = (word) => String(word ?? '').replace(/-/g, ' ');

const capitalizeWords = (str) =>
  str.split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

/** The run, named for the caption under the panel's heading. */
export const makeRunLabel = (forecast) =>
  capitalizeWords(`${String(forecast ?? '').replace(/_/g, ' ')} Forecast`);

/** The panel's title when there is no forecast to name. */
export const makeFeatureTitle = (feature_id) =>
  capitalizeWords(separateWords(feature_id));

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

/** A frame timestamp (epoch ms, or a Date) as a UTC wall-clock label for the time slider readout. */
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

/** One name for a selection, used as the duckdb table and as what the UI reports. */
export function getCacheKey(model, date, forecast, cycle, ensemble, vpu, outputFile) {
  const parts = ensemble
    ? `${model}_${date}_${forecast}_${cycle}_${ensemble}_${vpu}`
    : `${model}_${date}_${forecast}_${cycle}_${vpu}`;
  return parts.replace(/\./g, '_').replace(/\//g, '_') + `_${outputFile}`;
}

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
