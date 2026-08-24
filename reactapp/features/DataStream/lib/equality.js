/**
 * The identity checks the stores use to answer "nothing changed".
 *
 * zustand returns the previous state object untouched when a setter hands it back, which is what
 * stops a write that changed nothing from re-rendering every subscriber. Deciding that needs a
 * value comparison, and two stores had grown their own copy of the same one.
 *
 * Not zustand's own `shallow`. Arrays are iterable and have `.entries`, so it routes them through
 * compareEntries, which builds a Map from each side before comparing: measured at roughly 36x the
 * cost of an index loop on a 40,000-element feature-id array, which is the size these are called
 * at on every vpu load.
 *
 * Reference equality first, so the common case costs nothing.
 */
export const sameArrayValues = (a, b) =>
  a === b ||
  (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]));

export const sameObjectValues = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((k) => a[k] === b[k]);
};
