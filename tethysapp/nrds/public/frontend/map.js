/**
 * Vanilla entry point for the build-less NRDS client (KTD1). The composition root: it wires the
 * store and renders the map once the DOM is ready. This is the U3 starting point; it currently
 * renders the basemap from the esm.sh import map to prove the architecture end to end (no CSP,
 * esm.sh modules, OKLCH tokens). Feature-state flowpath coloring, the chart, menus, and shell wire
 * in as U3 through U6 complete.
 */
import maplibregl from 'maplibre-gl';

import { config } from './config.js';

/** Read a CSS custom property from :root, stripping the quotes CSS keeps around a string token. */
function readToken(name) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw.replace(/^['"]|['"]$/g, '');
}

/** Create the maplibre map into the given element, styled by the current theme's basemap. */
export function createMap(container) {
  const styleUrl = readToken('--map-style-url');
  const map = new maplibregl.Map({
    container,
    style: styleUrl,
    center: [-98.5, 39.5],
    zoom: 3.2,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  return map;
}

/** Mount the app into #root. */
export function start() {
  const root = document.getElementById('root');
  if (!root) return config;
  root.style.position = 'absolute';
  root.style.inset = '0';
  createMap(root);
  return config;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
