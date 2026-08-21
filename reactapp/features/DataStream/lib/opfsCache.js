import appAPI from "features/Tethys/services/api/app";
import { tableFromIPC  } from "apache-arrow";
import { getNCFiles } from "./s3Utils";
import { DuckDBDataProtocol } from "@duckdb/duckdb-wasm";
import { getDuckDB, getConnection } from "./duckdbClient";
import { sqlIdent, sqlStr } from "./sql";
import { isFileGone, isHandleHeld } from "./browserErrors";


const CACHE_DIR = "nrds-cache";
let cacheDirPromise = null;

/**
 * The name a download writes under before it is allowed to be the cached file.
 *
 * getFileHandle with create makes the entry at once and the bytes are staged in a .crswap that
 * only lands on close, so a page that went away mid-download left the real key on disk holding
 * 0 bytes. Every "incomplete cached file" warning was that: not a failed download, a download
 * that never got to finish, with S3 holding the data all along. Writing under this suffix and
 * moving on success means an interruption leaves nothing under the name callers look up.
 */
const PARTIAL_SUFFIX = ".partial";

// Downloads this session has open, so a prune running alongside one cannot sweep it away.
const writingNow = new Set();

/**
 * Files the app manages for itself: never evicted, and not offered as something to clear.
 *
 * Empty now, and deliberately. The id index used to be the only entry: the search depended on
 * it, it was 103 MB, and refetching it was the slowest thing the app did, so it was exempted
 * from eviction, from the cached-files listing and from clearing. The index no longer goes
 * through OPFS at all -- it is fetched from this app's own static files and registered as a
 * buffer -- so keeping the exemption would strand 103 MB on every browser that used the older
 * build, unreadable by the app and unreachable by all three reclamation paths, including the
 * clear-cache button. Leaving the set in place rather than removing it keeps the concept for
 * whatever next needs it, and keeps the three call sites honest.
 */
const INTERNAL_FILES = new Set();

async function dropCachedTable(key) {
  try {
    const conn = await getConnection();
    try {
      await conn.query(`DROP TABLE IF EXISTS "${tableNameForKey(key)}"`);
    } finally {
      await conn.close();
    }
  } catch {
    // No database yet, or it never held this table.
  }
}

/**
 * Keep one data file, the one named, and drop every other.
 *
 * One at a time rather than a capped set. The previous cap of ten needed a recency list in
 * localStorage to decide what to drop, and that list was the weak part: with storage disabled
 * every file looked equally old, so the choice fell back to directory order and could have
 * evicted the file that had just been written. Naming what to keep removes both the ranking
 * and that failure mode, and a data file is around 7 MB against a 7.6 GB origin quota, so the
 * cap was never what bounded disk use.
 *
 * The duckdb table goes with the file. Leaving it behind would keep the whole dataset
 * materialized in the worker with nothing on disk to justify it.
 */
export async function pruneCache(keep) {
  const dir = await getCacheDir();
  if (!dir) return [];

  const doomed = [];
  for await (const handle of dir.values()) {
    if (handle.kind !== "file") continue;
    const id = decodeURIComponent(handle.name);
    if (!isArrowFile(id) && !isParquetFile(id)) continue;
    if (id === keep || INTERNAL_FILES.has(id)) continue;
    doomed.push(id);
  }

  const evicted = [];
  for (const id of doomed) {
    await dropCachedTable(id);
    if (await deleteFileFromCache(id)) evicted.push(id);
  }
  await sweepLeftovers(dir, keep);
  return evicted;
}

/**
 * Whether a .partial is the copy the app is currently reading rather than abandoned bytes.
 *
 * The same rule eviction follows: the file named plus the ones the app manages for itself. A
 * landed copy of either is the only thing standing in for a data file, so sweeping it would
 * throw away the download and force it again.
 */
