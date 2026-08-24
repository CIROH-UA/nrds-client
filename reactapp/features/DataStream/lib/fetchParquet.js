import axios from "axios";

/** Fetch a parquet into memory, bounding silence rather than the whole transfer. */
const FIRST_BYTE_MS = 30_000;
const STALL_MS = 30_000;

// Parquet brackets itself with PAR1 at both ends, which is what makes a wrong body detectable.
const PARQUET_MAGIC = "PAR1";

/** A response the server answered but had nothing at: a stale deploy, or a bad path. */
export const isMissing = (err) =>
  err?.response?.status === 404 ||
  err?.response?.status === 403 ||
  err?.name === "NotParquetError";

/** Silence, not slowness: the guard aborted because nothing arrived for its window. */
export const isStalled = (err) =>
  err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError";

const ascii4 = (bytes) => String.fromCharCode(...bytes);

/** Whether these bytes are a parquet at all, checked at both ends. */
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
