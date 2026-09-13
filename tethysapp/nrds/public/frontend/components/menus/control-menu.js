/**
 * The unified map control menu for the build-less NRDS client (migration unit U5b), the vanilla
 * replacement for the React `ControlMenu`. `createControlMenu(container, store)` mounts a floating
 * opener button and a framed panel over the map and returns a teardown that unsubscribes, destroys
 * the shared select, and removes its DOM.
 *
 * The panel gathers the map chrome that was previously scattered: the model-run cascade (the
 * model/date/forecast/cycle/ensemble/output-file "Change the run" selects and Update button, built
 * in components/menus/run-cascade.js and mounted into the run slot here -- U5c), the layer toggles
 * (wired to the store's `layers` slice through
 * set_*_visibility and set_hovered_enabled -- the map already subscribes to those, so toggling
 * recolours/hides live), and the flowpath colour scale (a compact shared select over SCALE_OPTIONS
 * wired to actions.setScale, whose change the colouring driver already reacts to) with the value
 * legend below it.
 *
 * The light/dark theme toggle used to sit here, in an Appearance section, while the shell/navbar was
 * a later migration unit; the shell (U6) has landed, so the toggle now lives in the navbar (see
 * components/shell/theme-toggle.js), matching the React client.
 *
 * This view is pure reflection of the store: a single subscription keeps the switches, the scale
 * select, the symbol swatches, and the legend in step with the store, and every control calls a
 * store action rather than holding any state of its own. The legend reads the same bounds/ramp the
 * map layer uses (boundsFor + readMapTheme) and is recomputed whenever the variable, scale, VPU
 * values, theme, flowpaths visibility, or frame count changes; a theme change also refreshes the
 * symbol swatches, since their colours track the map theme.
 */
import { SCALE_OPTIONS, SCALE_LABELS } from '../../lib/colorScale.js';
import { rampGradient } from '../../lib/valueRamp.js';
import { boundsFor, valueAtRampPosition } from '../../lib/flowpathValues.js';
import { getVariableUnits } from '../../lib/data.js';
import { formatMeasurement } from '../../lib/utils.js';
import { readMapTheme } from '../../lib/mapTheme.js';
import { actions } from '../../store/app-store.js';
import { createSelect } from '../select.js';
import { createRunCascade } from './run-cascade.js';

export const LEGEND_TICKS = [0, 0.5, 1];

/** The scale option currently selected, falling back to the first when the value is unknown. */
export function currentScaleOption(scale) {
  return SCALE_OPTIONS.find((o) => o.value === scale) ?? SCALE_OPTIONS[0];
}

/** The three legend tick labels for a bounds object, or [] when there are no bounds. */
export function legendTicks(bounds) {
  if (!bounds) return [];
  return LEGEND_TICKS.map((t) => formatMeasurement(valueAtRampPosition(t, bounds)));
}

/** The legend title: the variable with its units, and the scale name when it is not plain linear. */
export function legendTitle(variable, scale) {
  if (!variable) return '';
  const units = getVariableUnits(variable);
  const scaleName = SCALE_LABELS[scale] ?? '';
  const title = units ? `${variable} (${units})` : variable;
  return scaleName ? `${title} · ${scaleName}` : title;
}

/** Whether the legend has everything it needs to be shown (flowpaths on, data present, a ramp). */
export function shouldShowLegend({ flowpathsVisible, timesLength, bounds, variable, ramp }) {
  return (
    Boolean(flowpathsVisible) &&
    (timesLength ?? 0) > 0 &&
    Boolean(bounds) &&
    Boolean(variable) &&
    (ramp?.length ?? 0) > 0
  );
}

/** Open by default unless the screen is too small to spare the room (mirrors React shouldStartOpen). */
export function shouldStartOpen() {
  try {
    return window.matchMedia?.('(min-width: 769px)')?.matches ?? true;
  } catch {
    return true;
  }
}

/** Colours for the symbol swatches, read from the same map tokens the layers use. */
function swatchColors() {
  const m = readMapTheme();
  return {
    cursorFill: m.cursorSymbolFill,
    cursorStroke: m.pointStroke,
    catchmentFill: m.dividesHighlightFill,
    catchmentStroke: m.dividesOutline,
    flowStroke: m.flowpaths,
    gaugeFill: m.gauges,
    gaugeStroke: m.pointStroke,
    vpuStroke: m.vpuBoundary,
  };
}

