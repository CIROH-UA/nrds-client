import axios from "axios";

/**
 * Fetch a parquet into memory, bounding silence rather than the whole transfer.
 *
 * A whole-transfer deadline is the wrong shape for a file this size: the slim index is about
 * 45 MiB, which at 1 Mbps is around six minutes of entirely healthy download. What is worth
 * failing on is a connection that opens and then stops delivering, so the timer resets on every
 * progress event and only silence trips it. This is the same rule saveArrowToCache already
 * applies to the NetCDF reply, and the reason opfsCache's own docstring calls a total deadline
 * wrong.
 *
 * axios rather than fetch, for three reasons that happen to align: it reports download progress,
 * which is what makes the stall guard possible at all; XHR participates in the HTTP cache
 * normally, so a reload revalidates and gets a 304 instead of re-transferring the body; and it
 * is mockable in jest, where whatwg-fetch exposes no res.body and a chunked reader cannot be
 * exercised.
 */
const FIRST_BYTE_MS = 30_000;
const STALL_MS = 30_000;

/** A response the server answered but had nothing at: a stale deploy, or a bad path. */
export const isMissing = (err) => err?.response?.status === 404;

/** Silence, not slowness: the guard aborted because nothing arrived for its window. */
export const isStalled = (err) =>
  err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError";

export async function fetchParquetBuffer(url, options = {}) {
  const { firstByteMs = FIRST_BYTE_MS, stallMs = STALL_MS } = options;
  const stalled = new AbortController();
  let timer = null;
  const allow = (ms) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => stalled.abort(), ms);
  };

  try {
    allow(firstByteMs);
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      signal: stalled.signal,
      onDownloadProgress: () => allow(stallMs),
    });
    const body = res?.data;
    if (body instanceof Uint8Array) return body;
    if (ArrayBuffer.isView(body)) {
      return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    }
    if (body instanceof ArrayBuffer) return new Uint8Array(body);
    throw new Error(`${url} returned ${typeof body} rather than bytes`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
