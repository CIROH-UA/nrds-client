import { selectionLngLat } from '../../lib/flowpathValues.js';
import { curatedFeatureFields } from '../../lib/featureFields.js';
import { makeFeatureTitle } from '../../lib/utils.js';
import { createChart } from '../chart/nrds-chart.js';
import { createVariablePicker } from './variable-picker.js';
import { actions } from '../../store/app-store.js';
import { peekFor, sheetDataState, watchSheet } from '../../lib/breakpoints.js';

/**
 * The mobile bottom sheet for the build-less NRDS client (migration unit U5d), the vanilla
 * replacement for the React ForecastMenu sheet. `attachFeatureSheet(store)` watches the store's
 * selected feature and the sheet breakpoint (<=768px) and, on a narrow viewport, hosts the SAME
 * content the desktop popup does -- a curated header, the variable picker, and the chart -- in a
 * bottom sheet instead of the anchored popup.
 *
 * The popup (feature-popup.js) gates itself off on narrow viewports and this sheet gates itself off
 * on wide ones, so exactly one of the two ever hosts the feature content; both re-render when the
 * viewport crosses the breakpoint, so the content moves from one to the other on rotate/resize.
 *
 * It sets `body[data-sheet]` to expanded/collapsed/closed so the token-driven CSS offsets the map
 * controls and time dock, and measures the peek row into `--sheet-peek` so the collapsed sheet keeps
 * exactly its header on screen. The handle collapses/expands the sheet by tap or drag; the close
 * button clears the selection, which (as on desktop) also clears the highlight.
 */

const HANDLE = 'nrds-feature-sheet__handle';
const DRAG_THRESHOLD_PX = 40;

/** Build the sheet's inner content: a curated header above the picker and the chart hosts. */
function buildContent(feature) {
  const fields = document.createElement('div');
  fields.className = 'nrds-feature-sheet__fields popup-header';
  for (const { label, value } of curatedFeatureFields(feature)) {
    const row = document.createElement('div');
    row.className = 'popup-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'popup-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'popup-value';
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    fields.append(row);
  }

  const pickerHost = document.createElement('div');
  pickerHost.className = 'nrds-feature-sheet__picker';

  const chartHost = document.createElement('div');
  chartHost.className = 'nrds-feature-sheet__chart';

  return { fields, pickerHost, chartHost };
}

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M18 6 6 18M6 6l12 12"/></svg>';

const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="m6 9 6 6 6-6"/></svg>';

/** The key a selection is recognised by, so an unrelated store change does not rebuild the sheet. */
const featureKeyOf = (feature) => feature?._id ?? null;