const idOf = (name) => {
  const decoded = decodeURIComponent(name);
  return decoded.endsWith(PARTIAL_SUFFIX)
    ? decoded.slice(0, -PARTIAL_SUFFIX.length)
    : decoded;
};

const isLandedCopy = (name, keep) => {
  if (!name.endsWith(PARTIAL_SUFFIX)) return false;
  const id = idOf(name);
  return id === keep || INTERNAL_FILES.has(id);
};

/**
 * Remove what an interrupted download left behind.
 *
 * A .partial that nothing is reading never became a data file, and a .crswap is the staging
 * file behind createWritable, so eviction, the clear button and the cached-files listing all
 * walked past them: an interrupted 103 MB index left 103 MB on disk that nothing in the
 * interface could see or reclaim. Anything written to in the last minute is left alone, since
 * another tab downloading the same file is not this one's to delete.
 */
async function sweepLeftovers(dir, keep) {
  const stale = [];
  for await (const handle of dir.values()) {
    if (handle.kind !== "file") continue;
    const name = handle.name;
    if (!name.endsWith(PARTIAL_SUFFIX) && !name.endsWith(".crswap")) continue;
    if (writingNow.has(name) || writingNow.has(name.replace(/\.crswap$/, ""))) continue;
    if (isLandedCopy(name, keep)) continue;
    const file = await handle.getFile().catch(() => null);
    if (file && Date.now() - file.lastModified < 60_000) continue;
    stale.push(name);
  }

  for (const name of stale) {
    await dir.removeEntry(name).catch(() => {});
    landedAs.delete(decodeURIComponent(name.replace(PARTIAL_SUFFIX, "")));
  }
  return stale;
}


export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
async function getCacheDir() {
  if (!("storage" in navigator) || !navigator.storage.getDirectory) {
    // OPFS not supported (e.g., non-Chromium / http)
    return null;
  }

  if (!cacheDirPromise) {
    cacheDirPromise = (async () => {
      const root = await navigator.storage.getDirectory();
      return await root.getDirectoryHandle(CACHE_DIR, { create: true });
    })();
  }

  try {
    return await cacheDirPromise;
  } catch (e) {
    cacheDirPromise = null;
    throw e;
  }
}

// async function saveArrowToCache(url, vpu_gpkg, writable) {
/**
 * How long the conversion gets before the first byte, and how long a silence after it.
 *
 * This request is not a download of a file that exists: the app fetches a NetCDF of around five
 * megabytes from s3, turns it into a dataframe and serialises it to Arrow, all before it can send
 * anything. So there is nothing to measure progress against until the reply starts, and the wait
 * for it has to cover work rather than transfer. Measured against the real endpoint: 8.1 seconds
 * for a 5 MB NetCDF returning 10.25 MB of Arrow, so this leaves about eleven times that for a
 * loaded server or a larger file. Once bytes are arriving, silence means what it means for a
 * parquet, so the reply is held to the same window.
 */
const ARROW_FIRST_BYTE_MS = 90_000;

async function saveArrowToCache(url, writable) {
  const stalled = new AbortController();
  let timer = null;
  const allow = (ms) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => stalled.abort(), ms);
  };

  try{
    const ncFile = getNCFiles(url);
    allow(ARROW_FIRST_BYTE_MS);
    const buffer = await appAPI.getArrowPerVpu(
      { ncFile },
      { signal: stalled.signal, onDownloadProgress: () => allow(STALL_MS) }
    );
    
    let dataToWrite;

    if (buffer instanceof ArrayBuffer) {
      dataToWrite = new Uint8Array(buffer);
    } else if (ArrayBuffer.isView(buffer)) {
      // covers Uint8Array, DataView, etc.
      dataToWrite = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else if (buffer instanceof Blob) {
      dataToWrite = buffer;
    } else {
      console.error("saveArrowToCache: unexpected buffer type", buffer);
      throw new Error("saveArrowToCache: expected ArrayBuffer, TypedArray, or Blob");
    }

    await writable.write(dataToWrite);
    await writable.close();
  }
  catch(error){
    console.error("Error fetching Arrow data:", error);
    // Reported as the download stopping, which is what it is from the reader's side. axios
    // surfaces its own cancellation type, and the caller should not have to know that.
    if (stalled.signal.aborted) {
      const err = new Error(`the conversion of ${url} stopped answering`);
      err.name = "TimeoutError";
      throw err;
    }
    throw error;
  }
  finally {
    if (timer) clearTimeout(timer);
  }
}

