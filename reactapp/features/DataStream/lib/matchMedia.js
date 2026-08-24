import { useSyncExternalStore } from 'react';

/**
 * A media query the interface can subscribe to.
 *
 * Two of these were written independently -- the dark-theme query in lib/mapTheme.js and the
 * chart's narrow-viewport query in components/forecast/useIsNarrowViewport.js -- and the second
 * one's comment cites "the same reasoning as" the first, which is the codebase saying out loud
 * that it had been copied. This is that reasoning, once.
 *
 * The MediaQueryList is built once and reused, keyed on the matchMedia function it came from, so
 * replacing matchMedia -- a polyfill loading late, or a test supplying its own -- produces a new
 * list rather than handing back one bound to the old implementation.
 *
 * useSyncExternalStore is React's supported way to read an external source like this, so no
 * effect is involved: a re-render happens when the query actually changes, not on every pixel of
 * a drag.
 *
 * `fallback` answers when matchMedia is missing, which is the case under jsdom. It is a function
 * rather than a value because one caller reads the window to answer and the other is a constant.
 */
export function createMediaQuery(query, fallback) {
  let source;
  let list = null;

  const get = () => {
    if (source !== window.matchMedia) {
      source = window.matchMedia;
      list = source ? source.call(window, query) : null;
    }
    return list;
  };

  const subscribe = (onChange) => {
    const mql = get();
    if (!mql) return () => {};
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  };

  const snapshot = () => get()?.matches ?? fallback();

  return { subscribe, snapshot };
}

/** Subscribe a component to one of the queries above. */
export const useMediaQuery = (mediaQuery) =>
  useSyncExternalStore(mediaQuery.subscribe, mediaQuery.snapshot);
