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

const PARQUET = new Uint8Array([...'PAR1' + 'x'.repeat(40) + 'PAR1'].map((c) => c.charCodeAt(0)));

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
    // The clock is driven alongside rather than before, so the assertion is awaited directly
    // instead of being held in a variable, which is a rule this project's lint enforces.
    const clock = (async () => {
      for (let i = 0; i < 40; i += 1) { await flush(); jest.advanceTimersByTime(2_000); }
    })();

    await expect(attempt).rejects.toThrow(/Access Handles/);
    await clock;
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

describe('when the landed copy is moved into place by the other tab', () => {
  it('takes the file that arrived rather than reporting the one that left', async () => {
    // Both tabs stage under one name; the winner moves it to the canonical name, which takes it
    // out from under the loser. The loser wants exactly the file that just arrived.
    const present = new Set(['index_data_table.parquet.partial']);
    navigator.storage = {
      getDirectory: async () => ({
        getDirectoryHandle: async () => ({
          getFileHandle: async (name) => {
            if (!present.has(name)) {
              throw Object.assign(new Error('could not be found'), { name: 'NotFoundError' });
            }
            // A complete parquet: the completeness check reads PAR1 at both ends, and an empty
            // file would be refused before this test reached what it is about.
            return { name, getFile: async () => new File([PARQUET], name) };
          },
          values: async function* () {},
          removeEntry: async () => {},
        }),
      }),
    };
    const registered = [];
    const conn = connWhere(jest.fn(async (path) => { registered.push(path); }));
    const { statFromCache, createTableFromOPFS } = load();

    // The loser resolves the bytes to its own staging copy...
    const meta = await statFromCache('index_data_table.parquet');
    expect(meta.safeName).toBe('index_data_table.parquet.partial');

    // ...and the winner moves it into place before the table is built.
    present.delete('index_data_table.parquet.partial');
    present.add('index_data_table.parquet');

    await createTableFromOPFS({ conn, key: 'index_data_table.parquet' });

    // The copy it thought it had is gone, so it never reaches duckdb with that name: it forgets
    // where it thought the bytes were and registers the one that arrived.
    expect(registered).toEqual(['nrds-cache/index_data_table.parquet']);
  });
});
