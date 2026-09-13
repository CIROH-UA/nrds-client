/**
 * Vanilla entry point for the build-less NRDS client, the composition root (migration units U1 + U6).
 * On DOM ready it builds the app shell into #root (the navbar on top and a map area filling the rest),
 * runs the four bootstrap calls, then mounts the map into the shell's map area and kicks off the data
 * layer. The shell (navbar, dialogs, toasts, error view), the bootstrap fetches, and the map view all
 * live in their own modules; this entry only orchestrates them.
 *
 * Flow: show the boot loading state, await bootstrap (with a minimum on-screen delay so the loader
 * does not flash), then build the shell and mount the map, or render the error view if bootstrap
 * throws -- the top-level catch that stands in for the React error boundary. initDataStream resolves
 * the default vpu's S3 selection and loads its animation data; it runs once and swallows its own
 * errors, so awaiting it is unnecessary.
 */
import { createMap } from './components/map/nrds-map.js';
import { store } from './store/app-store.js';
import { initDataStream } from './actions/initDataStream.js';
import { bootstrap } from './lib/api.js';
import { mountLoading, mountShell, mountError } from './components/shell/shell.js';

import { config } from './config.js';

/** Resolve after `ms` milliseconds. */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mount the app into #root: shell, bootstrap, map. Returns the config once the DOM is wired (or
 * immediately when there is no #root, as under tests/tooling).
 */
export async function start() {
  const root = document.getElementById('root');
  if (!root) return config;

  const loader = mountLoading(root);
  const minDelay = Number(config.loaderDelay) || 0;

  try {
    const [ctx] = await Promise.all([bootstrap(), delay(minDelay)]);
    loader.remove();
    const shell = mountShell(root, { store, tethysApp: ctx.tethysApp });
    createMap(shell.mapArea, store);
    initDataStream(store);
  } catch (error) {
    await delay(minDelay);
    loader.remove();
    mountError(root, { error });
  }

  return config;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
