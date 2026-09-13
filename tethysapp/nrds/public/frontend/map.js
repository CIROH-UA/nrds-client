/**
 * Vanilla entry point for the build-less NRDS client (KTD1). The composition root: it wires the
 * store and mounts the map once the DOM is ready. Map creation, the pmtiles protocol registration,
 * the basemap style, and the static hydrofabric layers now live in the map component
 * (components/map/nrds-map.js); this entry only bootstraps the DOM and hands the store to it.
 * Feature-state flowpath coloring, the chart, menus, and shell wire in as later units complete.
 */
import { createMap } from './components/map/nrds-map.js';
import { store } from './store/app-store.js';

import { config } from './config.js';

/** Mount the app into #root, handing the shared store to the map. */
export function start() {
  const root = document.getElementById('root');
  if (!root) return config;
  root.style.position = 'absolute';
  root.style.inset = '0';
  createMap(root, store);
  return config;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
