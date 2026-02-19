import appAPI from "features/Tethys/services/api/app";
import { tableFromIPC  } from "apache-arrow";
import { getNCFiles } from "./s3Utils";
import { DuckDBDataProtocol } from "@duckdb/duckdb-wasm";


const CACHE_DIR = "nrds-arrow-cache";
let cacheDirPromise = null;

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

async function cacheParquetToOPFS(url, writable) {
  try {
    const PARQUETURL=`https://ciroh-community-ngen-datastream.s3.us-east-1.amazonaws.com/${url}`;
    const res = await fetch(PARQUETURL, { cache: "no-store" });
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
const tableNameForKey = (key) => String(key).replace(/\.(arrow|parquet)$/i, "");

function isNCFile(key) { return key.endsWith('.nc'); }

function isArrowFile(key) {  return key.endsWith('.arrow');}

function isParquetFile(key) { return key.endsWith('.parquet'); }

export async function saveDataToCache(key, url) {
  const dir = await getCacheDir();
  if (!dir) return; // noop if OPFS unavailable
  const safeName = encodeURIComponent(key);
  const fileHandle = await dir.getFileHandle(safeName, { create: true });
  const writable = await fileHandle.createWritable();
  if (isArrowFile(key)) {
    await saveArrowToCache(url, writable);
  } else {
    await cacheParquetToOPFS(url, writable);
  }
  const file = await fileHandle.getFile();
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
async function createTableFromOPFSParquet({ conn, key }) {
  // 1) Get the OPFS file handle from your cache directory
  const cacheDir = await getCacheDir();
  const safeName = encodeURIComponent(key);
  const fileHandle = await cacheDir.getFileHandle(safeName);

  // 2) Register it in DuckDB under some virtual path/name
  const duckPath = `${CACHE_DIR}/${safeName}`; // can be any string you like
  const bindings = conn.bindings; // This is the AsyncDuckDB instance

  await bindings.registerFileHandle(
    duckPath,
    fileHandle,
    DuckDBDataProtocol.BROWSER_FSACCESS,
    true
  );

  // 3) Create table from that registered file name
  const tableName = tableNameForKey(key);
  await conn.query(`
    CREATE TABLE ${sqlIdent(tableName)} AS
    SELECT * FROM read_parquet(${sqlStr(duckPath)});
  `);
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
    const file = await handle.getFile();
    const id = decodeURIComponent(file.name);
    files.push({id: id, name: id.replaceAll("_", "/"), size: formatBytes(file.size)});
  }
  return files;
}

export async function statFromCache(key) {
  const dir = await getCacheDir();
  if (!dir) return null;

  const safeName = safeNameForKey(key);
  try {
    const fileHandle = await dir.getFileHandle(safeName);
    const file = await fileHandle.getFile();
    return { safeName, sizeBytes: file.size };
  } catch {
    return null;
  }
}

export async function deleteFileFromCache(key) {
  const dir = await getCacheDir();
  if (!dir) return;
  const safeName = encodeURIComponent(key);
  try {
    await dir.removeEntry(safeName);
    return true;
  } catch (e) {
    console.error("Error deleting file from cache:", e);
    return false;
  }
}

export async function clearCache() {
  const dir = await getCacheDir();
  if (!dir) return;
  for await (const handle of dir.values()) {
    await dir.removeEntry(handle.name);
  }
}

export function getCacheKey(model, date, forecast, cycle, ensemble, vpu, outputFile) {
  const newOutputFile = isNCFile(outputFile) ? outputFile.replace(".nc", ".arrow") : outputFile;
  if (!ensemble){
    return `${model}_${date}_${forecast}_${cycle}_${vpu}`.replace(/\./g,'_').replace(/\//g,'_') + `_${newOutputFile}`; ;
  }
  return `${model}_${date}_${forecast}_${cycle}_${ensemble}_${vpu}`.replace(/\./g,'_').replace(/\//g,'_') +  `_${newOutputFile}`;
}
