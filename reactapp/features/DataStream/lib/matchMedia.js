import { useSyncExternalStore } from 'react';

/** A media query the interface can subscribe to. */
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
