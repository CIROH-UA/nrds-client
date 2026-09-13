/**
 * The vanilla maplibre map for the build-less NRDS client (migration unit U3). `createMap` registers
 * the pmtiles protocol once, builds the map from the current theme's basemap style, and on load adds
 * the two pmtiles vector sources and the five static layers (divides, its highlight, flowpaths, its
 * highlight, and the CONUS gauges) with the paint the React `MapLayers` module used. Initial layer
 * visibility comes from the store's `layers` slice, and a store subscription keeps each layer's
 * `visibility` in step with the toggle it belongs to. The `flowpath-geometry` source is created with
 * `promoteId` so each flowpath feature's id is its numeric `divide_id`, and on load
 * `attachFlowpathColoring` (unit U3c) drives the per-frame feature-state colouring of the `flowpaths`
 * layer; the static `line-color` stands in until VPU data lands. On load it also wires the click-to-
 * select pipeline (unit U5): a click queries the visible selectable layers and hands the feature to
 * `selectMapFeature`, a store subscription keeps the two highlight layers pointed at the selection,
 * and `attachFeaturePopup` opens the anchored popup with the feature's chart.
 */
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

import { readMapTheme } from '../../lib/mapTheme.js';
import { FLOWPATHS_WIDTH_STOPS } from '../../lib/flowpaths.js';
import { selectionLngLat } from '../../lib/flowpathValues.js';
import {
  SELECTABLE_LAYERS,
  SELECTION_ZOOM,
  divideIdOf,
  dividesHighlightFilter,
  flowpathsHighlightFilter,
  pickClickedFeature,
} from '../../lib/selection.js';
import { selectMapFeature } from '../../actions/selectFeature.js';
import { attachFlowpathColoring } from './coloring.js';
import { attachFeaturePopup } from './feature-popup.js';
import { createTimeSlider } from '../time-slider.js';

const INITIAL_VIEW = { center: [-96, 40], zoom: 4 };

// Half-width of the click hit box, in pixels. A flowpath renders two pixels wide, so an exact-pixel
// click is a target most people cannot hit; the box gives the click the same slack React's did.
const CLICK_TOLERANCE_PX = 4;

/** Which store toggle governs each selectable layer. */
const SELECTABLE_LAYER_TOGGLE = {
  divides: 'catchments',
  'flowpaths-line': 'flowpaths',
  'conus-gauges': 'conus_gauges',
};

let pmtilesRegistered = false;

/** Register the pmtiles protocol once; the basemap style and the hydrofabric layers use pmtiles://. */
function ensurePmtiles() {
  if (pmtilesRegistered) return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  pmtilesRegistered = true;
}

/** Which layers each store toggle governs; the vpu toggle is wired in a later unit. */
const VISIBILITY_GROUPS = [
  { key: 'catchments', layers: ['divides', 'divides-highlight'] },
  { key: 'flowpaths', layers: ['flowpaths-line', 'flowpaths-highlight'] },
  { key: 'conus_gauges', layers: ['conus-gauges'] },
];

/** Add the two pmtiles sources and the five static hydrofabric layers to a loaded map. */
function addHydrofabricLayers(map, store, theme) {
  const { datastream } = store.get();

  map.addSource('flowpath-geometry', {
    type: 'vector',
    url: `pmtiles://${datastream.flowpaths_pmtiles}`,
    promoteId: { flowpaths: 'divide_id' },
  });
  map.addSource('conus', {
    type: 'vector',
    url: `pmtiles://${datastream.community_pmtiles}`,
  });

  const divideId = divideIdOf(store.get().feature.selected_feature);

  // The basemap style ships its own 'flowpaths' layer; hide it so our colourable 'flowpaths-line'
  // layer is the only flowpath network drawn (adding a second 'flowpaths' id would also collide).
  if (map.getLayer('flowpaths')) map.setLayoutProperty('flowpaths', 'visibility', 'none');

  map.addLayer({
    id: 'divides',
    type: 'fill',
    source: 'conus',
    'source-layer': 'conus_divides',
    paint: {
      'fill-color': ['rgba', 0, 0, 0, 0],
      'fill-outline-color': theme.dividesOutline,
      'fill-opacity': { stops: [[7, 0], [11, 1]] },
    },
  });

  map.addLayer(
    {
      id: 'divides-highlight',
      type: 'fill',
      source: 'conus',
      'source-layer': 'conus_divides',
      filter: dividesHighlightFilter(divideId),
      paint: {
        'fill-color': theme.dividesHighlightFill,
        'fill-outline-color': theme.dividesHighlightOutline,
        'fill-opacity': { stops: [[7, 0], [11, 1]] },
      },
    },
    'divides'
  );

  map.addLayer({
    id: 'flowpaths-line',
    type: 'line',
    source: 'flowpath-geometry',
    'source-layer': 'flowpaths',
    paint: {
      'line-color': theme.flowpaths,
      'line-width': { stops: FLOWPATHS_WIDTH_STOPS },
      'line-opacity': { stops: [[2, 0.45], [7, 0.7], [10, 1]] },
    },
  });

  map.addLayer({
    id: 'flowpaths-highlight',
    type: 'line',
    source: 'flowpath-geometry',
    'source-layer': 'flowpaths',
    filter: flowpathsHighlightFilter(divideId),
    paint: {
      'line-color': theme.cursorSymbolFill,
      'line-width': { stops: [[2, 2], [7, 3], [10, 5]] },
      'line-opacity': 0.9,
    },
  });

  map.addLayer({
    id: 'conus-gauges',
    type: 'circle',
    source: 'conus',
    'source-layer': 'conus_gages',
    paint: {
      'circle-radius': { stops: [[3, 2], [11, 5]] },
      'circle-color': theme.gauges,
      'circle-opacity': { stops: [[3, 0], [9, 1]] },
    },
  });
}

