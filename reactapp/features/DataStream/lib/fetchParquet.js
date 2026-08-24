import axios from "axios";

/**
 * Fetch a parquet into memory, bounding silence rather than the whole transfer.
 *
 * A whole-transfer deadline is the wrong shape for a file this size: the slim index is about
 * 45 MiB, which at 1 Mbps is around six minutes of entirely healthy download. What is worth
 * failing on is a connection that opens and then stops delivering, so the timer resets on every
 * progress event and only silence trips it. This is the same rule saveArrowToCache already
 * applied to a download, and the reason the cache layer's own docstring called a total deadline
 * wrong.
 *
 * axios rather than fetch, for three reasons that happen to align: it reports download progress,
 * which is what makes the stall guard possible at all; XHR participates in the HTTP cache
 * normally, so a reload revalidates and gets a 304 instead of re-transferring the body; and it
 * is mockable in jest, where whatwg-fetch exposes no res.body and a chunked reader cannot be
 * exercised.
 *
 * Two failures are renamed on the way out so callers do not have to know axios. A stall becomes
 * TimeoutError, which is what saveArrowToCache already does and what cacheFailureReason already
 * has a phrase for; a body that is not a parquet becomes a plain Error with a name the same
 * function can place. Leaving axios's own CanceledError to escape is how the first version of
 * this file reduced every stall to a bare "Search unavailable".
 */
const FIRST_BYTE_MS = 30_000;
const STALL_MS = 30_000;

// Parquet brackets itself with PAR1 at both ends, which is what makes a wrong body detectable.
const PARQUET_MAGIC = "PAR1";

/**
 * A response the server answered but had nothing at: a stale deploy, or a bad path.
 *
 * 403 counts, because S3 says 403 where a filesystem says 404. A bucket that allows anonymous
 * GetObject but not ListBucket cannot admit a key is absent without leaking what it holds, so it
 * refuses instead -- and that is how the portal's static bucket is configured. Reading it as a
 * permissions problem and throwing is what kept the fallback below from running against a portal
 * whose static was collected without the slim index, which is the one case it exists for.
 *
 * Treating a genuine permissions failure as missing is the right trade here either way: the file
 * cannot be read, the fallback is public, and a slower search beats a dead one.
 */
export const isMissing = (err) =>
  err?.response?.status === 404 ||
  err?.response?.status === 403 ||
  err?.name === "NotParquetError";

/** Silence, not slowness: the guard aborted because nothing arrived for its window. */
export const isStalled = (err) =>
  err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError";

const ascii4 = (bytes) => String.fromCharCode(...bytes);

/**
 * Whether these bytes are a parquet at all, checked at both ends.
 *
 * A 200 carrying an HTML error page, a login redirect or simply the wrong file is bytes as far
 * as axios is concerned, and would otherwise travel all the way into duckdb to fail there with a
 * parser message no reader can act on -- and, because the fallback only triggered on 404, it
 * would never try the upstream file that would have worked.
 */
const looksLikeParquet = (bytes) =>
  bytes.byteLength > PARQUET_MAGIC.length * 2 &&
  ascii4(bytes.subarray(0, 4)) === PARQUET_MAGIC &&
  ascii4(bytes.subarray(-4)) === PARQUET_MAGIC;

export async function fetchParquetBuffer(url, options = {}) {
  const { firstByteMs = FIRST_BYTE_MS, stallMs = STALL_MS } = options;
  const stalled = new AbortController();
  let timer = null;
  const allow = (ms) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => stalled.abort(), ms);
  };

  let body;
  try {
    allow(firstByteMs);
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      signal: stalled.signal,
      onDownloadProgress: () => allow(stallMs),
    });
    body = res?.data;
  } catch (err) {
    if (stalled.signal.aborted) {
      const stall = new Error(`${url} stopped sending after ${stallMs} ms`);
      stall.name = "TimeoutError";
      throw stall;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  let bytes;
  if (body instanceof Uint8Array) bytes = body;
  else if (ArrayBuffer.isView(body)) {
    bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  } else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
  else throw new Error(`${url} returned ${typeof body} rather than bytes`);

  if (!looksLikeParquet(bytes)) {
    const wrong = new Error(`${url} answered ${bytes.byteLength} bytes that are not a parquet`);
    wrong.name = "NotParquetError";
    throw wrong;
  }
  return bytes;
}
