/**
 * The map's colours for the build-less client (migration unit U3), the vanilla replacement for
 * the React `mapTheme` hook. `readMapTheme` reads the `--map-*` CSS custom properties through
 * getComputedStyle when they are needed rather than when the module loads, so a token applied by
 * the theme stylesheet is honoured, with the same fallbacks the React module used. The value ramp
 * and the basemap style URL follow the effective theme, resolved from the document root's
 * `data-theme` attribute or the system preference.
 */
import { DARK_RAMP, LIGHT_RAMP } from './valueRamp.js';

const STYLE_URLS = {
  light: 'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/styles/light-style.json',
  dark: 'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/styles/dark-style.json',
};

/** The effective theme from the document root, falling back to the system preference. */
export const currentTheme = () => {
  try {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
};

/** One CSS custom property, trimmed and unquoted, or the given fallback when it is unset. */
const readToken = (name, fallback) => {
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    return value || fallback;
  } catch {
    return fallback;
  }
};

/** Read every map token now, resolving the ramp and style URL for the effective theme. */
export const readMapTheme = () => {
  const theme = currentTheme();
  return {
    styleUrl: readToken('--map-style-url', STYLE_URLS[theme]),
    dividesOutline: readToken('--map-divides-outline-color', 'rgba(91, 44, 111, 0.5)'),
    dividesHighlightFill: readToken('--map-divides-highlight-fill', 'rgba(5, 49, 243, 0.32)'),
    dividesHighlightOutline: readToken('--map-divides-highlight-outline', 'rgba(253, 0, 253, 0.7)'),
    flowpaths: readToken('--map-flowpaths-color', '#0b0e10'),
    gauges: readToken('--map-gauges-color', '#646464'),
    vpuBoundary: readToken('--map-vpu-boundary-color', '#009988'),
    cursorSymbolFill: readToken('--map-cursor-symbol-fill', '#1f78b4'),
    pointStroke: readToken('--map-point-stroke-color', '#f7fafe'),
    ramp: theme === 'dark' ? DARK_RAMP : LIGHT_RAMP,
  };
};

export default readMapTheme;
