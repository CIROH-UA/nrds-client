/**
 * Vanilla entry point for the build-less NRDS client (KTD1). The composition root: it wires the
 * store, shell, map, menus, and chart once the DOM is ready. This is the U0 scaffold stub; the
 * real wiring lands as U2 through U6 complete, and the Django template loads this module only
 * after the CSP and import map are in place (the pre-U0 blocker).
 */
import { config } from './config.js';

export function start() {
  return config;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
