import { useMemo } from 'react';

import { DARK_RAMP, LIGHT_RAMP } from 'features/DataStream/lib/valueRamp';
import { useEffectiveTheme, useThemeStore } from 'features/DataStream/store/theme';

/** The map's colours, read when they are needed rather than when the module loads. */

const LIGHT_STYLE =
  'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/styles/light-style.json';

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
    ramp: useThemeStore.getState().theme === 'dark' ? DARK_RAMP : LIGHT_RAMP,
  };
};

/** The map's colours for the current theme, recomputed when the theme changes. */
export const useMapTheme = () => {
  const theme = useEffectiveTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readMapTheme(), [theme]);
};

export default useMapTheme;
