/**
 * The one effective-theme signal.
 *
 * A `data-theme` attribute swaps the CSS tokens, but CSS variables emit no JS event, so the map,
 * ramp, symbology and legend -- which recompute only when a hook they read changes -- would be
 * stranded on the system query and never restyle on a manual toggle. This store is that hook, and
 * these are its promises: a manual choice sets the attribute and beats the system preference, it
 * persists across a reload, a system change still moves the signal while no choice is set, and the
 * map's ramp reads the signal rather than matchMedia.
 */
import { DARK_RAMP, LIGHT_RAMP } from 'features/DataStream/lib/valueRamp';

const DARK_QUERY = '(prefers-color-scheme: dark)';

// The controllable matchMedia the repo uses elsewhere (see plotBreakpoint.test.js).
const fakeMatchMedia = (initialDark) => {
  const listeners = new Set();
  const mql = {
    matches: initialDark,
    media: DARK_QUERY,
    addEventListener: (_type, cb) => listeners.add(cb),
    removeEventListener: (_type, cb) => listeners.delete(cb),
  };
  const setDark = (next) => {
    mql.matches = next;
    listeners.forEach((cb) => cb({ matches: next }));
  };
  return { matchMedia: jest.fn(() => mql), setDark };
};

const originalMatchMedia = window.matchMedia;

// A "reload": a fresh module load re-runs the store's seed from localStorage and matchMedia.
const freshStore = () => {
  let mod;
  jest.isolateModules(() => {
    mod = require('features/DataStream/store/theme');
  });
  return mod;
};

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* storage may be unavailable in some environments */
  }
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  jest.restoreAllMocks();
});

describe('the effective-theme signal', () => {
  it('follows the system preference when nothing is stored', () => {
    window.matchMedia = fakeMatchMedia(true).matchMedia; // system asks for dark
    const { useThemeStore } = freshStore();

    expect(useThemeStore.getState().preference).toBe('system');
    expect(useThemeStore.getState().theme).toBe('dark');
    // A system default sets no attribute, so the CSS @media block governs the chrome.
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('toggling to dark sets data-theme="dark" on the root and the signal to dark', () => {
    window.matchMedia = fakeMatchMedia(false).matchMedia; // system light
    const { useThemeStore } = freshStore();

    useThemeStore.getState().toggle();

    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('a manual dark choice overrides a light system preference', () => {
    window.matchMedia = fakeMatchMedia(false).matchMedia; // system says light
    const { useThemeStore } = freshStore();
    expect(useThemeStore.getState().theme).toBe('light');

    useThemeStore.getState().setPreference('dark');

    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('restores the last manual choice after a reload', () => {
    window.matchMedia = fakeMatchMedia(false).matchMedia; // system light either way
    freshStore().useThemeStore.getState().setPreference('dark');
    expect(window.localStorage.getItem('nrds-theme')).toBe('dark');

    // A second load, as after a page reload, reads localStorage back.
    const { useThemeStore } = freshStore();

    expect(useThemeStore.getState().preference).toBe('dark');
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('a system change still moves the signal while no choice is set', () => {
    const mm = fakeMatchMedia(false);
    window.matchMedia = mm.matchMedia;
    const { useThemeStore } = freshStore();
    expect(useThemeStore.getState().theme).toBe('light');

    mm.setDark(true);

    expect(useThemeStore.getState().theme).toBe('dark');
    // Still a system default: the attribute stays off and the @media block does the chrome.
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('ignores a system change once an explicit choice is set', () => {
    const mm = fakeMatchMedia(false);
    window.matchMedia = mm.matchMedia;
    const { useThemeStore } = freshStore();
    useThemeStore.getState().setPreference('light'); // explicit light

    mm.setDark(true); // system flips to dark

    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('returning to system clears the stored key and the attribute', () => {
    window.matchMedia = fakeMatchMedia(false).matchMedia;
    const { useThemeStore } = freshStore();
    useThemeStore.getState().setPreference('dark');

    useThemeStore.getState().setPreference('system');

    expect(window.localStorage.getItem('nrds-theme')).toBeNull();
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('falls back to a working system default when localStorage throws', () => {
    jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage blocked');
      });
    window.matchMedia = fakeMatchMedia(true).matchMedia; // system dark

    const { useThemeStore } = freshStore();

    expect(useThemeStore.getState().preference).toBe('system');
    expect(useThemeStore.getState().theme).toBe('dark');
  });
});

describe('the map and legend read the signal, not matchMedia', () => {
  it('recomputes the ramp when the effective theme flips', () => {
    window.matchMedia = fakeMatchMedia(false).matchMedia; // system light
    let theme;
    let mapTheme;
    jest.isolateModules(() => {
      theme = require('features/DataStream/store/theme');
      mapTheme = require('features/DataStream/lib/mapTheme');
    });

    // matchMedia never changed; only the store did, and the ramp follows the store.
    expect(mapTheme.readMapTheme().ramp).toEqual(LIGHT_RAMP);

    theme.useThemeStore.getState().toggle();

    expect(theme.useThemeStore.getState().theme).toBe('dark');
    expect(mapTheme.readMapTheme().ramp).toEqual(DARK_RAMP);
    expect(mapTheme.readMapTheme().ramp).not.toEqual(LIGHT_RAMP);
  });
});