// The datastream bucket, for callers that pass a key within it rather than a full url.
const DATASTREAM_BUCKET = 'https://ciroh-community-ngen-datastream.s3.us-east-1.amazonaws.com';

/**
 * How long a download may go without making progress before it is abandoned.
 *
 * A deadline on the whole transfer would be wrong: the id index is 103 MB and a slow connection
 * is not a failure. This is reset by each chunk written, so it fires only on a transfer that has
 * stopped progressing. Nothing used to fire at all -- there was no signal and no timeout -- so a
 * stalled fetch left the app saying it was loading for as long as the tab stayed open.
 *
 * Reset once when the response headers arrive, so the wait for the first byte gets its own
 * window rather than sharing one with the gaps between chunks: a server slow to start is not a
 * server that has stopped. Reset again after each chunk is written rather than when it is read,
 * on the reasoning that a completed write is the progress worth measuring -- though with reads
 * and writes alternating one chunk at a time, the two are close enough that no test here can
 * tell them apart, so treat that half as unproven.
 */
const STALL_MS = 30_000;

async function cacheParquetToOPFS(url, writable) {
  // An absolute url is used as given: the hydrofabric index lives on a different bucket.
  const source = /^https?:\/\//i.test(url) ? url : `${DATASTREAM_BUCKET}/${url}`;
  const stalled = new AbortController();
  let timer = null;
  const expectMore = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      stalled.abort(
        new DOMException(`${url} stopped sending after ${STALL_MS} ms`, "TimeoutError")
      );
    }, STALL_MS);
  };

  // Held out here so the failure path can reach it. Taking a writer locks the stream, and
  // closing a locked stream throws TypeError rather than closing it: swallowing that left the
  // file held open for the life of the tab, which is the same lock that stops another tab
  // replacing or deleting it. Measured: close while locked throws, the entry then refuses
  // removeEntry with NoModificationAllowedError, and aborting through the writer releases it.
  let writer = null;
  let reader = null;

  try {
    expectMore();
    const res = await fetch(source, { cache: "no-store", signal: stalled.signal });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

    expectMore();
    if (!res.body) {
      const buf = await res.arrayBuffer();
      await writable.write(new Uint8Array(buf));
      await writable.close();
      return;
    }

    // Read and write by hand rather than pipeTo, for one path on every browser: watching
    // progress through a TransformStream meant skipping the watch wherever TransformStream was
    // missing, and skipping it turned this into the whole-transfer deadline the note above
    // calls wrong.
    reader = res.body.getReader();
    writer = writable.getWriter();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writer.write(value);
      expectMore();
    }
    await writer.close();
  } catch (err) {
    try {
      if (reader) await reader.cancel(err);
      if (writer) await writer.abort(err);
      else if (!reader) await writable.close();
    } catch (_) { /* either side may already have errored itself */ }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}


/**
 * Where a key's bytes actually are, which is not always the name derived from the key.
 *
 * Another context on the same origin can hold an OPFS file open, and then that name cannot be
 * written, replaced or deleted for as long as it holds it. Nothing the app does releases it, so
 * insisting on the canonical name meant one locked file left the whole app unusable: no search
 * index and no data, with the download itself succeeding every time. A cache is an optimisation,
 * so when the destination is unavailable the download stays where it landed and is read from
 * there instead. The stale file is left alone; it is garbage, not data.
 */
