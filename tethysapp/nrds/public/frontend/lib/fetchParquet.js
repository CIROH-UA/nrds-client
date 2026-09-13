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

  let bytes;
  try {
    allow(firstByteMs);
    const res = await fetch(url, { responseType: "arraybuffer", signal: stalled.signal });
    if (!res.ok) {
      const answered = new Error(`${url} answered ${res.status} ${res.statusText}`);
      answered.response = { status: res.status };
      throw answered;
    }

    const reader = res.body?.getReader?.();
    if (reader) {
      const chunks = [];
      let total = 0;
      for (;;) {
        allow(stallMs);
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.byteLength;
        }
      }
      bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } else {
      allow(stallMs);
      const buffer = await res.arrayBuffer();
      bytes = new Uint8Array(buffer);
    }
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

  if (!looksLikeParquet(bytes)) {
    const wrong = new Error(`${url} answered ${bytes.byteLength} bytes that are not a parquet`);
    wrong.name = "NotParquetError";
    throw wrong;
  }
  return bytes;
}