/** Mount the bottom sheet, wired to `store`; returns a teardown. */
export function attachFeatureSheet(store) {
  const bodyId = 'nrds-feature-sheet-body';

  const aside = document.createElement('aside');
  aside.className = 'nrds-feature-sheet';
  aside.setAttribute('aria-label', 'Selected feature');
  aside.hidden = true;

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = HANDLE;
  handle.setAttribute('aria-controls', bodyId);
  handle.innerHTML = '<span class="nrds-feature-sheet__grabber" aria-hidden="true"></span>';

  const header = document.createElement('div');
  header.className = 'nrds-feature-sheet__header';

  const title = document.createElement('h2');
  title.className = 'nrds-feature-sheet__title';

  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'nrds-feature-sheet__collapse';
  collapseBtn.setAttribute('aria-controls', bodyId);
  collapseBtn.innerHTML = CHEVRON;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'nrds-feature-sheet__close';
  closeBtn.setAttribute('aria-label', 'Clear selection');
  closeBtn.title = 'Clear selection';
  closeBtn.innerHTML = CLOSE_ICON;

  header.append(title, collapseBtn, closeBtn);

  const body = document.createElement('div');
  body.className = 'nrds-feature-sheet__body';
  body.id = bodyId;
  body.setAttribute('role', 'group');
  body.setAttribute('aria-label', 'Forecast details');

  aside.append(handle, header, body);
  document.body.append(aside);

  let current = null;
  let collapsed = false;
  let destroyed = false;

  const sheet = watchSheet(() => render());

  /** Reflect open/collapsed state onto body[data-sheet] and the collapse control. */
  const applyState = (open) => {
    document.body.dataset.sheet = sheetDataState({ open, collapsed });
    aside.classList.toggle('is-collapsed', open && collapsed);
    aside.setAttribute('aria-hidden', open ? 'false' : 'true');
    const expanded = open && !collapsed;
    collapseBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    collapseBtn.setAttribute(
      'aria-label',
      collapsed ? 'Expand the forecast panel' : 'Minimise the forecast panel'
    );
    handle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    handle.setAttribute(
      'aria-label',
      collapsed ? 'Expand the forecast panel' : 'Minimise the forecast panel'
    );
    body.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
  };

  /** Measure the peek row (handle + header) into --sheet-peek so a collapse keeps just that on screen. */
  const measurePeek = () => {
    if (aside.hidden) return;
    const paddingTop = parseFloat(getComputedStyle(aside).paddingTop) || 0;
    const rowHeight = handle.offsetHeight + header.offsetHeight;
    const peek = peekFor({ rowHeight, paddingTop, sheetHeight: aside.offsetHeight });
    document.body.style.setProperty('--sheet-peek', `${peek}px`);
  };

  const teardownContent = () => {
    if (current?.teardownPicker) current.teardownPicker();
    if (current?.teardownChart) current.teardownChart();
    body.replaceChildren();
    current = null;
  };

  const openContent = (feature) => {
    teardownContent();
    const { fields, pickerHost, chartHost } = buildContent(feature);
    body.append(fields, pickerHost, chartHost);
    const teardownPicker = createVariablePicker(pickerHost, store);
    const teardownChart = createChart(chartHost, store);
    title.textContent = makeFeatureTitle(feature._id ?? feature.id ?? '');
    current = { teardownPicker, teardownChart, featureKey: featureKeyOf(feature) };
  };

  const close = () => {
    if (aside.hidden) return;
    teardownContent();
    aside.hidden = true;
    applyState(false);
    document.body.style.removeProperty('--sheet-peek');
  };

  const render = () => {
    const feature = store.get().feature.selected_feature;
    const placeable = Boolean(selectionLngLat(feature));
    const open = sheet.matches() && Boolean(feature) && placeable;

    if (!open) {
      close();
      return;
    }

    const key = featureKeyOf(feature);
    if (!current || current.featureKey !== key) {
      collapsed = false;
      aside.hidden = false;
      openContent(feature);
    }

    applyState(true);
    // Let the DOM lay out before measuring the peek row.
    requestAnimationFrame(() => {
      if (!destroyed && !aside.hidden) measurePeek();
    });
  };

  const toggleCollapsed = () => {
    if (aside.hidden) return;
    collapsed = !collapsed;
    applyState(true);
    if (!collapsed) requestAnimationFrame(() => !destroyed && measurePeek());
  };

  collapseBtn.addEventListener('click', toggleCollapsed);
  closeBtn.addEventListener('click', () => actions.set_selected_feature(null));

  // Drag-or-tap on the handle: a short press toggles, a drag past the threshold sets the direction.
  let dragStartY = null;
  const onPointerDown = (e) => {
    dragStartY = e.clientY ?? null;
    if (handle.setPointerCapture && e.pointerId != null) {
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* empty */
      }
    }
  };
  const onPointerUp = (e) => {
    if (dragStartY == null) return;
    const dy = (e.clientY ?? dragStartY) - dragStartY;
    dragStartY = null;
    if (Math.abs(dy) < DRAG_THRESHOLD_PX) {
      toggleCollapsed();
      return;
    }
    const wantCollapsed = dy > 0;
    if (wantCollapsed !== collapsed) toggleCollapsed();
  };
  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointerup', onPointerUp);
  // A keyboard press on the handle toggles too (it is a button, so click covers Enter/Space).
  handle.addEventListener('click', (e) => {
    // Ignore the synthetic click that follows a pointer gesture we already handled.
    if (e.detail === 0) toggleCollapsed();
  });

  const unsubscribe = store.subscribe(() => render());
  render();

  return () => {
    destroyed = true;
    unsubscribe();
    sheet.destroy();
    teardownContent();
    delete document.body.dataset.sheet;
    document.body.style.removeProperty('--sheet-peek');
    aside.remove();
  };
}

export default attachFeatureSheet;
