/**
 * A minimal observable store: `get` returns a shallow copy, `set` shallow-merges a patch and
 * notifies every subscriber, `subscribe` returns an unsubscribe closure. Iteration copies the
 * subscriber set first so a subscriber may unsubscribe during notification without skipping a
 * sibling. This is the vanilla replacement for the zustand stores (KTD1); the app's singleton
 * store and its actions live in app-store.js.
 */
export function createStore(initialState) {
  let state = { ...initialState };
  const subscribers = new Set();
  return {
    get() {
      return { ...state };
    },
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of [...subscribers]) fn(state);
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
