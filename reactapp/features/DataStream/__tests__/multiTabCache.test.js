/**
 * A second tab of the app could not read the cache the first tab had loaded.
 *
 * createTableFromOPFS registered each cached file with BROWSER_FSACCESS and directIO, which
 * opens a FileSystemSyncAccessHandle. That handle is exclusive for the whole origin and was
 * held for the rest of the session, so the second tab got "Access Handles cannot be created if
 * there is another open Access Handle or Writable" and every load failed: no search index, no
 * vpu data. It also made the file undeletable and unreplaceable from the other tab, which is
 * where the NoModificationAllowedError on removeEntry and move came from.
 *
 * CREATE TABLE AS materialises the parquet, so the registration is dead weight the moment the
 * statement returns. Dropping it there is what lets two tabs share one cache.
 */
jest.mock('features/Tethys/services/api/app', () => ({ getArrowPerVpu: jest.fn() }));
jest.mock('apache-arrow', () => ({ tableFromIPC: jest.fn() }));
jest.mock('features/DataStream/lib/s3Utils', () => ({ getNCFiles: jest.fn() }));
jest.mock('@duckdb/duckdb-wasm', () => ({ DuckDBDataProtocol: { BROWSER_FSACCESS: 3 } }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  getDuckDB: jest.fn(), getConnection: jest.fn(),
}));

const { getDuckDB } = require('features/DataStream/lib/duckdbClient');

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

const fakeConn = ({ tableExists = false, queryThrows = null } = {}) => ({
  bindings: { registerFileHandle: jest.fn(), dropFile: jest.fn() },
  query: jest.fn(async (sql) => {
    if (/information_schema/.test(sql)) return { toArray: () => (tableExists ? [{ 1: 1 }] : []) };
    if (queryThrows) throw queryThrows;
    return { toArray: () => [] };
  }),
});

beforeEach(() => {
  window.localStorage.clear();
  fakeOpfs();
  getDuckDB.mockResolvedValue({ dropFile: jest.fn(), dropFiles: jest.fn() });
});

describe('registering a cached parquet with duckdb', () => {
  it('lets go of the file once the table is built', async () => {
    const conn = fakeConn();
    const { createTableFromOPFS } = load();

    await createTableFromOPFS({ conn, key: 'vpu.parquet', safeName: 'vpu.parquet' });

    expect(conn.bindings.registerFileHandle).toHaveBeenCalledTimes(1);
    // Held for the session, no other tab of the app could open the same file.
    expect(conn.bindings.dropFile).toHaveBeenCalledWith('nrds-cache/vpu.parquet');
  });

  it('lets go of it even when the table cannot be built', async () => {
    const conn = fakeConn({ queryThrows: new Error('Invalid Input Error: not a parquet file') });
    const { createTableFromOPFS } = load();

    await expect(
      createTableFromOPFS({ conn, key: 'vpu.parquet', safeName: 'vpu.parquet' })
    ).rejects.toThrow(/not a parquet/);

    expect(conn.bindings.dropFile).toHaveBeenCalledWith('nrds-cache/vpu.parquet');
  });

  it('registers nothing at all when the table is already there', async () => {
    const conn = fakeConn({ tableExists: true });
    const { createTableFromOPFS } = load();

    await createTableFromOPFS({ conn, key: 'vpu.parquet', safeName: 'vpu.parquet' });

    expect(conn.bindings.registerFileHandle).not.toHaveBeenCalled();
    expect(conn.bindings.dropFile).not.toHaveBeenCalled();
  });
});
