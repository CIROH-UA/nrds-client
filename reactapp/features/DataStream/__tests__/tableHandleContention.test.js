/**
 * Two tabs opened together, and one of them lost its search for the session.
 *
 * duckdb takes an exclusive, origin-wide handle on a cached file while it builds a table from it.
 * Releasing that handle as soon as the statement returns narrowed the collision from a whole
 * session to the length of one CREATE TABLE, which for a 103 MB index is several seconds: wide
 * enough that two tabs started at the same moment reliably collide, and the loser reported the
 * index as unloadable and offered a retry the reader had to press.
 *
 * The handle is coming free on its own, so waiting for it is the answer rather than failing and
 * asking someone to try again.
 */
jest.mock('features/Tethys/services/api/app', () => ({ getArrowPerVpu: jest.fn() }));
jest.mock('apache-arrow', () => ({ tableFromIPC: jest.fn() }));
jest.mock('features/DataStream/lib/s3Utils', () => ({ getNCFiles: jest.fn() }));
jest.mock('@duckdb/duckdb-wasm', () => ({ DuckDBDataProtocol: { BROWSER_FSACCESS: 3 } }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  getDuckDB: jest.fn(), getConnection: jest.fn(),
}));

const { getDuckDB } = require('features/DataStream/lib/duckdbClient');

const busy = () => new Error(
  "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot "
  + 'be created if there is another open Access Handle or Writable stream associated with the '
  + 'same file.:nrds-cache/index_data_table.parquet'
);

const fakeOpfs = () => {
  navigator.storage = {
    getDirectory: async () => ({
      getDirectoryHandle: async () => ({
        getFileHandle: async (name) => ({ name, getFile: async () => new File([], name) }),
        values: async function* () {},
        removeEntry: async () => {},
      }),
    }),
  };
};

const load = () => {
  let mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    mod = require('features/DataStream/lib/opfsCache');
  });
  return mod;
};

const flush = async () => { for (let i = 0; i < 50; i += 1) await Promise.resolve(); };

const connWhere = (registerFileHandle) => ({
  bindings: { registerFileHandle, dropFile: jest.fn() },
  query: jest.fn(async (sql) =>
    (/information_schema/.test(sql) ? { toArray: () => [] } : { toArray: () => [] })),
});

beforeEach(() => {
  window.localStorage.clear();
  fakeOpfs();
  getDuckDB.mockResolvedValue({ dropFile: jest.fn(), dropFiles: jest.fn() });
});

afterEach(() => { jest.useRealTimers(); });

describe('building a table while another tab holds the file', () => {
  it('waits for the handle instead of giving up on it', async () => {
    jest.useFakeTimers();
    const register = jest.fn()
      .mockRejectedValueOnce(busy())
      .mockRejectedValueOnce(busy())
      .mockResolvedValue(undefined);
    const conn = connWhere(register);
    const { createTableFromOPFS } = load();

    const attempt = createTableFromOPFS({ conn, key: 'index_data_table.parquet' });
    for (let i = 0; i < 4; i += 1) { await flush(); jest.advanceTimersByTime(2_000); }
    await flush();

    await expect(attempt).resolves.toBeUndefined();
    expect(register).toHaveBeenCalledTimes(3);
  });

  it('gives up eventually rather than waiting for ever', async () => {
    jest.useFakeTimers();
    const conn = connWhere(jest.fn().mockRejectedValue(busy()));
    const { createTableFromOPFS } = load();

    const attempt = createTableFromOPFS({ conn, key: 'index_data_table.parquet' });
    const settled = expect(attempt).rejects.toThrow(/Access Handles/);
    for (let i = 0; i < 40; i += 1) { await flush(); jest.advanceTimersByTime(2_000); }
    await settled;
  });

  it('does not retry a failure that waiting cannot fix', async () => {
    const conn = connWhere(jest.fn().mockRejectedValue(new Error('not a parquet file')));
    const { createTableFromOPFS } = load();

    await expect(
      createTableFromOPFS({ conn, key: 'index_data_table.parquet' })
    ).rejects.toThrow(/not a parquet/);
    expect(conn.bindings.registerFileHandle).toHaveBeenCalledTimes(1);
  });
});
