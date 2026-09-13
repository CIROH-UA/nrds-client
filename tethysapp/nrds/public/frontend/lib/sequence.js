/** A "latest one wins" counter, for discarding the results of work that has been overtaken. */
export function createSequence() {
  let latest = 0;
  return {
    next: () => ++latest,
    isCurrent: (ticket) => ticket === latest,
  };
}
