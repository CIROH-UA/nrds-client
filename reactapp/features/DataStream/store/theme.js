import { create } from 'zustand';

/**
 * The one JS-observable theme signal.
 *
 * A `data-theme` attribute on the document root drives the CSS token swap, but CSS custom
 * properties emit no JavaScript event and `getComputedStyle` reads are not reactive -- so the
 * map paint, the value ramp, the layer symbology and the legend, which recompute only when a
 * hook they read changes, would not restyle on a manual toggle. This store is that hook: the
 * toggle writes it, and every theme-dependent consumer reads its effective `theme` instead of
 * the `prefers-color-scheme` media query.
 *
 * `preference` is what the reader chose ('light' | 'dark' | 'system'); `theme` is the effective
 * result actually shown ('light' | 'dark'). Only a manual choice sets the `data-theme` attribute,
 * so with no choice the CSS `@media (prefers-color-scheme)` block governs the chrome and this
 * store follows the system query -- the two paths stay in step.
 */

export const THEME_STORAGE_KEY = 'nrds-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The stored choice, or 'system' when none is stored or storage is unavailable. */
const readStoredPreference = () => {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    // A private window, disabled storage, or a security policy: fall back to system.
    return 'system';
  }
};

/** Persist a manual choice; a return to 'system' clears the key rather than storing a word. */
const persistPreference = (preference) => {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Nothing to do: the choice still holds for this session in the store.
  }
};

/** Whether the reader's system asks for a dark interface. */
const systemPrefersDark = () => {
  try {
    return window.matchMedia?.(DARK_QUERY)?.matches ?? false;
  } catch {
    return false;
  }
};

/** The effective theme for a preference. */
const effectiveFor = (preference) =>
  preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;

/** Reflect the preference onto the document root: an attribute only for a manual choice. */
const applyDocumentTheme = (preference) => {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root) return;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
};

export const useThemeStore = create((set, get) => {
  // Seed from localStorage, else the system query, and reflect it onto the root at once so the
  // first paint matches the restored choice rather than flashing the default.
  const preference = readStoredPreference();
  applyDocumentTheme(preference);

  return {
    /** 'light' | 'dark' | 'system' -- what the reader chose. */
    preference,
    /** 'light' | 'dark' -- the effective-theme signal the map and legend read. */
    theme: effectiveFor(preference),

    /** Set the preference explicitly (including a return to 'system'). */
    setPreference: (next) => {
      persistPreference(next);
      applyDocumentTheme(next);
      set({ preference: next, theme: effectiveFor(next) });
    },

    /** Flip between light and dark; either flip is a manual choice that beats the system. */
    toggle: () => {
      const next = get().theme === 'dark' ? 'light' : 'dark';
      get().setPreference(next);
    },

    /** Follow a system-preference change, but only while the reader has made no explicit choice. */
    syncSystem: () => {
      if (get().preference !== 'system') return;
      set({ theme: effectiveFor('system') });
    },
  };
});

// When no manual choice is set, a system change still has to reach the effective-theme signal so
// the map and legend restyle with the CSS @media block. Subscribed once, at module load.
try {
  const mql = window.matchMedia?.(DARK_QUERY);
  mql?.addEventListener?.('change', () => useThemeStore.getState().syncSystem());
} catch {
  // No matchMedia (older jsdom, or a locked-down environment): the store still works, it just
  // cannot observe live system changes.
}

/** The effective theme ('light' | 'dark') for the map, ramp, symbology and legend consumers. */
export const useEffectiveTheme = () => useThemeStore((state) => state.theme);

export default useThemeStore;
