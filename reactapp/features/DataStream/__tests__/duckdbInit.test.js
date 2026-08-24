/**
 * One failed duckdb initialisation broke every later use of it.
 *
 * getDuckDB memoises its promise, and it kept memoising a rejected one, so a blocked worker url
 * or a wasm fetch that lost the network was replayed to every caller for the rest of the
 * session: no search index, no data, and nothing to do but reload. getCacheDir in opfsCache.js
 * already cleared its promise on failure; this is the same rule.
 */
jest.mock('@duckdb/duckdb-wasm', () => ({
  getJsDelivrBundles: jest.fn(() => ({})),
  selectBundle: jest.fn(),
  ConsoleLogger: class {},
  AsyncDuckDB: class { async instantiate() {} async open() {} },
  DuckDBAccessMode: { READ_WRITE: 1 },
}));

const duckdb = require('@duckdb/duckdb-wasm');

const load = () => {
  let mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    mod = require('features/DataStream/lib/duckdbClient');
  });
  return mod;
};

beforeEach(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:worker');
  global.URL.revokeObjectURL = jest.fn();
  global.Worker = class {};
  duckdb.getJsDelivrBundles.mockReturnValue({});
});

describe('getDuckDB', () => {
  it('retries after a failed initialisation instead of replaying it', async () => {
    duckdb.selectBundle
      .mockRejectedValueOnce(new Error('failed to fetch the wasm bundle'))
      .mockResolvedValue({ mainWorker: 'w.js', mainModule: 'm.wasm', pthreadWorker: null });
    const { getDuckDB } = load();

    await expect(getDuckDB()).rejects.toThrow(/wasm bundle/);

    // The whole point: the second call builds it rather than handing back the first failure.
    await expect(getDuckDB()).resolves.toBeDefined();
    expect(duckdb.selectBundle).toHaveBeenCalledTimes(2);
  });

  it('builds it once when the first attempt works', async () => {
    duckdb.selectBundle.mockResolvedValue({ mainWorker: 'w.js', mainModule: 'm.wasm', pthreadWorker: null });
    const { getDuckDB } = load();

    const a = await getDuckDB();
    const b = await getDuckDB();

    expect(a).toBe(b);
    expect(duckdb.selectBundle).toHaveBeenCalledTimes(1);
  });
});
