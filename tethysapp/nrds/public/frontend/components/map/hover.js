import maplibregl from 'maplibre-gl';

import { pickHoverFeature, hoveredFeatureOf, hoverReading, HOVER_TARGET_ORDER } from '../../lib/hover.js';
import { curatedFeatureFields } from '../../lib/featureFields.js';
import { actions } from '../../store/app-store.js';

/**
 * The hover readout for the build-less NRDS client, the vanilla replacement for the React hover
 * Popup that the migration left unwired. `attachHover(map, store)` shows a small popup that follows
 * the pointer over the selectable layers while the "Enable Hovering" toggle is on: the animated
 * variable's value at the hovered reach plus its key attributes. It reads the value straight from the
 * VPU arrays by feature index, so the readout does not depend on tile feature-state.
 *
 * The popup is driven directly from the mousemove handler rather than through a store subscription,
 * so following the cursor never floods every store subscriber; the store's `hovered_feature` is still
 * updated for parity. A light subscription only watches the toggle so turning hovering off clears the
 * popup at once. Returns a teardown that removes the listeners, the subscription, and the popup.
 */

/** Half-width of the hover hit box, matching the React HOVER_TOLERANCE_PX; a flowpath is ~2px wide. */
const HOVER_TOLERANCE_PX = 4;

/** The animated reading for a hovered reach at the store's current frame. */
function readingFromStore(store, hoverId) {
  const s = store.get();
  return hoverReading({
    variable: s.timeseries.variable,
    times: s.vpu.times,
    varData: s.vpu.valuesByVar?.[s.timeseries.variable],
    featureIdToIndex: s.vpu.featureIdToIndex,
    currentTimeIndex: s.timeseries.currentTimeIndex,
    hoverId,
  });
}

/** Build the hover popup DOM: a title, the animated reading, then the feature's key attributes. */
function buildContent(store, hovered) {
  const root = document.createElement('div');
  root.className = 'nrds-hover-popup';

  const title = document.createElement('div');
  title.className = 'popup-title';
  title.textContent = 'Feature';
  root.append(title);

  const reading = readingFromStore(store, hovered.hoverId);
  if (reading) {
    const row = document.createElement('div');
    row.className = 'popup-row popup-measure';
    const label = document.createElement('span');
    label.className = 'popup-label';
    label.textContent = reading.label;
    const value = document.createElement('span');
    value.className = 'popup-value';
    value.textContent = reading.value;
    row.append(label, value);
    root.append(row);
  }

  for (const { label, value } of curatedFeatureFields(hovered)) {
    const row = document.createElement('div');
    row.className = 'popup-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'popup-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'popup-value';
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    root.append(row);
  }
  return root;
}

/** Wire pointer hovering to a following readout popup, gated by the store's hovered_enabled toggle. */
export function attachHover(map, store) {
  if (!map) return () => {};

  let popup = null;
  /** The payload the open popup is showing, so a frame advance can re-render it in place. */
  let currentHover = null;

  const removePopup = () => {
    if (popup) {
      popup.remove();
      popup = null;
    }
    currentHover = null;
    map.getCanvas().style.cursor = '';
  };

  const clearHover = () => {
    removePopup();
    if (store.get().feature.hovered_feature) actions.set_hovered_feature(null);
  };

  /** Rebuild the popup body from the store's current frame, without moving it. */
  const renderContent = () => {
    if (popup && currentHover) popup.setDOMContent(buildContent(store, currentHover));
  };

  const showPopup = (hovered) => {
    const at = { lng: hovered.longitude, lat: hovered.latitude };
    if (at.lng == null || at.lat == null) return;
    const isNew = !popup;
    if (isNew) {
      popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -10],
        className: 'nrds-hover-popup-shell',
      }).addTo(map);
    }
    // The popup follows the cursor every move, but its body only needs rebuilding when the feature
    // under the pointer changes; the frame-advance path rebuilds it in place when the value changes.
    const featureChanged = isNew || currentHover?.hoverId !== hovered.hoverId;
    currentHover = hovered;
    popup.setLngLat(at);
    if (featureChanged) popup.setDOMContent(buildContent(store, hovered));
  };

  const onMove = (event) => {
    if (!store.get().layers.hovered_enabled) return;
    const layers = HOVER_TARGET_ORDER.filter((id) => map.getLayer(id));
    if (!layers.length) return;

    const { x, y } = event.point;
    const box = [
      [x - HOVER_TOLERANCE_PX, y - HOVER_TOLERANCE_PX],
      [x + HOVER_TOLERANCE_PX, y + HOVER_TOLERANCE_PX],
    ];

    let features;
    try {
      features = map.queryRenderedFeatures(box, { layers });
    } catch {
      return;
    }

    const hovered = hoveredFeatureOf(pickHoverFeature(features), event.lngLat);
    if (!hovered) {
      clearHover();
      return;
    }
    map.getCanvas().style.cursor = 'pointer';
    actions.set_hovered_feature(hovered);
    showPopup(hovered);
  };

  const onLeave = () => clearHover();

  map.on('mousemove', onMove);
  map.on('mouseout', onLeave);

  let prevEnabled = store.get().layers.hovered_enabled;
  let prevTimeIndex = store.get().timeseries.currentTimeIndex;
  let prevVariable = store.get().timeseries.variable;
  const unsubscribe = store.subscribe((state) => {
    const enabled = state.layers.hovered_enabled;
    if (enabled !== prevEnabled) {
      prevEnabled = enabled;
      if (!enabled) clearHover();
    }
    const timeIndex = state.timeseries.currentTimeIndex;
    const variable = state.timeseries.variable;
    if (timeIndex !== prevTimeIndex || variable !== prevVariable) {
      prevTimeIndex = timeIndex;
      prevVariable = variable;
      if (enabled) renderContent();
    }
  });

  return () => {
    map.off('mousemove', onMove);
    map.off('mouseout', onLeave);
    unsubscribe();
    removePopup();
  };
}

export default attachHover;
