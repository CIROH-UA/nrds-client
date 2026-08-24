/**
 * Give back the disk an older build of this app is still holding.
 *
 * Until recently every cached file lived in an OPFS directory: the 103 MB id index and one vpu
 * output at a time. Nothing writes or reads it now -- the index comes from this app's own static
 * files and vpu outputs are fetched into memory -- so on any browser that ran an older build the
 * directory is dead weight the app can no longer reach. Deleting the cache layer without this
 * would strand it permanently, which is worse than the state it replaced: at least the old build
 * could evict its own files.
 *
 * Everything here is best effort. Reclaiming disk is not worth failing a page load over, and a
 * directory another tab still holds open simply stays until that tab goes away and a later visit
 * tries again. Runs once per page, after first paint, because nothing depends on the outcome.
 */
const LEGACY_CACHE_DIR = "nrds-cache";

let swept = false;

/**
 * NotFoundError is the ordinary case here: most visitors never ran the build that wrote it.
 */
export async function reclaimLegacyOpfsCache() {
  if (swept) return 0;
  swept = true;
  try {
    const root = await navigator?.storage?.getDirectory?.();
    if (!root) return 0;
    await root.removeEntry(LEGACY_CACHE_DIR, { recursive: true });
    console.info(`Reclaimed the ${LEGACY_CACHE_DIR} directory an older build left behind`);
    return 1;
  } catch (err) {
    if (err?.name !== "NotFoundError") {
      console.debug(`Left ${LEGACY_CACHE_DIR} in place:`, err?.name ?? err);
    }
    return 0;
  }
}
