const CACHE_DIR = "nrds-arrow-cache";
let cacheDirPromise = null;

function formatBytes(bytes, decimals = 2) {
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

export async function saveArrowToCache(key, buffer) {
  const dir = await getCacheDir();
  if (!dir) return; // noop if OPFS unavailable

  const safeName = encodeURIComponent(key) + ".arrow";
  const fileHandle = await dir.getFileHandle(safeName, { create: true });
  const writable = await fileHandle.createWritable();

  // 🔍 Make sure we always pass a proper binary type to write()
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
  const file = await fileHandle.getFile();
  return formatBytes(file.size);
}

export async function loadArrowFromCache(key) {
  const dir = await getCacheDir();
  if (!dir) return null;

  const safeName = encodeURIComponent(key) + ".arrow";
  try {
    const fileHandle = await dir.getFileHandle(safeName);
    const file = await fileHandle.getFile();
    return await file.arrayBuffer(); // back to ArrayBuffer for Arrow/duckdb
  } catch (e) {
    return null; // cache miss
  }
}

export async function getFilesFromCache() {
  const dir = await getCacheDir();
  if (!dir) return null;
  const files = [];

  for await (const handle of dir.values()) {
    if (handle.kind !== "file") continue;
    const file = await handle.getFile();
    const id = decodeURIComponent(file.name.replace(".arrow", ""));
    files.push({id: id, name: id.replaceAll("_", "/"), size: formatBytes(file.size)});
  }
  return files;
}

export async function deleteFileFromCache(key) {
  const dir = await getCacheDir();
  if (!dir) return;
  const safeName = encodeURIComponent(key) + ".arrow";
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
  if (!ensemble){
    return `${model}_${date}_${forecast}_${cycle}_${vpu}_${outputFile}`.replace(/\./g,'_').replace(/\//g,'_');
  }
  return `${model}_${date}_${forecast}_${cycle}_${ensemble}_${vpu}_${outputFile}`.replace(/\./g,'_').replace(/\//g,'_');
}
