// // nexusTimeseries.js
import { formatBytes, tableNameForKey } from "./utils";
import { makeOutputUrl } from "./s3Utils";
import { fetchParquetBuffer, isMissing } from "./fetchParquet";

import { sqlIdent, sqlStr } from "./sql";
import { getConnection } from "./duckdbClient";

/** Let go of a connection without waiting for it. */
const safeClose = (conn) => {
  void Promise.resolve(conn?.close?.()).catch(() => {});
};

const DEBUG = process.env.NODE_ENV !== "production";
const debugLog = (...args) => {
  if (DEBUG) console.log(...args);
};

export async function getTimeseries(id, cacheKey, variable) {
  const conn = await getConnection();
  const tableName = tableNameForKey(cacheKey);
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
    safeClose(conn);
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
    safeClose(conn);
  }
}

// Keyed with the extension the cache dispatches on; tableNameForKey strips it, so the table is
// still called index_data_table.
const INDEX_CACHE_KEY = "index_data_table.parquet";

/** Where a parquet lives inside duckdb while its table is built. Not an OPFS path: the bytes are registered from memory and dropped as soon as CREATE TABLE has copied the rows out. */
const INDEX_DUCK_PATH = "nrds-index/index_data_table.parquet";
const duckPathFor = (key) => `nrds-data/${key}`;

/** Build a duckdb table from parquet bytes already in hand. */
async function createTableFromBuffer({ conn, tableName, duckPath, bytes }) {
  const { bindings } = conn;
  try {
    await bindings.registerFileBuffer(duckPath, bytes);
    await conn.query(`
      CREATE TABLE ${sqlIdent(tableName)} AS
      SELECT * FROM read_parquet(${sqlStr(duckPath)});
    `);
  } finally {
    await Promise.resolve(bindings.dropFile(duckPath)).catch(() => {});
  }
}

/** Build the id index table from the slim artifact this app serves. */
let indexLoad = null;

export function loadIndexData({ remoteUrl, fallbackUrl }) {
  if (!indexLoad) {
    indexLoad = buildIndexTable({ remoteUrl, fallbackUrl }).finally(() => {
      indexLoad = null;
    });
  }
  return indexLoad;
}

async function buildIndexTable({ remoteUrl, fallbackUrl }) {
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
    safeClose(conn);
  }

  let buffer;
  try {
    buffer = await fetchParquetBuffer(remoteUrl);
  } catch (err) {
    if (!isMissing(err) || !fallbackUrl) throw err;
    console.warn(`No slim index at ${remoteUrl}; falling back to ${fallbackUrl}`);
    buffer = await fetchParquetBuffer(fallbackUrl);
  }

  const byteLength = buffer.byteLength;
  const tableConn = await getConnection();
  try {
    await createTableFromBuffer({
      conn: tableConn,
      tableName,
      duckPath: INDEX_DUCK_PATH,
      bytes: buffer,
    });
    debugLog(`Created table "${tableName}" from ${byteLength} bytes`);
  } finally {
    await tableConn.close();
  }
}

/** The indexed row for a feature, given one id or several to try. */
/** The table name comes from the same helper the table was created with, so the two cannot part company on a key holding more than one dot. */
export async function getFeatureProperties({ cacheKey, feature_id }) {
  const candidates = (Array.isArray(feature_id) ? feature_id : [feature_id])
    .map((id) => String(id ?? '').replace(/[^\w-]/g, ''))
    .filter(Boolean);
  debugLog("getFeature called with cacheKey:", cacheKey, "candidates:", candidates);
  if (!candidates.length) return [];

  const conn = await getConnection();
  const tableName = tableNameForKey(cacheKey);
  const inList = candidates.map(sqlStr).join(', ');
  const ranking = candidates
    .map((id, i) => `WHEN ${sqlStr(id)} THEN ${i}`)
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
    safeClose(conn);
  }
}

export async function loadVpuData(
  cacheKey,
  prefix,
) {
  debugLog("loadVpuData called with cacheKey:", cacheKey, "prefix:", prefix);

  const bytes = await fetchParquetBuffer(makeOutputUrl(prefix));
  const byteLength = bytes.byteLength;

  const conn = await getConnection();
  try {
    await createTableFromBuffer({
      conn,
      tableName: tableNameForKey(cacheKey),
      duckPath: duckPathFor(cacheKey),
      bytes,
    });
  } finally {
    safeClose(conn);
  }

  return formatBytes(byteLength);
}

/** Whether the table for a cache key is registered in duckdb. */
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
    safeClose(conn);
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
    safeClose(conn);
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
    safeClose(conn);
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
    safeClose(conn);
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
    safeClose(conn);
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
    const resized = new Float32Array(offset);
    for (let i = 0; i < offset; i++) {
      resized[i] = out[i];
    }
    return resized;
  } finally {
    safeClose(conn);
  }
}
