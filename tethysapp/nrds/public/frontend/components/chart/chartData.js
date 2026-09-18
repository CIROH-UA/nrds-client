import { getVariableUnits } from '../../lib/data.js';

/**
 * Pure, DOM-free helpers behind the vanilla timeseries chart (migration unit U4). They are the
 * parts of the chart that can be reasoned about without uPlot or a browser: shaping the store's
 * series into uPlot's columnar data, finding the point nearest a time for the tooltip and the
 * playback cursor, choosing which of the chart's states to show, and wording its labels and
 * messages. Keeping them here lets nrds-chart.js stay a thin uPlot adapter and lets these be
 * tested on their own.
 */

/** uPlot draws a time x-scale in epoch seconds; a store point carries a Date (or an epoch ms). */
export function pointToSeconds(x) {
  const ms = x instanceof Date ? x.getTime() : Number(x);
  return Number.isFinite(ms) ? ms / 1000 : null;
}

/**
 * Shape the store's series points ([{ x: Date, y: number }, ...]) into uPlot's columnar data:
 * [xs, ys] where xs are epoch seconds and ys are numbers (a non-finite value becomes null so the
 * line breaks rather than dips to zero). Time order is preserved from the query, and a point with
 * no finite time is dropped together with its value so the two columns stay aligned.
 */
export function seriesToColumns(series) {
  const points = Array.isArray(series) ? series : [];
  const xs = [];
  const ys = [];
  for (const point of points) {
    const t = pointToSeconds(point?.x);
    if (t === null) continue;
    xs.push(t);
    const y = Number(point?.y);
    ys.push(Number.isFinite(y) ? y : null);
  }
  return [xs, ys];
}

/**
 * The index of the time in a sorted-ascending array nearest to a target time, for snapping the
 * tooltip and the playback cursor to a real point. Returns -1 for an empty array.
 */
export function nearestIndex(xs, target) {
  const n = xs?.length ?? 0;
  if (!n) return -1;
  if (target <= xs[0]) return 0;
  if (target >= xs[n - 1]) return n - 1;

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const v = xs[mid];
    if (v === target) return mid;
    if (v < target) lo = mid;
    else hi = mid;
  }
  return target - xs[lo] <= xs[hi] - target ? lo : hi;
}

/**
 * Which of the chart's four states a timeseries slice is in, mirroring TimeseriesCard's branches:
 * an error that left no data to fall back on wins, then the wait for a feature's first data, then a
 * chart once there is data, and otherwise the empty state.
 */
export function chartState({ series, featureId, loading, answered, failed } = {}) {
  const hasData = Array.isArray(series) && series.length > 0;
  if (Boolean(failed) && !hasData) return 'error';
  const waiting = Boolean(featureId) && (loading || (!hasData && !answered && !failed));
  if (waiting) return 'loading';
  if (hasData) return 'chart';
  return 'empty';
}

/** The y-axis label for a variable: its name, with units in parentheses when it has any. */
export function axisLabel(variable) {
  const name = variable || '';
  if (!name) return '';
  const units = getVariableUnits(name);
  return units ? `${name} (${units})` : name;
}

/** What the empty state says: nothing charted for the current selection, or nothing selected. */
export function emptyMessage({ featureId } = {}) {
  return featureId
    ? `No data to chart for ${featureId} in this selection`
    : 'Select a catchment to see its timeseries';
}

/** What the error state says: the no-output-file case has its own wording. */
export function errorMessage({ failed, featureId } = {}) {
  return failed?.kind === 'no-output-file'
    ? 'No output file for this selection.'
    : `Could not load the timeseries for ${featureId}.`;
}