const landedAs = new Map();

const safeNameForKey = (key) => landedAs.get(key) ?? encodeURIComponent(key);
export const tableNameForKey = (key) => String(key).replace(/\.(arrow|parquet)$/i, "");

function isNCFile(key) { return key.endsWith('.nc'); }

function isArrowFile(key) {  return key.endsWith('.arrow');}

function isParquetFile(key) { return key.endsWith('.parquet'); }

/**
 * Download a file into the cache under the name callers read only once it is whole.
 *
 * See PARTIAL_SUFFIX for why writing straight to that name could not be interrupted safely.
 * move() replaces the destination in one step, so there is no moment where the key exists
 * holding part of a file. Firefox and Safari have OPFS without move(); there the download goes
 * to the real name as before and statFromCache stays the net that catches a short file.
 *
 * releaseFromDuckDB before the swap because a registration held over from earlier in the
 * session would make OPFS refuse to replace the file underneath it.
 */
export async function saveDataToCache(key, url) {
  const dir = await getCacheDir();
  if (!dir) return; // noop if OPFS unavailable
  const canonical = encodeURIComponent(key);
  const partialName = `${canonical}${PARTIAL_SUFFIX}`;
  landedAs.delete(key);

  let handle = await dir.getFileHandle(partialName, { create: true });
  const canSwap = typeof handle.move === "function";
  if (!canSwap) {
    await dir.removeEntry(partialName).catch(() => {});
    handle = await dir.getFileHandle(canonical, { create: true });
  }

  const writtenName = canSwap ? partialName : canonical;
  writingNow.add(writtenName);
  try {
    const writable = await handle.createWritable();
    if (isArrowFile(key)) {
      await saveArrowToCache(url, writable);
    } else {
      await cacheParquetToOPFS(url, writable);
    }
    if (canSwap) {
      await releaseFromDuckDB(canonical);
      try {
        await handle.move(canonical);
      } catch (err) {
        // See landedAs: the bytes are here and correct, only the destination is unavailable.
        if (err?.name !== "NoModificationAllowedError") throw err;
        landedAs.set(key, partialName);
      }
    }
  } catch (err) {
    // Whichever name took the bytes: without move() that is the canonical one, and leaving a
    // truncated file there made the next read discover it rather than the download.
    await dir.removeEntry(writtenName).catch(() => {});
    throw err;
  } finally {
    writingNow.delete(writtenName);
  }

  const file = await handle.getFile();
  await pruneCache(key);
  return formatBytes(file.size);
}
function ascii4(u8) {
  return String.fromCharCode(...u8);
}


export async function loadFromCache(key) {
  const dir = await getCacheDir();
  if (!dir) return null;

  const safeName = encodeURIComponent(key);
  try {
    const fileHandle = await dir.getFileHandle(safeName);
    const file = await fileHandle.getFile();
    return await file.arrayBuffer(); // back to ArrayBuffer for Arrow/duckdb
  } catch (e) {
    return null; // cache miss
  }
}


async function doesTableExist(conn, tableName) {
  const res = await conn.query(`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'main'
      AND table_name = ${sqlStr(tableName)}
    LIMIT 1
  `);
  return res.toArray().length > 0;
}

/**
 * Build the table for a cached parquet, holding the file only while the statement runs.
 *
 * BROWSER_FSACCESS with directIO opens a FileSystemSyncAccessHandle, and that handle is
 * exclusive for the whole origin, not for the tab. Keeping it for the session meant a second
 * tab of the app could not open the same cached file at all -- "Access Handles cannot be created
 * if there is another open Access Handle or Writable" -- so it had no search index and no vpu
 * data, and could neither delete nor replace the file, which is where NoModificationAllowedError
 * on removeEntry and on move came from. A private window worked only because its storage is a
 * separate partition.
 *
 * CREATE TABLE AS materialises the rows, so nothing reads the file after the statement returns
 * and the registration is pure contention. Dropped in a finally: a file that failed to parse
 * would otherwise stay locked with no table to show for it.
 */
