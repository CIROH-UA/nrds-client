import uPlot from 'uplot';

import {
  seriesToColumns,
  nearestIndex,
  pointToSeconds,
  chartState,
  axisLabel,
  emptyMessage,
  errorMessage,
} from './chartData.js';

/**
 * The vanilla uPlot timeseries chart for the build-less NRDS client (migration unit U4), the
 * replacement for the React @visx Plot and its TimeseriesCard wrapper. `createChart(container,
 * store)` builds the chart's DOM inside `container`, subscribes to the shared store, and returns a
 * teardown that unsubscribes, disconnects its ResizeObserver, and destroys the uPlot instance.
 *
 * It is a factory, not a custom element mounted anywhere: a later unit (the popup/sheet, U5) owns
 * where the chart lives, so this only knows how to draw one into the node it is handed.
 *
 * States: it shows a loading, empty ("no data"), or error message instead of a chart whenever the
 * timeseries slice is in one of those states (chartState), matching TimeseriesCard; the error state
 * includes the no-output-file wording. When there is data it draws the series with a time x-axis, a
 * value y-axis labelled with the variable's units, a crosshair cursor, and a tooltip showing the
 * nearest point's date and value. Series stroke, axes, grid, and crosshair colours come from the
 * --chart-* CSS tokens, re-read when the theme changes (the plot is rebuilt, since uPlot bakes the
 * strokes in). A ResizeObserver keeps the canvas sized to its host.
 *
 * Playback: while the store reports isPlaying, mouse hover is suppressed and the cursor is driven to
 * the point at currentTimeIndex, so the chart's crosshair tracks the map animation's clock.
 */

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 260;
const LOADING_TEXT = 'Loading the timeseries';

/** The chart palette read from the host's computed --chart-* tokens, with hex fallbacks. */
function readColors(el) {
  const cs = getComputedStyle(el);
  const token = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    line: token('--chart-line-0', '#2571b5'),
    axis: token('--chart-axis-tick-text-color', '#1a1f24'),
    label: token('--chart-axis-label-color', '#1a1f24'),
    grid: token('--chart-grid-color', '#dbdee2'),
    crosshair: token('--chart-crosshair-color', '#585e65'),
  };
}

const pad2 = (n) => String(n).padStart(2, '0');

