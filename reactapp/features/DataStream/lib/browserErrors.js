/**
 * Two browser conditions this app has to recognise by their message text.
 *
 * duckdb-wasm rethrows the browser's DOMException as a plain Error, so the name that would have
 * identified either of these is gone by the time it arrives and only the wording is left. Both
 * are asked in two places -- the cache decides whether to wait or to look again, and the
 * interface decides what to tell the reader -- and those two answers have to agree. They were
 * the same regular expressions written out twice in different files, which is the shape of thing
 * that gets updated in one place.
 */

/** Another context on this origin holds the file open, which resolves itself. */
export const isHandleHeld = (err) =>
  /Access Handles cannot be created|createSyncAccessHandle/.test(err?.message ?? '');

/** The file moved or went away, usually because another tab put the real one in its place. */
export const isFileGone = (err) =>
  err?.name === 'NotFoundError' || /could not be found/.test(err?.message ?? '');