/**
 * A file another context is building a table from, which is a wait rather than a failure.
 *
 * The handle duckdb takes is exclusive for the origin and held only while the statement runs, so
 * a collision resolves itself in the seconds the other tab needs. Two tabs opened at the same
 * moment collide reliably on the id index, since building a table from 103 MB is not quick, and
 * the loser used to report the index as unloadable and leave a retry for someone to press.
 *
 * Matched on the message because duckdb-wasm rethrows the browser's DOMException as a plain
 * Error. Bounded, so a handle that is never released fails rather than waiting for ever.
 *
 * The same loop covers the other way two tabs collide. Both stage a download under one name, and
 * whichever finishes first moves it to the name the file is meant to have -- which takes it out
 * from under the other, whose landed copy is suddenly not there. The file it wants is the one
 * that just arrived, so forgetting where it thought the bytes were and asking again finds them.
 */
const HANDLE_WAIT_MS = 2_000;
const HANDLE_TRIES = 15;

const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function createTableFromOPFSParquet({ conn, key }) {
  const cacheDir = await getCacheDir();
  const bindings = conn.bindings;

  // Resolved per attempt, because both of the things that go wrong here change the answer: a
  // held handle is released by whoever holds it, and a landed copy that has gone missing has
  // gone missing precisely because someone moved it to the name this asks for next.
  for (let attempt = 1; ; attempt += 1) {
    const safeName = safeNameForKey(key);
    const duckPath = `${CACHE_DIR}/${safeName}`;
    try {
      const fileHandle = await cacheDir.getFileHandle(safeName);
      await bindings.registerFileHandle(
        duckPath,
        fileHandle,
        DuckDBDataProtocol.BROWSER_FSACCESS,
        true
      );
    } catch (err) {
      if (isFileGone(err) && landedAs.has(key)) {
        landedAs.delete(key);
        continue;
      }
      if (!isHandleHeld(err) || attempt >= HANDLE_TRIES) throw err;
      await pause(HANDLE_WAIT_MS);
      continue;
    }

    try {
      await conn.query(`
        CREATE TABLE ${sqlIdent(tableNameForKey(key))} AS
        SELECT * FROM read_parquet(${sqlStr(duckPath)});
      `);
      return;
    } finally {
      await bindings.dropFile(duckPath);
    }
  }
}
async function createTableFromOPFSArrow({ conn, key }) {
  const buffer = await loadFromCache(key);
  if (!buffer) throw new Error(`Arrow cache missing after save: ${key}`);

  const arrowTable = tableFromIPC(new Uint8Array(buffer));
  const tableName = tableNameForKey(key);

  await conn.insertArrowTable(arrowTable, { name: tableName });
}

export async function createTableFromOPFS({ conn, key, safeName }) {
  const tableName = tableNameForKey(key);

  if (await doesTableExist(conn, tableName)) {
    console.debug(`Table "${tableName}" already exists, skipping.`);
    return;
  }

  if (isArrowFile(key)) {
    return createTableFromOPFSArrow({ conn, key });
  }
  if (isParquetFile(key)) {
    return createTableFromOPFSParquet({ conn, key, safeName });
  }

  throw new Error(`Unsupported file type for key: ${key}`);
}



export async function getFilesFromCache() {
  const dir = await getCacheDir();
  if (!dir) return null;
  const files = [];

  for await (const handle of dir.values()) {
    if (handle.kind !== "file") continue;
    const id = decodeURIComponent(handle.name);
    // An interrupted download leaves a .crswap behind; it is not a cached table.
    if (!isArrowFile(id) && !isParquetFile(id)) continue;
    if (INTERNAL_FILES.has(id)) continue;
    const file = await handle.getFile();
    files.push({id: id, name: id.replaceAll("_", "/"), size: formatBytes(file.size)});
  }
  return files;
}

