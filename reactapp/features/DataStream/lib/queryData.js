// // nexusTimeseries.js
import { statFromCache, saveDataToCache, createTableFromOPFS, formatBytes } from "./opfsCache";

import { getConnection } from "./duckdbClient";

const DEBUG = process.env.NODE_ENV !== "production";
const debugLog = (...args) => {
  if (DEBUG) console.log(...args);
};

export async function getTimeseries(id, cacheKey, variable) {
  const conn = await getConnection();
  const tableName = cacheKey.split('.')[0]; 
  try {
    const rows = [];
    const stream = await conn.send(`
      SELECT time, ${variable}
      FROM ${tableName}
      WHERE feature_id = ${id}
      ORDER BY time
    `);
    debugLog("Query executed:", `
      SELECT time, ${variable}
      FROM ${tableName}
      WHERE feature_id = ${id}
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
    await conn.close();
  }
}

export async function getFeatureIDs(cacheKey) {
  debugLog("getFeatureIDs called with cacheKey:", cacheKey);

  const conn = await getConnection();
  const tableName = cacheKey.split('.')[0];
  try {
    const featureIds = [];
    const stream = await conn.send(`
      SELECT feature_id
      FROM "${tableName}"
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
    await conn.close();
  }
}

export async function loadIndexData({ remoteUrl }) {
  const cacheKey = "index_data_table";
  debugLog("loadIndexData called with cacheKey:", cacheKey);

  const conn = await getConnection();

  try {
    const tableName = cacheKey.replace(/"/g, '""');

    const existsResult = await conn.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.tables
      WHERE table_schema = 'main'
        AND table_name = '${tableName}'
    `);

    const rows = existsResult.toArray();
    const exists = rows[0].cnt > 0;

    if (exists) {
      debugLog(`Table "${cacheKey}" already exists, skipping load.`);
      return;
    }

    await conn.query("INSTALL httpfs; LOAD httpfs;");
    await conn.query("INSTALL parquet; LOAD parquet;");
    await conn.query("SET enable_http_metadata_cache=true;");
    
    await conn.query(`
      CREATE TABLE "${tableName}" AS
      SELECT * FROM read_parquet('${remoteUrl}')
    `);

    debugLog(`Created table "${cacheKey}" from remote parquet ${remoteUrl}`);
  } finally {
    await conn.close();
  }
}


export async function getFeatureProperties({ cacheKey, feature_id }) {
  debugLog("getFeature called with cacheKey:", cacheKey, "feature_id:", feature_id);

  const conn = await getConnection();
  const tableName = cacheKey.split('.')[0];
  try {
    const stream = await conn.send(`
      SELECT *
      FROM "${tableName}"
      WHERE id = '${feature_id}'
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

      debugLog(
        `[getFeatureProperties] (literal) id=${feature_id} rows=1`
      );
      return [row];
    }

    debugLog(
      `[getFeatureProperties] (literal) id=${feature_id} rows=0`
    );
    return [];
  } finally {
    await conn.close();
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
    await conn.close();
  }

  return fileSize;
}

export async function checkForTable(cacheKey) {
  const conn = await getConnection(); 
  try {
    const existsResult = await conn.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.tables
      WHERE table_name = '${cacheKey}'
    `);

    const exists = existsResult.toArray()[0].cnt > 0;
    return exists;
  } finally {
    await conn.close();
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
    await conn.close();
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
    await conn.close();
  }
}


export async function getVariables({ cacheKey }) {
  debugLog("getVariables called with cacheKey:", cacheKey);
  const conn = await getConnection();
  const tableName = cacheKey.split('.')[0];

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
    await conn.close();
  }
}

export async function getDistinctFeatureIds(cacheKey) {
  const conn  = await getConnection();
  const tableName = cacheKey.split('.')[0];
  try {
    const featureIds = [];
    debugLog(`Getting distinct feature_ids from table "${tableName}"...`);
    debugLog(`
      SELECT DISTINCT feature_id
      FROM "${tableName}"
      ORDER BY feature_id
    `);
    const stream = await conn.send(`
      SELECT DISTINCT feature_id
      FROM "${tableName}"
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
    await conn.close();
  }
}

export async function getDistinctTimes(cacheKey) {
  const conn = await getConnection();
  const tableName = cacheKey.split('.')[0];
  try {
    const times = [];
    debugLog(`Getting distinct times from table "${cacheKey}"...`);
    debugLog(`
      SELECT DISTINCT time
      FROM "${tableName}"
      ORDER BY time
    `);
    const stream = await conn.send(`
      SELECT DISTINCT time
      FROM "${tableName}"
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
    await conn.close();
  }
}

// Returns a flattened array ordered by (feature_id, time)
export async function getVpuVariableFlat(cacheKey, variable) {
  const conn = await getConnection();
  const tableName = cacheKey.split('.')[0];
  try {
    debugLog(`Getting variable "${variable}" data from table "${tableName}"...`);
    debugLog(`
      SELECT ${variable} AS v
      FROM "${tableName}"
      ORDER BY feature_id, time
    `);
    const countResult = await conn.query(`
      SELECT COUNT(*) AS n
      FROM "${tableName}"
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
      FROM "${tableName}"
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
    await conn.close();
  }
}
