/**
 * A browser exception was printed into the header.
 *
 * The default branch interpolated err.message, so a reader was shown "Failed to execute
 * 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be created if there
 * is another open Access Handle or Writable stream associated with the same file.:nrds-cache/
 * index_data_table.parquet" in a header pill, which pushed the retry button off the screen. The
 * point of this function is to say which of a handful of conditions happened; anything it cannot
 * place is a console matter, and the raw error is already logged there.
 */
const { cacheFailureReason } = require('features/DataStream/lib/utils');

// A phrase, not a sentence: this is read in a pill beside a button.
const LONGEST_SENSIBLE = 32;

describe('what the reader is told', () => {
  it('never repeats a browser message, however it arrives', () => {
    const raw = "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': "
      + 'Access Handles cannot be created if there is another open Access Handle or Writable '
      + 'stream associated with the same file.:nrds-cache/index_data_table.parquet';

    const said = cacheFailureReason(Object.assign(new Error(raw), { name: 'Error' }));

    expect(said).not.toContain('createSyncAccessHandle');
    expect(said).not.toContain('nrds-cache');
    expect(said.length).toBeLessThanOrEqual(LONGEST_SENSIBLE);
  });

  it('places that one, since duckdb flattens it to a plain Error', () => {
    // The DOMException name is lost on the way through duckdb-wasm, so the name-based cases
    // never matched it and it fell through to the branch that printed everything.
    const raw = "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': "
      + 'Access Handles cannot be created if there is another open Access Handle or Writable '
      + 'stream associated with the same file.';

    expect(cacheFailureReason(new Error(raw))).toMatch(/another tab/i);
  });

  it.each([
    ['SecurityError', /storage is blocked/i],
    ['QuotaExceededError', /storage is full/i],
    ['NoModificationAllowedError', /another tab/i],
    ['TimeoutError', /download stopped/i],
    ['DatabaseTimeoutError', /database is not responding/i],
  ])('still places %s by name', (name, shown) => {
    expect(cacheFailureReason(Object.assign(new Error('x'), { name }))).toMatch(shown);
  });

  it('places the missing-file case, which two cold tabs produce', () => {
    const raw = 'A requested file or directory could not be found at the time an operation was '
      + 'processed.:nrds-cache/index_data_table.parquet.partial';

    const said = cacheFailureReason(new Error(raw));

    expect(said).toMatch(/reload/i);
    expect(said).not.toContain('nrds-cache');
    expect(said.length).toBeLessThanOrEqual(LONGEST_SENSIBLE);
  });

  it('is short for anything it cannot place', () => {
    const said = cacheFailureReason(Object.assign(new Error('something new'), { name: 'WeirdError' }));

    expect(said.length).toBeLessThanOrEqual(LONGEST_SENSIBLE);
    expect(said).not.toContain('something new');
  });

  it('copes with being handed nothing', () => {
    expect(typeof cacheFailureReason(undefined)).toBe('string');
    expect(typeof cacheFailureReason(null)).toBe('string');
  });
});
