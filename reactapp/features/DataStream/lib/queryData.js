// // nexusTimeseries.js
import {
  statFromCache,
  saveDataToCache,
  createTableFromOPFS,
  formatBytes,
  tableNameForKey,
} from "./opfsCache";

import { fetchParquetBuffer, isMissing } from "./fetchParquet";

import { sqlIdent, sqlStr } from "./sql";
import { getConnection } from "./duckdbClient";

const DEBUG = process.env.NODE_ENV !== "production";
const debugLog = (...args) => {
  if (DEBUG) console.log(...args);
};

export async function getTimeseries(id, cacheKey, variable) {
  const conn = await getConnection();
  const tableName = tableNameForKey(cacheKey);
  // feature_id is compared as a number, so it has to be one: it arrives as the numeric part of
  // an id and anything else belongs nowhere near a query.
  const featureId = Number(id);
  if (!Number.isFinite(featureId)) throw new Error(`Not a feature id: ${id}`);
  try {
    const rows = [];
    const stream = await conn.send(`
      SELECT time, ${sqlIdent(variable)}
      FROM ${sqlIdent(tableName)}
      WHERE feature_id = ${featureId}
      ORDER BY time
    `);
    debugLog("Query executed:", `
      SELECT time, ${sqlIdent(variable)}
      FROM ${sqlIdent(tableName)}
      WHERE feature_id = ${featureId}
      ORDER BY time
    `);

    for await (const batch of stream) {
      const times = batch.getChild('time');
      const values = batch.getChildAt(1);
      if (!times || !values) continue;

      const n = Math.min(times.length, values.length);
      for (let i = 0; i < n; i++) {
        rows.push({
          time: times.get(i),
          [variable]: values.get(i),
        });
      }
    }

    debugLog(
      `[getTimeseries] (literal) id=${id} rows=${rows.length}`
    );
    return rows;
  } finally {
    // Released rather than awaited. Closing is another round trip to the worker, so on one
    // that has stopped answering the wait for the close outlasted the timeout that was
    // meant to escape it, and the caller still never settled.
    void Promise.resolve(conn.close()).catch(() => {});
  }
}

export async function getFeatureIDs(cacheKey) {
  debugLog("getFeatureIDs called with cacheKey:", cacheKey);

  const conn = await getConnection();
  const tableName = tableNameForKey(cacheKey);
  try {
    const featureIds = [];
    const stream = await conn.send(`
      SELECT feature_id
      FROM ${sqlIdent(tableName)}
    `);

    for await (const batch of stream) {
      const ids = batch.getChild('feature_id');
      if (!ids) continue;
      for (let i = 0; i < ids.length; i++) {
        featureIds.push(ids.get(i));
      }
    }

    debugLog(
      `[updateDataInfo] (literal) rows=${featureIds.length}`
    );
    return featureIds;
  } finally {
    void Promise.resolve(conn.close()).catch(() => {});
  }
}

// Keyed with the extension the cache dispatches on; tableNameForKey strips it, so the table is
// still called index_data_table.
const INDEX_CACHE_KEY = "index_data_table.parquet";

/**
 * Where the index lives inside duckdb while its table is built. Not an OPFS path: the bytes are
 * registered from memory and dropped as soon as CREATE TABLE has copied the rows out.
 */
const INDEX_DUCK_PATH = "nrds-index/index_data_table.parquet";

/**
 * Build the id index table from the slim artifact this app serves.
 *
 * No OPFS. The artifact is about 45 MiB and comes from our own static files, so ordinary HTTP
 * caching does what the cache layer used to: a reload revalidates and gets a 304 rather than
 * re-transferring the body. That removes the whole family of per-origin handle failures the
 * cached index used to cause, because a FileSystemSyncAccessHandle is exclusive for the origin
 * rather than for the tab and no second tab could open the file the first one held.
 *
 * CREATE TABLE AS materialises the rows, so the registered buffer is dead weight the moment the
 * statement returns. Dropped in a finally for the same reason the OPFS handle was: a file that
 * failed to parse would otherwise stay registered with no table to show for it.
 */
