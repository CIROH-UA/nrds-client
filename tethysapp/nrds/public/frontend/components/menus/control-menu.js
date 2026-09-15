/**
 * The unified map control menu for the build-less NRDS client (migration unit U5b), the vanilla
 * replacement for the React `ControlMenu`. `createControlMenu(container, store)` mounts a floating
 * opener button and a framed panel over the map and returns a teardown that unsubscribes, destroys
 * the shared select and the modals, and removes its DOM.
 *
 * The panel is organised top to bottom as Showing (the run configuration behind a summarised button
 * that opens a modal, the variable picker, and the value legend, whose header carries a reverse
 * toggle and the settings gear that opens the ramp + scale modal), Layers (the four layer toggles)
 * and Map Settings (the hover toggle). The run cascade (components/menus/run-cascade.js) and the
 * variable picker (components/map/variable-picker.js) are mounted into their slots here.
 *
 * This view is pure reflection of the store: a single subscription keeps the switches, the run
 * summary, the colour scale, the ramp choice, the reverse state, the symbol swatches, and the legend
 * in step, and every control calls a store action rather than holding state of its own. The legend
 * reads the effective ramp (theme.rampName, reversed when theme.rampReversed), falling back to the
 * theme ramp.
 */
import { SCALE_OPTIONS, SCALE_LABELS } from '../../lib/colorScale.js';
import { rampGradient, RAMPS, rampFor, resolveRamp, orientRamp } from '../../lib/valueRamp.js';
import { boundsFor, valueAtRampPosition } from '../../lib/flowpathValues.js';
import { getVariableUnits } from '../../lib/data.js';
import { formatMeasurement } from '../../lib/utils.js';
import { readMapTheme } from '../../lib/mapTheme.js';
import { actions } from '../../store/app-store.js';
import { createSelect } from '../select.js';
import { createModal } from '../modal.js';
import { createRunCascade } from './run-cascade.js';
import { createVariablePicker } from '../map/variable-picker.js';

export const LEGEND_TICKS = [0, 0.5, 1];

/** Short forecast codes for the run summary, matching the datastream forecast folder names. */
const FORECAST_ABBR = {
  short_range: 'SR',
  medium_range: 'MR',
  analysis_assim_extend: 'AAE',
  analysis_assim: 'AA',
};

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

