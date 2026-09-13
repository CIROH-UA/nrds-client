import maplibregl from 'maplibre-gl';

import { selectionLngLat } from '../../lib/flowpathValues.js';
import { curatedFeatureFields } from '../../lib/featureFields.js';
import { createChart } from '../chart/nrds-chart.js';
import { actions } from '../../store/app-store.js';

/**
 * The anchored feature popup for the build-less NRDS client (migration unit U5), the vanilla
 * replacement for the React SelectedFeaturePopup. `attachFeaturePopup(map, store)` watches the
 * store's selected feature and, whenever one is set and can be placed, opens a maplibre popup at its
 * centroid: a header of the feature's key attributes (curatedFeatureFields) above a uPlot chart
 * (createChart) that shows the feature's timeseries with its own loading, empty and error states.
 *
 * Closing (the popup's own button) clears the selection, so the highlight goes with it and clicking
 * the same catchment reopens it. The popup does not touch the highlight itself: the map subscription
 * that draws the highlight is keyed on the same selected_feature, so clearing the selection clears
 * both. The chart is destroyed whenever the popup goes away, from a close, a reselection, or teardown.
 *
 * The mobile bottom sheet is a later increment; this always uses the anchored popup.
 */

/** The key a selection is recognised by, so an unrelated store change does not rebuild the popup. */
const featureKeyOf = (feature) => feature?._id ?? null;

/** Build the popup's DOM: a header of curated fields above a sized host for the chart. */
function buildContent(feature) {
  const root = document.createElement('div');
  root.className = 'nrds-feature-popup';

  const header = document.createElement('div');
  header.className = 'popup-header';
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
    header.append(row);
  }

  const chartHost = document.createElement('div');
  chartHost.className = 'nrds-feature-popup__chart';

  root.append(header, chartHost);
  return { root, chartHost };
}

/** Open the popup on the selected feature, and update/close it as the selection changes. */
export function attachFeaturePopup(map, store) {
  let current = null;
  let closingProgrammatically = false;

  const onPopupClose = () => {
    const wasProgrammatic = closingProgrammatically;
    if (current?.teardownChart) current.teardownChart();
    current = null;
    // A close from the popup's own button clears the selection (and with it the highlight); a
    // programmatic close is the store already having moved on, so it must not write back.
    if (!wasProgrammatic) actions.set_selected_feature(null);
  };

  const closePopup = () => {
    if (!current) return;
    closingProgrammatically = true;
    current.popup.remove();
    closingProgrammatically = false;
  };

  const openPopup = (feature, at) => {
    const { root, chartHost } = buildContent(feature);
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: [0, -12],
      maxWidth: '360px',
      className: 'nrds-feature-popup-shell',
    })
      .setLngLat(at)
      .setDOMContent(root)
      .addTo(map);

    const teardownChart = createChart(chartHost, store);
    popup.on('close', onPopupClose);
    current = { popup, teardownChart, featureKey: featureKeyOf(feature) };
  };

  const render = () => {
    const feature = store.get().feature.selected_feature;
    const at = selectionLngLat(feature);

    if (!feature || !at) {
      closePopup();
      return;
    }
    if (current && current.featureKey === featureKeyOf(feature)) return;

    closePopup();
    openPopup(feature, at);
  };

  const unsubscribe = store.subscribe(() => render());
  render();

  return () => {
    unsubscribe();
    closePopup();
  };
}

export default attachFeaturePopup;
