import * as duckdb from "@duckdb/duckdb-wasm";

/** How long the worker gets to answer, and why the two numbers differ. */
const INIT_MS = 60_000;
const CONNECT_MS = 20_000;

/** Reject if a promise has not settled in time, naming the thing that did not answer. */
function withDeadline(promise, ms, what) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${what} did not answer within ${ms} ms`);
      err.name = "DatabaseTimeoutError";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

let dbPromise = null;

/** The one duckdb instance, built on first use. */
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
      
      await db.open({ accessMode: duckdb.DuckDBAccessMode.READ_WRITE });

      URL.revokeObjectURL(workerUrl);

      return db;
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** A connection to the one database, or a refusal if the worker has stopped answering. */
export async function getConnection() {
  const db = await withDeadline(getDuckDB(), INIT_MS, "the database");
  let abandoned = false;
  const pending = db.connect();
  pending.then(
    (conn) => { if (abandoned) Promise.resolve(conn.close()).catch(() => {}); },
    () => {}
  );
  try {
    return await withDeadline(pending, CONNECT_MS, "the database");
  } catch (err) {
    abandoned = true;
    throw err;
  }
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