/**
 * The vanilla maplibre map for the build-less NRDS client (migration unit U3). `createMap` registers
 * the pmtiles protocol once, builds the map from the current theme's basemap style, and on load adds
 * the two pmtiles vector sources and the five static layers (divides, its highlight, flowpaths, its
 * highlight, and the CONUS gauges) with the paint the React `MapLayers` module used. Initial layer
 * visibility comes from the store's `layers` slice, and a store subscription keeps each layer's
 * `visibility` in step with the toggle it belongs to. The `flowpath-geometry` source keeps the tiles'
 * native feature id (no `promoteId`): that id equals each reach's numeric `divide_id` and, unlike the
 * `divide_id` property, is present at every zoom, so the feature-state colouring reaches the whole
 * network at CONUS scale rather than only above zoom 7 where the property survives. On load
 * `attachFlowpathColoring` (unit U3c) drives the per-frame feature-state colouring of the `flowpaths`
 * layer; the static `line-color` stands in until VPU data lands. On load it also wires the click-to-
 * select pipeline (unit U5): a click queries the visible selectable layers and hands the feature to
 * `selectMapFeature`, a store subscription keeps the two highlight layers pointed at the selection,
 * and the feature's chart is hosted either in the anchored popup (`attachFeaturePopup`, wide
 * viewports) or the mobile bottom sheet (`attachFeatureSheet`, <=768px), one or the other by
 * viewport (unit U5d).
 */
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

import { readMapTheme } from '../../lib/mapTheme.js';
import { FLOWPATHS_WIDTH_STOPS } from '../../lib/flowpaths.js';
import { selectionLngLat } from '../../lib/flowpathValues.js';
import { createSequence } from '../../lib/sequence.js';
import {
  SELECTABLE_LAYERS,
  SELECTION_ZOOM,
  divideIdOf,
  dividesHighlightFilter,
  flowpathsHighlightFilter,
  pickClickedFeature,
} from '../../lib/selection.js';
import { selectMapFeature } from '../../actions/selectFeature.js';
import { actions } from '../../store/app-store.js';
import { attachFlowpathColoring } from './coloring.js';
import { attachHover } from './hover.js';
import { attachFeaturePopup } from './feature-popup.js';
import { attachFeatureSheet } from './feature-sheet.js';
import { createTimeSlider } from '../time-slider.js';
import { createControlMenu } from '../menus/control-menu.js';

const INITIAL_VIEW = { center: [-96, 40], zoom: 4 };

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
  });
  map.addSource('conus', {
    type: 'vector',
    url: `pmtiles://${datastream.community_pmtiles}`,
  });

  const divideId = divideIdOf(store.get().feature.selected_feature);

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
 * Show a pointer cursor over the catchments, the feature a click selects, so the map reads as
 * interactive. The divides fill follows the catchments toggle, so the cursor only appears where a
 * click would actually select something. Registered once on load; survives the theme restyle since
 * the listener is bound to the layer id, which is re-added with the same name.
 */