const PARQUET_MAGIC = "PAR1";
const ARROW_MAGIC = "ARROW1";

/**
 * The Arrow IPC stream format, which is what this app's own backend writes.
 *
 * It has no "ARROW1" anywhere: that belongs to the file format. A stream opens with a four byte
 * continuation marker and closes with that marker followed by a zero length. Asking for the file
 * format's magic meant every NetCDF selection was fetched, converted, written to the cache and
 * then refused by the check that was supposed to catch half a download, which surfaced as no
 * data available for a vpu whose data was on disk a moment earlier. Copied from a real reply:
 * 7,689,208 bytes opening ff ff ff ff 50 06 00 00 and closing ff ff ff ff 00 00 00 00.
 */
const ARROW_STREAM_START = Uint8Array.of(0xff, 0xff, 0xff, 0xff);
const ARROW_STREAM_END = Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00);

const readBytes = async (file, start, length) =>
  new Uint8Array(await file.slice(start, start + length).arrayBuffer());

const startsWith = (bytes, prefix) =>
  prefix.length <= bytes.length && prefix.every((b, i) => bytes[i] === b);

const readMagic = async (file, start, length) =>
  ascii4(new Uint8Array(await file.slice(start, start + length).arrayBuffer()));

/**
 * Whether a cached Arrow file is whole, in either format it might have been written in.
 *
 * The file format brackets itself with ARROW1, and the stream format with its own markers, so
 * both can be told from a download that stopped early. Both are accepted because the app reads
 * whatever its backend writes, and a change there should fail loudly rather than quietly
 * refusing every file from then on.
 */
async function isCompleteArrow(file) {
  if (file.size < ARROW_STREAM_END.length) return false;
  const head = await readBytes(file, 0, ARROW_MAGIC.length);
  if (ascii4(head) === ARROW_MAGIC) return true;
  if (!startsWith(head, ARROW_STREAM_START)) return false;
  const tail = await readBytes(file, file.size - ARROW_STREAM_END.length, ARROW_STREAM_END.length);
  return startsWith(tail, ARROW_STREAM_END);
}

/**
 * Whether a cached file is a complete data file rather than the remains of a failed download.
 *
 * getFileHandle with create creates the entry at once, and the bytes go to a .crswap that only
 * swaps in on close, so a reload mid-download leaves 0 bytes behind. Parquet brackets itself
 * with PAR1 at both ends, so a truncated file is detectable too -- 8 bytes read either way.
 */
async function isCompleteDataFile(file, key) {
  if (isArrowFile(key)) return isCompleteArrow(file);
  if (!isParquetFile(key)) return file.size > 0;
  if (file.size < PARQUET_MAGIC.length * 2) return false;
  if (await readMagic(file, 0, PARQUET_MAGIC.length) !== PARQUET_MAGIC) return false;
  return (
    await readMagic(file, file.size - PARQUET_MAGIC.length, PARQUET_MAGIC.length) === PARQUET_MAGIC
  );
}

/**
 * Take up a download that had to be left under its .partial name.
 *
 * landedAs only lives for the session, so after a reload the canonical name was consulted,
 * found unusable, and the whole file downloaded again while a complete copy sat beside it: 103
 * MB for the index on every single reload, for as long as something held the canonical name.
 * Adopting it here is what makes the fallback outlive the page.
 */
async function adoptLandedCopy(dir, key) {
  const partialName = `${encodeURIComponent(key)}${PARTIAL_SUFFIX}`;
  try {
    const file = await (await dir.getFileHandle(partialName)).getFile();
    if (!(await isCompleteDataFile(file, key))) return null;
    landedAs.set(key, partialName);
    return { safeName: partialName, sizeBytes: file.size };
  } catch {
    return null;
  }
}