/** A tooltip timestamp in the reader's local time, matching the React tooltip's format. */
function formatTimestamp(seconds) {
  const d = new Date(seconds * 1000);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

/** A tooltip value rounded the way the React tooltip rounded it. */
function formatValue(value) {
  return value == null || Number.isNaN(value) ? '-' : Number(value).toFixed(2);
}

/**
 * A uPlot plugin that renders the date/value tooltip from the cursor's current index. It reads the
 * colour for the value from the series stroke and positions itself within the plotting overlay.
 */
function tooltipPlugin(colors) {
  let tip;
  return {
    hooks: {
      init: (u) => {
        tip = document.createElement('div');
        tip.className = 'nrds-chart__tooltip';
        tip.hidden = true;
        u.over.appendChild(tip);
      },
      setCursor: (u) => {
        const { idx, left, top } = u.cursor;
        const xs = u.data[0];
        if (idx == null || left == null || left < 0 || !xs || !xs.length) {
          if (tip) tip.hidden = true;
          return;
        }
        const t = xs[idx];
        const y = u.data[1]?.[idx];
        if (t == null) {
          tip.hidden = true;
          return;
        }
        tip.innerHTML =
          `<div class="nrds-chart__tooltip-date">${formatTimestamp(t)}</div>` +
          `<div class="nrds-chart__tooltip-value" style="color:${colors.line}">` +
          `${formatValue(y)}</div>`;
        tip.hidden = false;
        const width = u.over.clientWidth;
        const flip = left > width - tip.offsetWidth - 16;
        const x = flip ? left - tip.offsetWidth - 12 : left + 12;
        tip.style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, top)}px)`;
      },
    },
  };
}

/** Build a chart into `container`, wired to `store`; returns a teardown. */
export function createChart(container, store) {
  const root = document.createElement('div');
  root.className = 'nrds-chart';

  const message = document.createElement('div');
  message.className = 'nrds-chart__message';
  message.setAttribute('role', 'status');

  const canvasHost = document.createElement('div');
  canvasHost.className = 'nrds-chart__canvas';

  root.append(message, canvasHost);
  container.append(root);

  let plot = null;
  let lastTheme = null;
  let lastVariable = null;
  let lastSeries = null;
  let playing = false;

  const destroyPlot = () => {
    if (plot) {
      plot.destroy();
      plot = null;
    }
    lastVariable = null;
    lastSeries = null;
  };

  const build = () => {
    destroyPlot();
    const { series, variable } = store.get().timeseries;
    const colors = readColors(root);
    const width = canvasHost.clientWidth || DEFAULT_WIDTH;
    const height = canvasHost.clientHeight || DEFAULT_HEIGHT;

    const opts = {
      width,
      height,
      cursor: {
        x: true,
        y: true,
        drag: { x: true, y: false },
        points: { show: true },
      },
      legend: { show: false },
      scales: { x: { time: true } },
      axes: [
        {
          stroke: colors.axis,
          grid: { show: true, stroke: colors.grid, width: 1 },
          ticks: { stroke: colors.grid },
        },
        {
          stroke: colors.axis,
          label: axisLabel(variable),
          labelSize: 14,
          grid: { show: true, stroke: colors.grid, width: 1 },
          ticks: { stroke: colors.grid },
        },
      ],
      series: [
        {},
        {
          label: variable || 'value',
          stroke: colors.line,
          width: 2,
          spanGaps: false,
          points: { show: false },
        },
      ],
      plugins: [tooltipPlugin(colors)],
    };

    plot = new uPlot(opts, seriesToColumns(series), canvasHost);
    lastVariable = variable;
    lastSeries = series;
  };

  const resize = () => {
    if (!plot || canvasHost.hidden) return;
    const width = canvasHost.clientWidth || DEFAULT_WIDTH;
    const height = canvasHost.clientHeight || DEFAULT_HEIGHT;
    if (plot.width === width && plot.height === height) return;
    plot.setSize({ width, height });
    syncPlayback();
  };

  /**
   * The chart point the animation clock is on. The clock indexes the VPU times, which need not be
   * sampled the same as the charted series, so the clock's time is snapped to the nearest chart
   * point; with no VPU times (or an unreadable one) the clock index is used directly.
   */
  const playbackIndex = (xs, currentTimeIndex) => {
    const vpuTimes = store.get().vpu.times;
    const fallback = Math.max(0, Math.min(currentTimeIndex, xs.length - 1));
    if (!vpuTimes || !vpuTimes.length) return fallback;
    const clock = vpuTimes[Math.max(0, Math.min(currentTimeIndex, vpuTimes.length - 1))];
    const clockSeconds = pointToSeconds(clock);
    return clockSeconds == null ? fallback : nearestIndex(xs, clockSeconds);
  };

  /** Track the animation clock: suppress hover and drive the cursor to currentTimeIndex's point. */
  const syncPlayback = () => {
    if (!plot) return;
    const ts = store.get().timeseries;
    const wasPlaying = playing;
    playing = Boolean(ts.isPlaying);

    if (!playing) {
      plot.over.style.pointerEvents = '';
      if (wasPlaying) plot.setCursor({ left: -10, top: -10 });
      return;
    }

    plot.over.style.pointerEvents = 'none';
    const xs = plot.data[0];
    if (!xs || !xs.length) return;
    const idx = playbackIndex(xs, ts.currentTimeIndex);
    const xVal = xs[idx];
    const yVal = plot.data[1]?.[idx];
    const left = plot.valToPos(xVal, 'x');
    const top = yVal == null ? plot.over.clientHeight / 2 : plot.valToPos(yVal, 'y');
    plot.setCursor({ left, top });
  };

  const showMessage = (state, ts) => {
    destroyPlot();
    canvasHost.hidden = true;
    message.hidden = false;
    message.className = `nrds-chart__message nrds-chart__message--${state}`;
    if (state === 'error') {
      message.textContent = errorMessage({ failed: ts.last_error, featureId: ts.feature_id });
    } else if (state === 'loading') {
      message.textContent = LOADING_TEXT;
    } else {
      message.textContent = emptyMessage({ featureId: ts.feature_id });
    }
  };

  const render = () => {
    const ts = store.get().timeseries;
    const theme = store.get().theme.theme;

    const state = chartState({
      series: ts.series,
      featureId: ts.feature_id,
      loading: ts.loading,
      answered: ts.last_answered_key,
      failed: ts.last_error,
    });

    if (state !== 'chart') {
      lastTheme = theme;
      showMessage(state, ts);
      return;
    }

    message.hidden = true;
    canvasHost.hidden = false;

    const themeChanged = theme !== lastTheme;
    lastTheme = theme;

    if (!plot || themeChanged || ts.variable !== lastVariable) {
      build();
    } else if (ts.series !== lastSeries) {
      plot.setData(seriesToColumns(ts.series));
      lastSeries = ts.series;
    }

    syncPlayback();
  };

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvasHost);

  const unsubscribe = store.subscribe(() => render());
  render();

  return () => {
    unsubscribe();
    observer.disconnect();
    destroyPlot();
    root.remove();
  };
}
