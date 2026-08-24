import { useMemo } from 'react';

import { createMediaQuery, useMediaQuery } from 'features/DataStream/lib/matchMedia';
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

// jsdom has no matchMedia, and a missing query is not a dark one.
const dark = createMediaQuery(DARK_QUERY, () => false);

/** Whether the reader's system asks for a dark interface. */
/**
 * prefersDark looks unused to the linter and is the whole point: the tokens are not observable,
 * so the media query that changes them stands in for them.
 */
export const usePrefersDark = () => useMediaQuery(dark);

const readToken = (name, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

/**
 * Read every map token now.
 *
 * The fallbacks are only for a genuinely missing token. They are no longer load-order
 * insurance, so a wrong one is a bug rather than a theme.
 *
 * The ramp is the exception: it comes from the media query rather than from a token. Everything
 * else here is a single value a stylesheet can hold, while the ramp is six stops that only work
 * as a set, each measured against the basemap surface it is drawn on. Reading the same signal
 * that switches the tokens keeps it in step with them without a parse step that could half-fail.
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
    pointStroke: readToken('--map-point-stroke-color', '#f7fafe'),
    ramp: dark.snapshot() ? DARK_RAMP : LIGHT_RAMP,
  };
};

/** The map's colours for the current theme, recomputed when the theme changes. */
export const useMapTheme = () => {
  const prefersDark = usePrefersDark();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readMapTheme(), [prefersDark]);
};

export default useMapTheme;
