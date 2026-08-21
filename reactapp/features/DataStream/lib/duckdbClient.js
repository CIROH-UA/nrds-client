import * as duckdb from "@duckdb/duckdb-wasm";

let dbPromise = null;

/**
 * The one duckdb instance, built on first use.
 *
 * The promise is cleared if it rejects. Caching a rejected one meant a single failed
 * initialisation -- a blocked worker url, a wasm fetch that lost the network -- was replayed to
 * every later caller, so nothing in the app could touch duckdb again until the page reloaded.
 * getCacheDir in opfsCache.js already does this; this is the same rule.
 */
export function getDuckDB() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      const workerUrl = URL.createObjectURL(
        new Blob(
          [`importScripts("${bundle.mainWorker}");`],
          { type: "text/javascript" }
        )
      );

      const worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);

      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      
      await db.open({
        accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
        opfs: { fileHandling: "auto" },
      });

      // Optional cleanup
      URL.revokeObjectURL(workerUrl);

      return db;
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function getConnection() {
  const db = await getDuckDB();
  const conn = await db.connect();
  return conn;
}


// OPTIONAL: wipe all DB state (tables, etc) but keep worker
export async function resetDatabase() {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.reset();
}

// OPTIONAL: fully tear down the worker (very heavy)
export async function terminateDatabase() {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.terminate();
  dbPromise = null;
}