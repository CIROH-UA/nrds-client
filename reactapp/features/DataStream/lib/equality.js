/** The identity checks the stores use to answer "nothing changed". */
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