export async function statFromCache(key) {
  const dir = await getCacheDir();
  if (!dir) return null;

  const safeName = safeNameForKey(key);
  try {
    const fileHandle = await dir.getFileHandle(safeName);
    const file = await fileHandle.getFile();
    if (await isCompleteDataFile(file, key)) return { safeName, sizeBytes: file.size };

    // Leads with what happens next, which is a refetch unless a complete copy turns up below.
    console.warn(
      `Refetching ${key}: the cached copy is incomplete (${file.size} bytes on disk)`
    );
    await deleteFileFromCache(key);
  } catch {
    return adoptLandedCopy(dir, key);
  }

  return adoptLandedCopy(dir, key);
}

/**
 * Let go of a cached file inside duckdb so the browser will allow it to be removed.
 *
 * createTableFromOPFS registers each file with BROWSER_FSACCESS, which holds a sync access
 * handle open for the session. OPFS refuses removeEntry on such a file with
 * NoModificationAllowedError, so deletes appeared to work and the file was still there after a
 * reload. Dropping an unregistered name is not an error worth reporting.
 */
async function releaseFromDuckDB(safeName) {
  try {
    const db = await getDuckDB();
    await db.dropFile(`${CACHE_DIR}/${safeName}`);
  } catch {
    // Not registered, which is the normal case for a file this session never opened.
  }
}

export async function deleteFileFromCache(key) {
  const dir = await getCacheDir();
  if (!dir) return false;
  const safeName = safeNameForKey(key);
  landedAs.delete(key);

  await releaseFromDuckDB(safeName);
  try {
    await dir.removeEntry(safeName);
    return true;
  } catch (e) {
    // A warning, not an error: a file another context holds cannot be removed by anyone, and
    // callers carry on without it. See landedAs for what happens instead.
    if (e?.name === "NoModificationAllowedError") {
      console.warn(`Leaving ${key} in the cache: another context has it open`);
      return false;
    }
    console.error("Error deleting file from cache:", e);
    return false;
  }
}

/**
 * Remove the cached data files, keeping the ones the app manages for itself.
 *
 * The id index stays. It was being deleted here while eviction and the cached-files listing
 * both exempt it, so clearing what the interface described as a 7 MB data file also threw away
 * a 103 MB index and left the search dead until the page was reloaded, since the index is only
 * built on mount. Exempting it here makes the three agree.
 */
export async function clearCache() {
  const dir = await getCacheDir();
  if (!dir) return 0;

  // Every registered file at once, for the same reason deleteFileFromCache drops one.
  try {
    const db = await getDuckDB();
    await db.dropFiles();
  } catch (e) {
    console.warn("Could not drop registered files before clearing the cache:", e);
  }

  const names = [];
  for await (const handle of dir.values()) {
    // Through the same suffix strip eviction uses. Comparing the raw name meant a landed copy
    // of the index was not recognised as the index, so clearing threw away the 103 MB file in
    // exactly the case the fallback exists for.
    if (INTERNAL_FILES.has(idOf(handle.name))) continue;
    names.push(handle.name);
  }

  let removed = 0;
  for (const name of names) {
    try {
      await dir.removeEntry(name);
      removed += 1;
    } catch (e) {
      console.error("Error clearing cached file:", name, e);
    }
  }
  return removed;
}

export function getCacheKey(model, date, forecast, cycle, ensemble, vpu, outputFile) {
  const newOutputFile = isNCFile(outputFile) ? outputFile.replace(".nc", ".arrow") : outputFile;
  if (!ensemble){
    return `${model}_${date}_${forecast}_${cycle}_${vpu}`.replace(/\./g,'_').replace(/\//g,'_') + `_${newOutputFile}`;
  }
  return `${model}_${date}_${forecast}_${cycle}_${ensemble}_${vpu}`.replace(/\./g,'_').replace(/\//g,'_') +  `_${newOutputFile}`;
}
