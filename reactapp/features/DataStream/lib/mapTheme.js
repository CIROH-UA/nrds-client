import { useMemo, useSyncExternalStore } from 'react';

import { DARK_RAMP, LIGHT_RAMP } from 'features/DataStream/lib/valueRamp';

/**
 * The map's colours, read when they are needed rather than when the module loads.
 *
 * Every one of these used to be a module-scope constant:
 *
 *   export const mapStyleUrl = rootStyles.getPropertyValue('--map-style-url').trim() || LIGHT;
 *
 * which runs while the module graph is still being evaluated, before App.scss has been
 * injected. getPropertyValue returned an empty string, every `||` fallback took over, and every
 * fallback happens to be the light value. So the basemap and all of the layer colours were the
 * light ones no matter what the theme said. In light mode that was invisible, because the
 * fallbacks were right by coincidence; in dark mode the tokens resolved to dark-style.json and
 * the app requested light-style.json anyway.
 *
 * Reading at use time also makes the map follow a theme change during a session, which the
 * frozen constants could never do.
 */
const DARK_QUERY = '(prefers-color-scheme: dark)';

const LIGHT_STYLE =
  'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/styles/light-style.json';

// One MediaQueryList, rebuilt if matchMedia itself is replaced: the same reasoning as
// useIsNarrowViewport, so a late polyfill or a test double does not leave a stale list behind.
let queryListSource;
let darkQueryList = null;
const getDarkQueryList = () => {
  if (queryListSource !== window.matchMedia) {
    queryListSource = window.matchMedia;
    darkQueryList = queryListSource ? queryListSource.call(window, DARK_QUERY) : null;
  }
  return darkQueryList;
};

const subscribeToDark = (onChange) => {
  const mql = getDarkQueryList();
  if (!mql) return () => {};
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

// jsdom has no matchMedia, and a missing query is not a dark one.
const prefersDarkSnapshot = () => getDarkQueryList()?.matches ?? false;

/** Whether the reader's system asks for a dark interface. */
export const usePrefersDark = () => useSyncExternalStore(subscribeToDark, prefersDarkSnapshot);

const readToken = (name, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

/**
 * Read every map token now.
 *
 * The fallbacks are only for a genuinely missing token. They are no longer load-order
 * insurance, so a wrong one is a bug rather than a theme.
 */
export const readMapTheme = () => {
  return {
    styleUrl: readToken('--map-style-url', LIGHT_STYLE),
    dividesOutline: readToken('--map-divides-outline-color', 'rgba(91, 44, 111, 0.5)'),
    dividesHighlightFill: readToken('--map-divides-highlight-fill', 'rgba(5, 49, 243, 0.32)'),
    dividesHighlightOutline: readToken('--map-divides-highlight-outline', 'rgba(253, 0, 253, 0.7)'),
    flowpaths: readToken('--map-flowpaths-color', '#0b0e10'),
    gauges: readToken('--map-gauges-color', '#646464'),
    vpuBoundary: readToken('--map-vpu-boundary-color', '#009988'),
    cursorSymbolFill: readToken('--map-cursor-symbol-fill', '#1f78b4'),
    // Shared: the gauge outline and the cursor legend symbol both read it.
    pointStroke: readToken('--map-point-stroke-color', '#f7fafe'),
    // Picked from the media query rather than a token. The other colours here are single values
    // a stylesheet can hold; the ramp is six stops that only work as a set, measured against the
    // basemap each one is drawn on. Reading the same signal that switches the tokens keeps it in
    // step with them without a parse step that could half-fail.
    ramp: prefersDarkSnapshot() ? DARK_RAMP : LIGHT_RAMP,
  };
};

/** The map's colours for the current theme, recomputed when the theme changes. */
export const useMapTheme = () => {
  const prefersDark = usePrefersDark();
  // prefersDark looks unused to the linter and is the whole point: the tokens are not
  // observable, so the media query that changes them stands in for them.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readMapTheme(), [prefersDark]);
};

export default useMapTheme;
