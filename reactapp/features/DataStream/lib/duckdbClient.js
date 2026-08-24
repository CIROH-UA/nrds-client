import * as duckdb from "@duckdb/duckdb-wasm";

/**
 * How long the worker gets to answer, and why the two numbers differ.
 *
 * Building the database fetches a wasm bundle from a cdn and instantiates it, so it is allowed
 * the time a download needs. Handing out a connection is a round trip to a worker that is
 * already up: if that does not come back, the worker is not answering.
 *
 * The ceiling sits here rather than on the queries. duckdb has no cancel, and a limit loose
 * enough for a CREATE TABLE over 2.07 million rows is no use to a point query that should take
 * milliseconds, so one number cannot serve both. A connection is the cheapest question the
 * worker can be asked, which makes it the one worth timing.
 */
const INIT_MS = 60_000;
const CONNECT_MS = 20_000;

/**
 * Reject if a promise has not settled in time, naming the thing that did not answer.
 *
 * The promise is not cancelled, because nothing here can cancel it. What this buys is that the
 * caller stops waiting: its catch reports and its finally clears the spinner, where before both
 * were unreachable and the app claimed to be loading until the tab closed.
 */
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

/**
 * The one duckdb instance, built on first use.
 *
 * The promise is cleared if it rejects. Caching a rejected one meant a single failed
 * initialisation -- a blocked worker url, a wasm fetch that lost the network -- was replayed to
 * every later caller, so nothing in the app could touch duckdb again until the page reloaded.
 * The cache layer used to do the same thing before it was removed; this is that rule.
 *
 * open() is called without an opfs option on purpose. Nothing this app registers comes from a
 * file handle any more, and leaving the mode on would let a future registerFileHandle reopen the
 * per-origin locking that removing it exists to retire. A main-thread assertion could not catch
 * that -- duckdb's handling runs in the worker -- so it is closed off at the source instead.
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
      
      // No opfs option, so a future registerFileHandle cannot reopen per-origin locking.
      await db.open({ accessMode: duckdb.DuckDBAccessMode.READ_WRITE });

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

/**
 * A connection to the one database, or a refusal if the worker has stopped answering.
 *
 * Deliberately does not terminate the worker on a timeout. A duckdb worker processes its
 * messages one at a time, so a connection queued behind a legitimate long query looks exactly
 * like a connection to a worker that has died -- and tearing the worker down to recover from the
 * second would abort the first. Refusing is the part that is safe to do from here: the reader is
 * told, the spinner clears, and asking again works once the worker is free. Telling the two
 * apart needs a liveness check rather than a deadline, which is a larger piece of work.
 */
export async function getConnection() {
  const db = await withDeadline(getDuckDB(), INIT_MS, "the database");
  let abandoned = false;
  const pending = db.connect();
  // Closed if it turns up late: losing the race cannot cancel the connect, only disown it.
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