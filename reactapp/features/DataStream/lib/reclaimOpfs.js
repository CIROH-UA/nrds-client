/** Give back the disk an older build of this app is still holding. */
const LEGACY_CACHE_DIR = "nrds-cache";

let swept = false;

/** NotFoundError is the ordinary case here: most visitors never ran the build that wrote it. */
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
