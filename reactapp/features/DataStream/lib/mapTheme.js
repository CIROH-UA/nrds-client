import { useMemo } from 'react';

import { createMediaQuery, useMediaQuery } from 'features/DataStream/lib/matchMedia';
import { DARK_RAMP, LIGHT_RAMP } from 'features/DataStream/lib/valueRamp';

/** The map's colours, read when they are needed rather than when the module loads. */
const DARK_QUERY = '(prefers-color-scheme: dark)';

const LIGHT_STYLE =
  'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/styles/light-style.json';

// jsdom has no matchMedia, and a missing query is not a dark one.
const dark = createMediaQuery(DARK_QUERY, () => false);

/** Whether the reader's system asks for a dark interface. */
/** prefersDark looks unused to the linter and is the whole point: the tokens are not observable, so the media query that changes them stands in for them. */
export const usePrefersDark = () => useMediaQuery(dark);

const readToken = (name, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

/** Read every map token now. */
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