/** Set every layer in a group to the group toggle's current visibility, guarding for existence. */
function applyGroupVisibility(map, group, visible) {
  const value = visible ? 'visible' : 'none';
  for (const id of group.layers) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', value);
  }
}

/** Push the store's current layer toggles onto the map. */
function applyAllVisibility(map, store) {
  const { layers } = store.get();
  for (const group of VISIBILITY_GROUPS) {
    applyGroupVisibility(map, group, layers[group.key]?.visible);
  }
}

/**
 * Subscribe the map's layer visibility to the store's layer toggles, updating a group only when
 * its own visible flag changes. Returns the store's unsubscribe closure.
 */
function subscribeVisibility(map, store) {
  let prev = store.get().layers;
  return store.subscribe((state) => {
    const layers = state.layers;
    if (layers === prev) return;
    for (const group of VISIBILITY_GROUPS) {
      const nextVisible = layers[group.key]?.visible;
      if (nextVisible !== prev[group.key]?.visible) {
        applyGroupVisibility(map, group, nextVisible);
      }
    }
    prev = layers;
  });
}

/** The selectable layers that are both toggled on and present on the map, top of the stack first. */
function selectableLayersOn(map, store) {
  const { layers } = store.get();
  return SELECTABLE_LAYERS.filter((id) => {
    const toggle = SELECTABLE_LAYER_TOGGLE[id];
    return layers[toggle]?.visible && map.getLayer(id);
  });
}

/**
 * Turn a map click into a selection: query the visible selectable layers within a small tolerance
 * box, pick the feature worth acting on, and hand it to selectMapFeature. Registered once on load.
 */
function attachClickToSelect(map, store) {
  map.on('click', (event) => {
    const layers = selectableLayersOn(map, store);
    if (!layers.length) return;

    const { x, y } = event.point;
    const box = [
      [x - CLICK_TOLERANCE_PX, y - CLICK_TOLERANCE_PX],
      [x + CLICK_TOLERANCE_PX, y + CLICK_TOLERANCE_PX],
    ];

    let features;
    try {
      features = map.queryRenderedFeatures(box, { layers });
    } catch {
      return;
    }

    const feature = pickClickedFeature(features);
    if (!feature) return;
    selectMapFeature(feature, feature.layer.id);
  });
}

/**
 * Follow the selection: on every change, point the two highlight layers' filters at the selected
 * divide (or clear them on deselect) and, for a placeable selection, fly the map to it at a zoom
 * where the catchment is actually drawn. The highlight is applied once up front so a selection made
 * before the map loaded is drawn; the flight runs only on real changes, never on that first sync,
 * so wiring the map does not move it. Returns the store's unsubscribe closure.
 */
function subscribeSelectionHighlight(map, store) {
  const applyHighlight = (feature) => {
    const divideId = divideIdOf(feature);
    if (map.getLayer('divides-highlight')) {
      map.setFilter('divides-highlight', dividesHighlightFilter(divideId));
    }
    if (map.getLayer('flowpaths-highlight')) {
      map.setFilter('flowpaths-highlight', flowpathsHighlightFilter(divideId));
    }
  };

  let prev = store.get().feature.selected_feature;
  applyHighlight(prev);
  return store.subscribe((state) => {
    const feature = state.feature.selected_feature;
    if (feature === prev) return;
    prev = feature;
    applyHighlight(feature);

    const at = selectionLngLat(feature);
    // essential:true keeps the flight for a reader who asked for reduced motion, or the press
    // does nothing at all.
    if (at) map.flyTo({ center: at, zoom: SELECTION_ZOOM, essential: true });
  });
}

/**
 * Create the maplibre map into the given element, wired to the store: the basemap follows the
 * current theme, the static hydrofabric sources and layers are added on load, layer visibility
 * tracks the store's layer toggles, a click selects the feature under it, and the selection drives
 * the highlight layers and an anchored popup with the feature's chart. Returns the map.
 */
export function createMap(container, store) {
  ensurePmtiles();

  const theme = readMapTheme();
  const map = new maplibregl.Map({
    container,
    style: theme.styleUrl,
    center: INITIAL_VIEW.center,
    zoom: INITIAL_VIEW.zoom,
    attributionControl: true,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

  // The animation transport, docked bottom-centre over the map. It is a sibling of the maplibre
  // canvas (not a maplibre control) and hides itself until a VPU has frames to play.
  const timeDock = document.createElement('div');
  timeDock.className = 'nrds-time-dock';
  container.append(timeDock);
  const teardownTimeSlider = createTimeSlider(timeDock, store);

  map.on('load', () => {
    addHydrofabricLayers(map, store, readMapTheme());
    applyAllVisibility(map, store);
    attachFlowpathColoring(map, store);
    attachClickToSelect(map, store);
    subscribeSelectionHighlight(map, store);
    attachFeaturePopup(map, store);
  });

  subscribeVisibility(map, store);

  // Debug/e2e handle: exposes the map and store for browser-console inspection and headless checks.
  if (typeof window !== 'undefined') window.nrds = { map, store, teardownTimeSlider };

  return map;
}

export default createMap;