export async function loadIndexData({ remoteUrl, fallbackUrl }) {
  debugLog("loadIndexData called with cacheKey:", INDEX_CACHE_KEY);

  const tableName = tableNameForKey(INDEX_CACHE_KEY);
  const conn = await getConnection();
  try {
    const existsResult = await conn.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.tables
      WHERE table_schema = 'main'
        AND table_name = '${tableName}'
    `);
    if (existsResult.toArray()[0].cnt > 0) {
      debugLog(`Table "${tableName}" already exists, skipping load.`);
      return;
    }
  } finally {
    void Promise.resolve(conn.close()).catch(() => {});
  }

  let buffer;
  try {
    buffer = await fetchParquetBuffer(remoteUrl);
  } catch (err) {
    // A portal whose static was collected before this artifact existed has nothing at that path.
    // The upstream file is slower and larger, but a working search beats a correct 404.
    if (!isMissing(err) || !fallbackUrl) throw err;
    console.warn(`No slim index at ${remoteUrl}; falling back to ${fallbackUrl}`);
    buffer = await fetchParquetBuffer(fallbackUrl);
  }

  const tableConn = await getConnection();
  const bindings = tableConn.bindings;
  try {
    await bindings.registerFileBuffer(INDEX_DUCK_PATH, buffer);
    await tableConn.query(`
      CREATE TABLE ${sqlIdent(tableName)} AS
      SELECT * FROM read_parquet(${sqlStr(INDEX_DUCK_PATH)});
    `);
    debugLog(`Created table "${tableName}" from ${buffer.byteLength} bytes`);
  } finally {
    await Promise.resolve(bindings.dropFile(INDEX_DUCK_PATH)).catch(() => {});
    await tableConn.close();
  }
}

/**
 * The indexed row for a feature, given one id or several to try.
 *
 * Several, because a bare number names three things: the catchment cat-N, its flowpath wb-N and
 * the nexus nex-N. The catchment wins when more than one matches, since that is what the app
 * charts. Ids are reduced to word characters and dashes before they reach the query.
 */
export async function getFeatureProperties({ cacheKey, feature_id }) {
  const candidates = (Array.isArray(feature_id) ? feature_id : [feature_id])
    .map((id) => String(id ?? '').replace(/[^\w-]/g, ''))
    .filter(Boolean);
  debugLog("getFeature called with cacheKey:", cacheKey, "candidates:", candidates);
  if (!candidates.length) return [];

  const conn = await getConnection();
  // The same helper the table was created with: splitting on the first dot is a second, quieter
  // rule for the same thing, and it parts company with it on any key holding more than one.
  const tableName = tableNameForKey(cacheKey);
  const inList = candidates.map((id) => `'${id}'`).join(', ');
  // Ranked by the order asked for, so "cat first" is expressed once, at the call site.
  const ranking = candidates
    .map((id, i) => `WHEN '${id}' THEN ${i}`)
    .join(' ');
  try {
    const stream = await conn.send(`
      SELECT *
      FROM ${sqlIdent(tableName)}
      WHERE id IN (${inList})
      ORDER BY CASE id ${ranking} ELSE ${candidates.length} END
      LIMIT 1
    `);

    for await (const batch of stream) {
      if (!batch.numRows) continue;

      const row = {};
      for (let i = 0; i < batch.schema.fields.length; i++) {
        const field = batch.schema.fields[i];
        const col = batch.getChildAt(i);
        row[field.name] = col ? col.get(0) : null;
      }

      debugLog(`[getFeatureProperties] matched one of ${candidates.join(', ')}`);
      return [row];
    }

    debugLog(`[getFeatureProperties] no row for ${candidates.join(', ')}`);
    return [];
  } finally {
    void Promise.resolve(conn.close()).catch(() => {});
  }
}

export async function loadVpuData(
  cacheKey,
  prefix,
) {
  debugLog("loadVpuData called with cacheKey:", cacheKey, "prefix:", prefix);

  let meta = await statFromCache(cacheKey);
  let fileSize;

  if (!meta) {
    fileSize = await saveDataToCache(cacheKey, prefix);
    meta = await statFromCache(cacheKey);
    if (!meta) throw new Error(`Saved to cache but can't stat file: ${cacheKey}`);
  } else {
    fileSize = formatBytes(meta.sizeBytes);
  }
  const conn = await getConnection();
  try {
    await createTableFromOPFS({ conn, key: cacheKey, safeName: meta.safeName });
  } finally {
    void Promise.resolve(conn.close()).catch(() => {});
  }

  return fileSize;
}

/**
 * Whether the table for a cache key is registered in duckdb.
 *
 * Asked with the name the table was created under. This compared the raw cache key, extension
 * and all, against names that createTableFromOPFS had already stripped, so it answered false
 * for every parquet key it was ever given. loadVpu therefore re-ran its whole load on every
 * call and appended another row to the cached-files list each time, which is what filled the
 * panel with identical entries; the table was never actually rebuilt, and nothing was
 * re-downloaded, but the work was wasted and a series load asking the same question repeated
 * it on every catchment click.
 */
