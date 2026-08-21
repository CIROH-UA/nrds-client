/**
 * The cache keeps one data file. Loading a vpu drops whatever was there before, so browsing
 * cannot accumulate.
 *
 * The id index used to be exempt from all of this, because the search read it from OPFS and it
 * was 103 MB. It no longer goes through OPFS at all, so the exemption would have stranded that
 *103 MB on every browser that ran the older build: unread by the app and unreachable by eviction,
 * by the cached-files listing and by the clear-cache button alike. These tests now assert the
 * opposite of what they used to -- that the orphan is reclaimed.
 *
 * The cap used to be ten, ranked by a recency list in localStorage. These cover what replaced
 * that: naming the file to keep, rather than ranking the ones to drop. The ranking's failure
 * mode was the reason to remove it, and the last test here is that failure mode.
 */
const INDEX = 'index_data_table.parquet';

let files;
let dropped;

jest.mock('@duckdb/duckdb-wasm', () => ({ DuckDBDataProtocol: { BROWSER_FSACCESS: 3 } }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  getConnection: jest.fn(),
  getDuckDB: jest.fn(),
}));

const { getConnection, getDuckDB } = require('features/DataStream/lib/duckdbClient');

// A stand-in OPFS directory. Iteration order is the insertion order, which is what makes the
// no-ranking-available case testable at all.
const fakeDir = () => ({
  values: async function* () {
    for (const name of Object.keys(files)) {
      yield { kind: 'file', name: encodeURIComponent(name) };
    }
  },
  removeEntry: async (safeName) => {
    const id = decodeURIComponent(safeName);
    if (!(id in files)) throw new Error('NotFoundError');
    delete files[id];
  },
  getFileHandle: async () => { throw new Error('NotFoundError'); },
});

beforeEach(() => {
  files = {};
  dropped = [];
  const dir = fakeDir();
  // navigator.storage.getDirectory() hands back the origin root; the cache is a directory in it.
  global.navigator.storage = {
    getDirectory: async () => ({ getDirectoryHandle: async () => dir }),
  };
  getDuckDB.mockResolvedValue({ dropFiles: jest.fn() });
  getConnection.mockResolvedValue({
    query: jest.fn(async (sql) => {
      const m = sql.match(/DROP TABLE IF EXISTS "([^"]+)"/);
      if (m) dropped.push(m[1]);
      return { toArray: () => [] };
    }),
    close: jest.fn(),
  });
});

const loadCache = () => {
  let mod;
  jest.isolateModules(() => { mod = require('features/DataStream/lib/opfsCache'); });
  return mod;
};

describe('keeping one data file', () => {
  test('drops the previous file when a new one arrives', async () => {
    files = { 'vpu_01.parquet': 1, 'vpu_16.parquet': 1 };

    const evicted = await loadCache().pruneCache('vpu_16.parquet');

    expect(evicted).toEqual(['vpu_01.parquet']);
    expect(Object.keys(files)).toEqual(['vpu_16.parquet']);
  });

  test('drops the duckdb table with the file, under the stripped name', async () => {
    files = { 'vpu_01.parquet': 1, 'vpu_16.parquet': 1 };

    await loadCache().pruneCache('vpu_16.parquet');

    // Left behind, the table keeps the whole dataset materialized in the worker.
    expect(dropped).toEqual(['vpu_01']);
  });

  test('reclaims an id index left behind by the older build', async () => {
    files = { [INDEX]: 1, 'vpu_01.parquet': 1 };

    await loadCache().pruneCache('vpu_01.parquet');

    // Nothing reads this key any more, so keeping it would strand 103 MB no path could reach.
    expect(Object.keys(files)).not.toContain(INDEX);
  });

  test('drops several at once, for a cache left over from the old cap', async () => {
    files = {
      [INDEX]: 1,
      'vpu_01.parquet': 1,
      'vpu_02.parquet': 1,
      'vpu_03.parquet': 1,
      'vpu_16.parquet': 1,
    };

    const evicted = await loadCache().pruneCache('vpu_16.parquet');

    expect(evicted.sort()).toEqual([INDEX, 'vpu_01.parquet', 'vpu_02.parquet', 'vpu_03.parquet']);
    expect(Object.keys(files).sort()).toEqual(['vpu_16.parquet']);
  });

  test('keeps the file it was told to keep even when it is listed first', async () => {
    // The ranking this replaced read recency from localStorage. With storage unavailable every
    // file scored equally, the sort fell back to directory order, and the file just written
    // could be the one deleted. Naming what to keep cannot get this wrong.
    delete global.window.localStorage;
    files = { 'vpu_16.parquet': 1, 'vpu_01.parquet': 1 };

    await loadCache().pruneCache('vpu_16.parquet');

    expect(Object.keys(files)).toEqual(['vpu_16.parquet']);
  });

  test('evicts nothing when the kept file is the only one there', async () => {
    files = { 'vpu_16.parquet': 1 };

    expect(await loadCache().pruneCache('vpu_16.parquet')).toEqual([]);
  });
});

describe('clearing the cache', () => {
  test('clears an id index left behind by the older build', async () => {
    files = { [INDEX]: 1, 'vpu_16.parquet': 1 };

    const removed = await loadCache().clearCache();

    // Removing it used to kill the search until a reload, because the search read it from here.
    // It reads the app's own static artifact now, so this is 103 MB the user gets back.
    expect(removed).toBe(2);
    expect(Object.keys(files)).toEqual([]);
  });

  test('removes every data file it finds', async () => {
    files = { [INDEX]: 1, 'vpu_01.parquet': 1, 'vpu_16.parquet': 1 };

    await loadCache().clearCache();

    expect(Object.keys(files)).toEqual([]);
  });
});