function attachClickableCursor(map) {
  map.on('mouseenter', 'divides', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'divides', () => {
    map.getCanvas().style.cursor = '';
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
 *
 * The highlight layers only draw at high zoom (the divides fill fades out below zoom 7 and the
 * flowpaths tiles drop `divide_id` there), so a marker at the selection centroid gives a locator
 * that stays visible at every zoom, including CONUS scale where the highlight alone would vanish.
 */
function subscribeSelectionHighlight(map, store) {
  let marker = null;

  const updateMarker = (feature) => {
    const at = selectionLngLat(feature);
    if (!at) {
      if (marker) {
        marker.remove();
        marker = null;
      }
      return;
    }
    if (!marker) {
      const el = document.createElement('div');
      el.className = 'nrds-selection-marker';
      marker = new maplibregl.Marker({ element: el, anchor: 'center' });
    }
    marker.setLngLat(at).addTo(map);
  };

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
  updateMarker(prev);
  return store.subscribe((state) => {
    const feature = state.feature.selected_feature;
    if (feature === prev) return;
    prev = feature;
    applyHighlight(feature);
    updateMarker(feature);

    const at = selectionLngLat(feature);
    if (at) map.flyTo({ center: at, zoom: SELECTION_ZOOM, essential: true });
  });
}

/**
 * Re-style the map when the effective theme changes: the light and dark basemaps are separate style
 * URLs, so swapping them needs `setStyle`, which wipes our sources, layers and feature-state. The
 * hydrofabric layers are re-added with the new theme's paint, visibility is re-pushed, and flowpath
 * colouring is re-attached (its previous instance is torn down first so the idle/store listeners do
 * not accumulate). maplibre-gl 4 does not fire `style.load` after setStyle and reports
 * isStyleLoaded() false through every `styledata` in the swap, so the first `idle` is used as the
 * point where the new style is fully loaded and it is safe to re-add, with a timeout fallback so a
 * slow or dropped idle (a busy map, a failed basemap load) can never strand the layers. Playback is
 * paused across the swap and resumed after the re-add, both to avoid keeping the map busy and so the
 * animation does not run over the torn-down layer. A generation counter guards against overlapping
 * swaps (rapid toggling): only the latest swap re-adds, so `addHydrofabricLayers` never runs twice
 * and no colouring instance is orphaned, and a `readded` guard keeps the idle and the fallback from
 * both firing. Playback is paused across the swap and resumed after the re-add; the resume intent is
 * captured once at the start of a burst of swaps so rapid toggling cannot leave a reader who was
 * playing stranded paused, and the fallback timer is cleared when a swap completes or is superseded.
 * The selection
 * marker is a DOM overlay that survives the swap; the highlight filters are restored by
 * `addHydrofabricLayers` from the current selection. Returns the store's unsubscribe closure.
 */
/**
 * Best-effort "you are here": when the browser grants geolocation, fly to the reader's location and
 * select the catchment there, which loads that vpu's run so their local flowpaths are coloured. It
 * flies straight to SELECTION_ZOOM, the same zoom the selection then settles at and where the divides
 * fill is fully drawn, so the query is reliable and the reader is not flown twice. It no-ops silently
 * when geolocation is unavailable, denied, or lands outside the hydrofabric, so the default vpu stays
 * loaded and a failure never breaks the map. The permission prompt can sit open for a while, so the
 * callback abandons the fly-and-select if the reader has already dragged the map or picked a feature
 * in the meantime rather than hijacking their view.
 */
function locateUser(map, store) {
  try {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    let userMoved = false;
    const onUserMove = (e) => {
      if (e.originalEvent) userMoved = true;
    };
    map.on('movestart', onUserMove);
    const preempted = () => userMoved || Boolean(store.get().feature.selected_feature);
    const done = () => map.off('movestart', onUserMove);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (preempted()) {
          done();
          return;
        }
        const center = [coords.longitude, coords.latitude];
        map.flyTo({ center, zoom: SELECTION_ZOOM });
        map.once('idle', () => {
          done();
          if (preempted() || !map.getLayer('divides')) return;
          const [feature] = map.queryRenderedFeatures(map.project(center), { layers: ['divides'] });
          if (feature) selectMapFeature(feature, 'divides');
        });
      },
      done,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  } catch {
    /* geolocation unavailable: keep the default vpu */
  }
}

function subscribeMapTheme(map, store, initialColoringTeardown) {
  let teardownColoring = initialColoringTeardown;
  let prev = store.get().theme.theme;
  const swaps = createSequence();
  let swapActive = false;
  let resumeIntent = false;
  let fallbackTimer = null;
  return store.subscribe((state) => {
    const theme = state.theme.theme;
    if (theme === prev) return;
    prev = theme;

    const ticket = swaps.next();
    // Capture the resume intent at the start of a burst of swaps, before the first pause sets
    // isPlaying false; a later swap in the same burst must not overwrite it with the paused value.
    if (!swapActive) {
      swapActive = true;
      resumeIntent = store.get().timeseries.isPlaying;
    }
    // Pause playback across the swap: setStyle wipes the layers, and an animation that keeps the map
    // busy can delay or drop the idle the re-add waits on, stranding the hydrofabric layers.
    if (store.get().timeseries.isPlaying) actions.set_is_playing(false);
    teardownColoring();
    teardownColoring = () => {};
    map.setStyle(readMapTheme().styleUrl);

    let readded = false;
    const reAdd = () => {
      if (readded || !swaps.isCurrent(ticket)) return;
      readded = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = null;
      addHydrofabricLayers(map, store, readMapTheme());
      applyAllVisibility(map, store);
      teardownColoring = attachFlowpathColoring(map, store);
      swapActive = false;
      if (resumeIntent) actions.set_is_playing(true);
    };
    map.once('idle', reAdd);
    // Fallback: if the new basemap style is slow to load or its idle never arrives, re-add anyway so
    // the layers and selection are never left stranded until the reader toggles the theme again.
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(reAdd, 4000);
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

  const timeDock = document.createElement('div');
  timeDock.className = 'nrds-time-dock';
  container.append(timeDock);
  const teardownTimeSlider = createTimeSlider(timeDock, store);

  const teardownControlMenu = createControlMenu(container, store);

  map.on('load', () => {
    addHydrofabricLayers(map, store, readMapTheme());
    applyAllVisibility(map, store);
    const teardownColoring = attachFlowpathColoring(map, store);
    attachClickToSelect(map, store);
    attachClickableCursor(map);
    attachHover(map, store);
    subscribeSelectionHighlight(map, store);
    attachFeaturePopup(map, store);
    attachFeatureSheet(store);
    subscribeMapTheme(map, store, teardownColoring);
    locateUser(map, store);
  });

  subscribeVisibility(map, store);

  if (typeof window !== 'undefined') {
    window.nrds = { map, store, teardownTimeSlider, teardownControlMenu };
  }

  return map;
}

export default createMap;
