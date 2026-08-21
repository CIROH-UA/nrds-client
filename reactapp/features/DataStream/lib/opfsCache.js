import appAPI from "features/Tethys/services/api/app";
import { tableFromIPC  } from "apache-arrow";
import { getNCFiles } from "./s3Utils";
import { DuckDBDataProtocol } from "@duckdb/duckdb-wasm";
import { getDuckDB, getConnection } from "./duckdbClient";


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
 * The id index is the only one. The search depends on it, it is 103 MB, and refetching it is
 * the slowest thing the app does, so it outlives the data file it sits alongside.
 */
const INTERNAL_FILES = new Set(["index_data_table.parquet"]);

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
  await sweepLeftovers(dir);
  return evicted;
}

/**
 * Remove what an interrupted download left behind.
 *
 * A .partial never became a data file and a .crswap is the staging file behind createWritable,
 * so eviction, the clear button and the cached-files listing all walked past them: an
 * interrupted 103 MB index left 103 MB on disk that nothing in the interface could see or
 * reclaim. Anything written to in the last minute is left alone, since another tab downloading
 * the same file is not this one's to delete.
 */
async function sweepLeftovers(dir) {
  const stale = [];
  for await (const handle of dir.values()) {
    if (handle.kind !== "file") continue;
    const name = handle.name;
    if (!name.endsWith(PARTIAL_SUFFIX) && !name.endsWith(".crswap")) continue;
    if (writingNow.has(name) || writingNow.has(name.replace(/\.crswap$/, ""))) continue;
    const file = await handle.getFile().catch(() => null);
    if (file && Date.now() - file.lastModified < 60_000) continue;
    stale.push(name);
  }

  for (const name of stale) await dir.removeEntry(name).catch(() => {});
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
async function saveArrowToCache(url, writable) {
  try{
    const ncFile = getNCFiles(url);
    const buffer = await appAPI.getArrowPerVpu({
      ncFile,
    });
    
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
    throw error;
  }
}

// The datastream bucket, for callers that pass a key within it rather than a full url.
const DATASTREAM_BUCKET = 'https://ciroh-community-ngen-datastream.s3.us-east-1.amazonaws.com';

async function cacheParquetToOPFS(url, writable) {
  try {
    // An absolute url is used as given: the hydrofabric index lives on a different bucket.
    const source = /^https?:\/\//i.test(url) ? url : `${DATASTREAM_BUCKET}/${url}`;
    const res = await fetch(source, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

    // Stream to disk; avoids loading the entire file in memory
    if (!res.body) {
      const buf = await res.arrayBuffer();
      await writable.write(new Uint8Array(buf));
      await writable.close();
    } else {
      // WritableStream from OPFS supports pipeTo in modern browsers

      await res.body.pipeTo(writable);
      // pipeTo closes the destination by default
    }
  } catch (err) {
    // If pipeTo fails mid-stream, attempt to close to release the lock.
    try { await writable.close(); } catch (_) {}
    throw err;
  }
}

const sqlIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

const safeNameForKey = (key) => encodeURIComponent(key);
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
  const safeName = safeNameForKey(key);
  const partialName = `${safeName}${PARTIAL_SUFFIX}`;

  let handle = await dir.getFileHandle(partialName, { create: true });
  const canSwap = typeof handle.move === "function";
  if (!canSwap) {
    await dir.removeEntry(partialName).catch(() => {});
    handle = await dir.getFileHandle(safeName, { create: true });
  }

  writingNow.add(partialName);
  try {
    const writable = await handle.createWritable();
    if (isArrowFile(key)) {
      await saveArrowToCache(url, writable);
    } else {
      await cacheParquetToOPFS(url, writable);
    }
    if (canSwap) {
      await releaseFromDuckDB(safeName);
      await handle.move(safeName);
    }
  } catch (err) {
    if (canSwap) await dir.removeEntry(partialName).catch(() => {});
    throw err;
  } finally {
    writingNow.delete(partialName);
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

// async function createTableFromOPFSParquet({ db, conn, key }) {
//   const safeName = encodeURIComponent(key);
//   const fileUrl = `opfs://${CACHE_DIR}/${safeName}`;
//   const tableName = key.replace(/\.parquet$/i, "");

//   await conn.query(`
//     CREATE TABLE ${sqlIdent(tableName)} AS
//     SELECT * FROM read_parquet(${sqlStr(fileUrl)});
//   `);
// }
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
async function createTableFromOPFSParquet({ conn, key }) {
  const cacheDir = await getCacheDir();
  const safeName = safeNameForKey(key);
  const fileHandle = await cacheDir.getFileHandle(safeName);

  const duckPath = `${CACHE_DIR}/${safeName}`;
  const bindings = conn.bindings;

  await bindings.registerFileHandle(
    duckPath,
    fileHandle,
    DuckDBDataProtocol.BROWSER_FSACCESS,
    true
  );

  try {
    await conn.query(`
      CREATE TABLE ${sqlIdent(tableNameForKey(key))} AS
      SELECT * FROM read_parquet(${sqlStr(duckPath)});
    `);
  } finally {
    await bindings.dropFile(duckPath);
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

const magicFor = (key) => {
  if (isParquetFile(key)) return PARQUET_MAGIC;
  if (isArrowFile(key)) return ARROW_MAGIC;
  return null;
};

const readMagic = async (file, start, length) =>
  ascii4(new Uint8Array(await file.slice(start, start + length).arrayBuffer()));

/**
 * Whether a cached file is a complete data file rather than the remains of a failed download.
 *
 * getFileHandle with create creates the entry at once, and the bytes go to a .crswap that only
 * swaps in on close, so a reload mid-download leaves 0 bytes behind. Parquet brackets itself
 * with PAR1 at both ends, so a truncated file is detectable too -- 8 bytes read either way.
 */
async function isCompleteDataFile(file, key) {
  const magic = magicFor(key);
  if (!magic) return file.size > 0;
  if (file.size < magic.length * 2) return false;
  if (await readMagic(file, 0, magic.length) !== magic) return false;
  if (magic !== PARQUET_MAGIC) return true;
  return await readMagic(file, file.size - PARQUET_MAGIC.length, PARQUET_MAGIC.length) === magic;
}

export async function statFromCache(key) {
  const dir = await getCacheDir();
  if (!dir) return null;

  const safeName = safeNameForKey(key);
  try {
    const fileHandle = await dir.getFileHandle(safeName);
    const file = await fileHandle.getFile();
    if (!(await isCompleteDataFile(file, key))) {
      // Leads with what happens next: returning null is what makes the caller refetch.
      console.warn(
        `Refetching ${key}: the cached copy is incomplete (${file.size} bytes on disk)`
      );
      await deleteFileFromCache(key);
      return null;
    }
    return { safeName, sizeBytes: file.size };
  } catch {
    return null;
  }
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

  await releaseFromDuckDB(safeName);
  try {
    await dir.removeEntry(safeName);
    return true;
  } catch (e) {
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
    if (INTERNAL_FILES.has(decodeURIComponent(handle.name))) continue;
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
    return `${model}_${date}_${forecast}_${cycle}_${vpu}`.replace(/\./g,'_').replace(/\//g,'_') + `_${newOutputFile}`; ;
  }
  return `${model}_${date}_${forecast}_${cycle}_${ensemble}_${vpu}`.replace(/\./g,'_').replace(/\//g,'_') +  `_${newOutputFile}`;
}