export async function checkForTable(cacheKey) {
  const conn = await getConnection();
  const tableName = tableNameForKey(cacheKey);
  try {
    const existsResult = await conn.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.tables
      WHERE table_schema = 'main'
        AND table_name = ${sqlStr(tableName)}
    `);

    const exists = existsResult.toArray()[0].cnt > 0;
    return exists;
  } finally {
    void Promise.resolve(conn.close()).catch(() => {});
  }
}

export async function deleteTable(tableName){
  const conn = await getConnection();
  try {
    await conn.query(`
      DROP TABLE IF EXISTS "${tableName}"
    `);
    debugLog(`Table ${tableName} has been deleted.`);
  } finally {
    void Promise.resolve(conn.close()).catch(() => {});
  }
}

export async function dropAllVpuDataTables() {
  const conn = await getConnection();

  try {
    const result = await conn.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'main'
        AND table_type = 'BASE TABLE'
        AND table_name LIKE '%VPU_%'
        AND table_name <> 'index_data_table'
    `);

    const rows = result.toArray();

    if (!rows.length) {
      debugLog('No VPU cache tables found to drop (excluding index_data_table).');
      return;
    }

    for (const row of rows) {
      const schema = row.table_schema;
      const name = row.table_name;

      const fullName = `"${schema}"."${name}"`;
      debugLog(`Dropping table ${fullName}...`);

      await conn.query(`DROP TABLE IF EXISTS ${fullName}`);
    }

    debugLog('Finished dropping VPU cache tables (index_data_table preserved).');
  } finally {
    void Promise.resolve(conn.close()).catch(() => {});
  }
}


export async function getVariables({ cacheKey }) {
  debugLog("getVariables called with cacheKey:", cacheKey);
  const conn = await getConnection();
  const tableName = tableNameForKey(cacheKey);

  try {
    const cols = [];
    const stream = await conn.send(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = '${tableName}'
        AND column_name NOT IN (
          'ngen_id', 'usgs_id', 'nwm_id', 'feature_id', 'time', 'type'
        )
    `);

    for await (const batch of stream) {
      const names = batch.getChild('column_name');
      if (!names) continue;
      for (let i = 0; i < names.length; i++) {
        cols.push(names.get(i));
      }
    }

    return cols;
  } finally {
    void Promise.resolve(conn.close()).catch(() => {});
  }
}

export async function getDistinctFeatureIds(cacheKey) {
  const conn  = await getConnection();
  const tableName = tableNameForKey(cacheKey);
  try {
    const featureIds = [];
    debugLog(`Getting distinct feature_ids from table "${tableName}"...`);
    debugLog(`
      SELECT DISTINCT feature_id
      FROM ${sqlIdent(tableName)}
      ORDER BY feature_id
    `);
    const stream = await conn.send(`
      SELECT DISTINCT feature_id
      FROM ${sqlIdent(tableName)}
      ORDER BY feature_id
    `);
    
    for await (const batch of stream) {
      const ids = batch.getChild('feature_id');
      if (!ids) continue;
      for (let i = 0; i < ids.length; i++) {
        featureIds.push(ids.get(i));
      }
    }

    return featureIds;
  } finally {
    void Promise.resolve(conn.close()).catch(() => {});
  }
}

export async function getDistinctTimes(cacheKey) {
  const conn = await getConnection();
  const tableName = tableNameForKey(cacheKey);
  try {
    const times = [];
    debugLog(`Getting distinct times from table "${cacheKey}"...`);
    debugLog(`
      SELECT DISTINCT time
      FROM ${sqlIdent(tableName)}
      ORDER BY time
    `);
    const stream = await conn.send(`
      SELECT DISTINCT time
      FROM ${sqlIdent(tableName)}
      ORDER BY time
    `);

    for await (const batch of stream) {
      const t = batch.getChild('time');
      if (!t) continue;
      for (let i = 0; i < t.length; i++) {
        times.push(t.get(i));
      }
    }

    return times;
  } finally {
    void Promise.resolve(conn.close()).catch(() => {});
  }
}

// Returns a flattened array ordered by (feature_id, time)
export async function getVpuVariableFlat(cacheKey, variable) {
  const conn = await getConnection();
  const tableName = tableNameForKey(cacheKey);
  try {
    debugLog(`Getting variable "${variable}" data from table "${tableName}"...`);
    debugLog(`
      SELECT ${variable} AS v
      FROM ${sqlIdent(tableName)}
      ORDER BY feature_id, time
    `);
    const countResult = await conn.query(`
      SELECT COUNT(*) AS n
      FROM ${sqlIdent(tableName)}
    `);
    const countCol = countResult.getChild('n');
    const totalRows = Number(countCol?.get(0) ?? 0);
    if (!Number.isFinite(totalRows) || totalRows <= 0) {
      return new Float32Array();
    }

    const out = new Float32Array(totalRows);
    let offset = 0;

    const stream = await conn.send(`
      SELECT ${variable} AS v
      FROM ${sqlIdent(tableName)}
      ORDER BY feature_id, time
    `);

    for await (const batch of stream) {
      const values = batch.getChild('v');
      if (!values) continue;
      for (let i = 0; i < values.length; i++) {
        out[offset++] = Number(values.get(i));
      }
    }

    if (offset === out.length) return out;
    // Defensive resize in case rows changed during stream.
    const resized = new Float32Array(offset);
    for (let i = 0; i < offset; i++) {
      resized[i] = out[i];
    }
    return resized;
  } finally {
    void Promise.resolve(conn.close()).catch(() => {});
  }
}