/** A one-line summary of the selected run: model, forecast code, date and cycle. */
export function summarizeRun({ model, date, forecast, cycle } = {}) {
  if (!model && !date) return 'Select a run';
  const fc = FORECAST_ABBR[forecast] ?? (forecast ? forecast.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() : '');
  const day = typeof date === 'string' ? date.replace(/^ngen\./, '') : '';
  const dayCycle = day ? (cycle ? `${day}.${cycle}` : day) : '';
  return [model, fc, dayCycle].filter(Boolean).join(' ');
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

/** The effective ramp as drawn: the chosen named ramp (else the theme ramp), reversed when set. */
function effectiveRamp(store) {
  const t = store.get().theme;
  return orientRamp(resolveRamp(t.rampName, readMapTheme().ramp), t.rampReversed);
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

/** A small stacked field: a label above its control. */
function makeField(labelText) {
  const field = document.createElement('div');
  field.className = 'nrds-control-menu__field';
  const label = document.createElement('span');
  label.className = 'nrds-control-menu__field-label';
  label.textContent = labelText;
  field.append(label);
  return { field, label };
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

  // --- Showing section: configuration, variable, and the value legend ---
  const showingSection = makeSection({ label: 'Showing', heading: 'Showing' });

  const configField = makeField('Configuration');
  const configButton = document.createElement('button');
  configButton.type = 'button';
  configButton.className = 'nrds-control-menu__config-button';
  const configSummary = document.createElement('span');
  configSummary.className = 'nrds-control-menu__config-summary';
  configButton.append(configSummary);
  const configChevron = document.createElement('span');
  configChevron.className = 'nrds-control-menu__config-chevron';
  configChevron.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  configButton.append(configChevron);
  configField.field.append(configButton);
  showingSection.append(configField.field);

  const variableHost = document.createElement('div');
  variableHost.className = 'nrds-control-menu__variable-host';
  showingSection.append(variableHost);
  const teardownVariablePicker = createVariablePicker(variableHost, store);

  // The legend sits under the variable: its gradient is the ramp preview, and its header carries a
  // reverse toggle and the settings gear that opens the ramp + scale modal.
  const legendField = document.createElement('div');
  legendField.className = 'nrds-control-menu__field';

  const legendHeader = document.createElement('div');
  legendHeader.className = 'nrds-control-menu__legend-header';
  const legendLabel = document.createElement('span');
  legendLabel.className = 'nrds-control-menu__field-label';
  legendLabel.textContent = 'Legend';
  const legendTools = document.createElement('div');
  legendTools.className = 'nrds-control-menu__legend-tools';

  const reverseBtn = document.createElement('button');
  reverseBtn.type = 'button';
  reverseBtn.className = 'nrds-control-menu__icon-button';
  reverseBtn.setAttribute('aria-label', 'Reverse color ramp');
  reverseBtn.setAttribute('aria-pressed', 'false');
  reverseBtn.title = 'Reverse colors';
  reverseBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M17 4l3 3-3 3"/><path d="M20 7H9"/><path d="M7 20l-3-3 3-3"/><path d="M4 17h11"/></svg>';
  reverseBtn.addEventListener('click', () => actions.toggleRampReversed());

  const colorBarBtn = document.createElement('button');
  colorBarBtn.type = 'button';
  colorBarBtn.className = 'nrds-control-menu__icon-button';
  colorBarBtn.setAttribute('aria-label', 'Color ramp settings');
  colorBarBtn.title = 'Color ramp settings';
  colorBarBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  legendTools.append(reverseBtn, colorBarBtn);
  legendHeader.append(legendLabel, legendTools);

  const legend = document.createElement('div');
  legend.className = 'nrds-control-menu__legend';
  const legendTitleEl = document.createElement('div');
  legendTitleEl.className = 'nrds-control-menu__legend-title';
  const legendBarEl = document.createElement('div');
  legendBarEl.className = 'nrds-control-menu__legend-bar';
  legendBarEl.setAttribute('aria-hidden', 'true');
  const legendScaleEl = document.createElement('div');
  legendScaleEl.className = 'nrds-control-menu__legend-scale';
  const tickSpans = LEGEND_TICKS.map(() => document.createElement('span'));
  legendScaleEl.append(...tickSpans);
  legend.append(legendTitleEl, legendBarEl, legendScaleEl);
  const legendEmpty = document.createElement('p');
  legendEmpty.className = 'nrds-control-menu__legend-empty';
  legendEmpty.textContent = 'Load a run to see the value scale.';
  legendField.append(legendHeader, legend, legendEmpty);
  showingSection.append(legendField);
  panel.append(showingSection);

  // --- Layers section ---
  const layersSection = makeSection({ label: 'Layers', heading: 'Layers' });
  const catchmentRow = makeSwitchRow({
    id: 'nrds-catchment-switch',
    label: 'Catchments',
    swatchKey: 'catchment',
    onToggle: (v) => actions.set_catchments_visibility(v),
  });
  const flowpathsRow = makeSwitchRow({
    id: 'nrds-flowpaths-switch',
    label: 'Flowpaths',
    swatchKey: 'flowpaths',
    onToggle: (v) => actions.set_flowpaths_visibility(v),
  });
  const gaugesRow = makeSwitchRow({
    id: 'nrds-conus-gauges-switch',
    label: 'Gauges',
    swatchKey: 'gauge',
    onToggle: (v) => actions.set_conus_gauges_visibility(v),
  });
  const vpuRow = makeSwitchRow({
    id: 'nrds-vpu-switch',
    label: 'VPU Boundaries',
    swatchKey: 'vpu',
    onToggle: (v) => actions.set_vpu_visibility(v),
  });
  layersSection.append(catchmentRow.row, flowpathsRow.row, gaugesRow.row, vpuRow.row);
  panel.append(layersSection);

  // --- Map Settings section ---
  const settingsSection = makeSection({ label: 'Map Settings', heading: 'Map Settings' });
  const hoverRow = makeSwitchRow({
    id: 'nrds-enable-hovering-switch',
    label: 'Enable Hovering',
    swatchKey: 'cursor',
    onToggle: (v) => actions.set_hovered_enabled(v),
  });
  settingsSection.append(hoverRow.row);
  panel.append(settingsSection);

  const swatchRows = [catchmentRow, flowpathsRow, gaugesRow, vpuRow, hoverRow];

  container.append(opener, panel);

  // --- Configuration modal: the run cascade ---
  const configModal = createModal({ title: 'Configuration', className: 'nrds-dialog--config' });
  const teardownRunCascade = createRunCascade(configModal.content, store);
  configButton.addEventListener('click', () => configModal.open());

  // --- Color Bar modal: ramp choices + colour scale ---
  const colorModal = createModal({ title: 'Color Bar', className: 'nrds-dialog--colorbar' });
  const rampField = makeField('Color ramp');
  const rampList = document.createElement('div');
  rampList.className = 'nrds-ramp-list';
  rampList.setAttribute('role', 'radiogroup');
  rampList.setAttribute('aria-label', 'Color ramp');
  const rampButtons = Object.entries(RAMPS).map(([name, { label }]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nrds-ramp-option';
    btn.dataset.ramp = name;
    btn.setAttribute('role', 'radio');
    const bar = document.createElement('span');
    bar.className = 'nrds-ramp-option__bar';
    bar.setAttribute('aria-hidden', 'true');
    bar.style.background = rampGradient(rampFor(name));
    const text = document.createElement('span');
    text.className = 'nrds-ramp-option__label';
    text.textContent = label;
    btn.append(bar, text);
    btn.addEventListener('click', () => actions.setRamp(name));
    rampList.append(btn);
    return { name, btn };
  });
  rampField.field.append(rampList);

  const scaleField = makeField('Color scale');
  const scaleHost = document.createElement('div');
  scaleHost.className = 'nrds-control-menu__scale-select';
  scaleField.field.append(scaleHost);
  const scaleSelect = createSelect({
    container: scaleHost,
    options: SCALE_OPTIONS,
    value: store.get().vpu.scale,
    id: 'nrds-color-scale-select',
    label: 'Color scale',
    onChange: (opt) => opt && actions.setScale(opt.value),
  });
  colorModal.content.append(rampField.field, scaleField.field);
  colorBarBtn.addEventListener('click', () => colorModal.open());

  // --- open/close the panel ---
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
    const ramp = effectiveRamp(store);
    const bounds = boundsFor(valuesRef);
    const show = shouldShowLegend({
      flowpathsVisible: flowVisible,
      timesLength: timesLen,
      bounds,
      variable,
      ramp,
    });
    legend.hidden = !show;
    legendEmpty.hidden = show;
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

    const rampName = s.theme.rampName;
    const reversed = s.theme.rampReversed;
    configSummary.textContent = summarizeRun(s.datastream);

    if (rampName !== prev.rampName) {
      for (const { name, btn } of rampButtons) {
        const on = name === rampName;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    }

    if (reversed !== prev.reversed) {
      reverseBtn.setAttribute('aria-pressed', String(reversed));
      reverseBtn.classList.toggle('is-active', reversed);
    }

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
      rampName !== prev.rampName ||
      reversed !== prev.reversed ||
      valuesRef !== prev.valuesRef
    ) {
      renderLegend({ variable, scale, flowVisible, timesLen, valuesRef });
    }

    prev.variable = variable;
    prev.scale = scale;
    prev.flowVisible = flowVisible;
    prev.timesLen = timesLen;
    prev.theme = theme;
    prev.rampName = rampName;
    prev.reversed = reversed;
    prev.valuesRef = valuesRef;
  };

  const unsubscribe = store.subscribe(() => render());
  render();

  return () => {
    unsubscribe();
    teardownRunCascade();
    teardownVariablePicker();
    scaleSelect.destroy();
    configModal.destroy();
    colorModal.destroy();
    opener.remove();
    panel.remove();
  };
}

export default createControlMenu;