/** The small SVG legend symbols, ported from the React lib/layers symbols. */
const SWATCHES = {
  catchment: (c) =>
    `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">` +
    `<rect x="3" y="4" width="12" height="10" rx="2" ry="2" fill="${c.catchmentFill}" ` +
    `stroke="${c.catchmentStroke}" stroke-width="1.5"/></svg>`,
  flowpaths: (c) =>
    `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">` +
    `<path d="M2 13 C 5 9, 9 11, 16 5" fill="none" stroke="${c.flowStroke}" ` +
    `stroke-width="2" stroke-linecap="round"/></svg>`,
  gauge: (c) =>
    `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">` +
    `<circle cx="9" cy="9" r="4" fill="${c.gaugeFill}" stroke="${c.gaugeStroke}" stroke-width="1.5"/></svg>`,
  vpu: (c) =>
    `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">` +
    `<path d="M2 13 L6 5 L11 9 L16 3" fill="none" stroke="${c.vpuStroke}" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cursor: (c) =>
    `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">` +
    `<path d="M4 3 L4 18 L8.5 14.5 L11 20 L13 19 L10.5 13.5 L15 13 Z" fill="${c.cursorFill}" ` +
    `stroke="${c.cursorStroke}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
};

/** Build one layer toggle row: a labelled swatch on the left, a switch on the right. */
function makeSwitchRow({ id, label, swatchKey, onToggle }) {
  const row = document.createElement('div');
  row.className = 'nrds-control-menu__row';

  const textLabel = document.createElement('label');
  textLabel.className = 'nrds-control-menu__label';
  textLabel.htmlFor = id;

  let swatch = null;
  if (swatchKey) {
    swatch = document.createElement('span');
    swatch.className = 'nrds-control-menu__swatch';
    textLabel.append(swatch);
  }
  textLabel.append(document.createTextNode(label));

  const control = document.createElement('label');
  control.className = 'nrds-switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.setAttribute('role', 'switch');

  const track = document.createElement('span');
  track.className = 'nrds-switch__track';
  const thumb = document.createElement('span');
  thumb.className = 'nrds-switch__thumb';
  track.append(thumb);
  control.append(input, track);

  row.append(textLabel, control);
  input.addEventListener('change', () => onToggle(input.checked));

  return { row, input, swatch, swatchKey };
}

/** A framed section with an optional heading. */
function makeSection({ label, heading }) {
  const section = document.createElement('section');
  section.className = 'nrds-control-menu__section';
  if (label) section.setAttribute('aria-label', label);
  if (heading) {
    const h = document.createElement('h3');
    h.className = 'nrds-control-menu__heading';
    h.textContent = heading;
    section.append(h);
  }
  return section;
}

/** Mount the control menu into `container`, wired to `store`; returns a teardown. */
export function createControlMenu(container, store) {
  const PANEL_ID = 'nrds-control-options';

  const opener = document.createElement('button');
  opener.type = 'button';
  opener.className = 'nrds-control-menu__opener';
  opener.setAttribute('aria-controls', PANEL_ID);
  opener.setAttribute('aria-label', 'Show map controls');
  opener.title = 'Show map controls';
  opener.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true">' +
    '<path d="M4 6h10M4 12h6M4 18h13"/><circle cx="18" cy="6" r="2"/>' +
    '<circle cx="14" cy="12" r="2"/><circle cx="20" cy="18" r="2"/></svg>';

  const panel = document.createElement('div');
  panel.className = 'nrds-control-menu__panel';
  panel.id = PANEL_ID;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Map controls');

  const header = document.createElement('div');
  header.className = 'nrds-control-menu__header';
  const title = document.createElement('h2');
  title.className = 'nrds-control-menu__title';
  title.textContent = 'Map controls';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'nrds-control-menu__close';
  closeBtn.setAttribute('aria-controls', PANEL_ID);
  closeBtn.setAttribute('aria-label', 'Hide map controls');
  closeBtn.title = 'Hide map controls';
  closeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  header.append(title, closeBtn);
  panel.append(header);

  const runSection = makeSection({ label: 'Model run' });
  runSection.classList.add('nrds-control-menu__section--run');
  const runSlot = document.createElement('div');
  runSlot.className = 'nrds-control-menu__run-slot';
  runSlot.dataset.runCascadeSlot = '';
  runSection.append(runSlot);
  panel.append(runSection);
  const teardownRunCascade = createRunCascade(runSlot, store);

  const layersSection = makeSection({ label: 'Layers', heading: 'Layer Options' });

  const catchmentRow = makeSwitchRow({
    id: 'nrds-catchment-switch',
    label: 'Catchments',
    swatchKey: 'catchment',
    onToggle: (v) => actions.set_catchments_visibility(v),
  });
  const flowpathsRow = makeSwitchRow({
    id: 'nrds-flowpaths-switch',
    label: 'FlowPaths',
    swatchKey: 'flowpaths',
    onToggle: (v) => actions.set_flowpaths_visibility(v),
  });
  const gaugesRow = makeSwitchRow({
    id: 'nrds-conus-gauges-switch',
    label: 'Conus Gauges',
    swatchKey: 'gauge',
    onToggle: (v) => actions.set_conus_gauges_visibility(v),
  });
  const vpuRow = makeSwitchRow({
    id: 'nrds-vpu-switch',
    label: 'VPU Boundaries',
    swatchKey: 'vpu',
    onToggle: (v) => actions.set_vpu_visibility(v),
  });

  const interactionsHeading = document.createElement('p');
  interactionsHeading.className = 'nrds-control-menu__subheading';
  interactionsHeading.textContent = 'Map Interactions';

  const hoverRow = makeSwitchRow({
    id: 'nrds-enable-hovering-switch',
    label: 'Enable Hovering',
    swatchKey: 'cursor',
    onToggle: (v) => actions.set_hovered_enabled(v),
  });

  layersSection.append(
    catchmentRow.row,
    flowpathsRow.row,
    gaugesRow.row,
    vpuRow.row,
    interactionsHeading,
    hoverRow.row
  );
  panel.append(layersSection);

  const swatchRows = [catchmentRow, flowpathsRow, gaugesRow, vpuRow, hoverRow];

  const valuesSection = makeSection({ label: 'Flowpath values', heading: 'Flowpath values' });

  const scaleRow = document.createElement('div');
  scaleRow.className = 'nrds-control-menu__row nrds-control-menu__row--scale';
  const scaleLabel = document.createElement('span');
  scaleLabel.className = 'nrds-control-menu__label';
  scaleLabel.textContent = 'Color scale';
  const scaleHost = document.createElement('div');
  scaleHost.className = 'nrds-control-menu__scale-select';
  scaleRow.append(scaleLabel, scaleHost);
  valuesSection.append(scaleRow);

  const scaleSelect = createSelect({
    container: scaleHost,
    options: SCALE_OPTIONS,
    value: store.get().vpu.scale,
    compact: true,
    id: 'nrds-color-scale-select',
    label: 'Color scale',
    onChange: (opt) => opt && actions.setScale(opt.value),
  });

  const legend = document.createElement('div');
  legend.className = 'nrds-control-menu__legend';
  legend.setAttribute('aria-label', 'Colour scale');
  const legendTitleEl = document.createElement('div');
  legendTitleEl.className = 'nrds-control-menu__legend-title';
  const legendBarEl = document.createElement('div');
  legendBarEl.className = 'nrds-control-menu__legend-bar';
  const legendScaleEl = document.createElement('div');
  legendScaleEl.className = 'nrds-control-menu__legend-scale';
  const tickSpans = LEGEND_TICKS.map(() => document.createElement('span'));
  legendScaleEl.append(...tickSpans);
  legend.append(legendTitleEl, legendBarEl, legendScaleEl);
  legend.hidden = true;
  valuesSection.append(legend);
  panel.append(valuesSection);

  container.append(opener, panel);

  let open = shouldStartOpen();
  const applyOpen = (moveFocus) => {
    opener.hidden = open;
    panel.hidden = !open;
    opener.setAttribute('aria-expanded', String(open));
    if (moveFocus) {
      if (open) closeBtn.focus();
      else opener.focus();
    }
  };
  opener.addEventListener('click', () => {
    open = true;
    applyOpen(true);
  });
  closeBtn.addEventListener('click', () => {
    open = false;
    applyOpen(true);
  });
  applyOpen(false);

  const refreshSwatches = () => {
    const colors = swatchColors();
    for (const { swatch, swatchKey } of swatchRows) {
      if (swatch) swatch.innerHTML = SWATCHES[swatchKey](colors);
    }
  };

  const renderLegend = ({ variable, scale, flowVisible, timesLen, valuesRef }) => {
    const ramp = readMapTheme().ramp;
    const bounds = boundsFor(valuesRef);
    const show = shouldShowLegend({
      flowpathsVisible: flowVisible,
      timesLength: timesLen,
      bounds,
      variable,
      ramp,
    });
    legend.hidden = !show;
    if (!show) return;
    legendTitleEl.textContent = legendTitle(variable, scale);
    legendBarEl.style.background = rampGradient(ramp);
    const ticks = legendTicks(bounds);
    tickSpans.forEach((span, i) => {
      span.textContent = ticks[i] ?? '';
    });
  };

  const prev = {};
  const render = () => {
    const s = store.get();

    catchmentRow.input.checked = s.layers.catchments.visible;
    flowpathsRow.input.checked = s.layers.flowpaths.visible;
    gaugesRow.input.checked = s.layers.conus_gauges.visible;
    vpuRow.input.checked = s.layers.vpu.visible;
    hoverRow.input.checked = s.layers.hovered_enabled;

    scaleSelect.setValue(s.vpu.scale);

    const variable = s.timeseries.variable;
    const scale = s.vpu.scale;
    const flowVisible = s.layers.flowpaths.visible;
    const timesLen = s.vpu.times.length;
    const theme = s.theme.theme;
    const valuesRef = s.vpu.valuesByVar?.[variable];

    if (theme !== prev.theme) {
      refreshSwatches();
    }

    if (
      variable !== prev.variable ||
      scale !== prev.scale ||
      flowVisible !== prev.flowVisible ||
      timesLen !== prev.timesLen ||
      theme !== prev.theme ||
      valuesRef !== prev.valuesRef
    ) {
      renderLegend({ variable, scale, flowVisible, timesLen, valuesRef });
    }

    prev.variable = variable;
    prev.scale = scale;
    prev.flowVisible = flowVisible;
    prev.timesLen = timesLen;
    prev.theme = theme;
    prev.valuesRef = valuesRef;
  };

  const unsubscribe = store.subscribe(() => render());
  render();

  return () => {
    unsubscribe();
    teardownRunCascade();
    scaleSelect.destroy();
    opener.remove();
    panel.remove();
  };
}

export default createControlMenu;
