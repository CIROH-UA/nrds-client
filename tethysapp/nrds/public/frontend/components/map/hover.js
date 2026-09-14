import maplibregl from 'maplibre-gl';

import { pickHoverFeature, hoveredFeatureOf } from '../../lib/hover.js';
import { curatedFeatureFields } from '../../lib/featureFields.js';
import { getValueAtTimeFlat } from '../../lib/flowpathValues.js';
import { getVariableUnits } from '../../lib/data.js';
import { formatMeasurement, formatFrameTime, numericPartOf } from '../../lib/utils.js';
import { NO_DATA_VALUE } from '../../lib/valueRamp.js';
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

/** The layers a hover may read. */
const HOVER_LAYERS = ['conus-gauges', 'flowpaths-line', 'divides'];

/** The animated variable's reading for a hovered reach, as { label, value } or null. */
function hoverReading(store, hoverId) {
  if (hoverId == null) return null;
  const s = store.get();
  const variable = s.timeseries.variable;
  const times = s.vpu.times;
  const varData = s.vpu.valuesByVar?.[variable];
  const featureIdToIndex = s.vpu.featureIdToIndex;
  if (!variable || !varData || !times?.length || !featureIdToIndex) return null;

  const numeric = numericPartOf(hoverId);
  const featureIndex =
    featureIdToIndex[String(hoverId)] ?? (numeric != null ? featureIdToIndex[numeric] : undefined);
  if (featureIndex === undefined) return null;

  const value = getValueAtTimeFlat(varData, times.length, featureIndex, s.timeseries.currentTimeIndex);
  if (value === null || value === undefined) return null;

  const units = getVariableUnits(variable);
  const at = formatFrameTime(times[s.timeseries.currentTimeIndex]);
  const label = `${variable}${units ? ` (${units})` : ''}${at ? ` @ ${at}` : ''}`;
  const reading = value <= NO_DATA_VALUE ? 'no data' : formatMeasurement(value);
  return reading === null ? null : { label, value: reading };
}

/** Build the hover popup DOM: a title, the animated reading, then the feature's key attributes. */
function buildContent(store, hovered) {
  const root = document.createElement('div');
  root.className = 'nrds-hover-popup';

  const title = document.createElement('div');
  title.className = 'popup-title';
  title.textContent = 'Feature';
  root.append(title);

  const reading = hoverReading(store, hovered.hoverId);
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

  const removePopup = () => {
    if (popup) {
      popup.remove();
      popup = null;
    }
    map.getCanvas().style.cursor = '';
  };

  const clearHover = () => {
    removePopup();
    if (store.get().feature.hovered_feature) actions.set_hovered_feature(null);
  };

  const showPopup = (hovered) => {
    const at = { lng: hovered.longitude, lat: hovered.latitude };
    if (at.lng == null || at.lat == null) return;
    if (!popup) {
      popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -10],
        className: 'nrds-hover-popup-shell',
      }).addTo(map);
    }
    popup.setLngLat(at).setDOMContent(buildContent(store, hovered));
  };

  const onMove = (event) => {
    if (!store.get().layers.hovered_enabled) return;
    const layers = HOVER_LAYERS.filter((id) => map.getLayer(id));
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
  const unsubscribe = store.subscribe((state) => {
    const enabled = state.layers.hovered_enabled;
    if (enabled === prevEnabled) return;
    prevEnabled = enabled;
    if (!enabled) clearHover();
  });

  return () => {
    map.off('mousemove', onMove);
    map.off('mouseout', onLeave);
    unsubscribe();
    removePopup();
  };
}

export default attachHover;
