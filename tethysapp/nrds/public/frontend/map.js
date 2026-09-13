/**
 * Vanilla entry point for the build-less NRDS client (KTD1). The composition root: it wires the
 * store and renders the map once the DOM is ready. This is the U3 starting point; it currently
 * renders the basemap from the esm.sh import map to prove the architecture end to end (no CSP,
 * esm.sh modules, OKLCH tokens). Feature-state flowpath coloring, the chart, menus, and shell wire
 * in as U3 through U6 complete.
 */
import maplibregl from 'maplibre-gl';

import { config } from './config.js';

const STYLE_URLS = {
  light: 'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/styles/light-style.json',
  dark: 'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/styles/dark-style.json',
};

/** The effective theme from the document, falling back to the system preference. */
function currentTheme() {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * The basemap style URL for the current theme. The `--map-style-url` token is used when it is
 * already applied, but the entry runs before the external stylesheet is guaranteed to load, so
 * the known per-theme URLs are the reliable source.
 */
function styleUrl() {
  const token = getComputedStyle(document.documentElement)
    .getPropertyValue('--map-style-url')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  return token || STYLE_URLS[currentTheme()];
}

/** Create the maplibre map into the given element, styled by the current theme's basemap. */
export function createMap(container) {
  const map = new maplibregl.Map({
    container,
    style: styleUrl(),
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
