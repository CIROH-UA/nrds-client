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

describe('when another context holds the destination file open', () => {
  const PARQUET = new Uint8Array([...'PAR1' + 'x'.repeat(40) + 'PAR1'].map((c) => c.charCodeAt(0)));
  const locked = () => Object.assign(new Error('locked'), { name: 'NoModificationAllowedError' });
  const asFile = (parts, lastModified = Date.now()) => new File(parts, 'f', { lastModified });

  // The one thing the app cannot do anything about: an OPFS file another context has open
  // cannot be written, replaced or deleted, and nothing the app does releases it.
  const opfsWithLockedDestination = () => {
    const store = new Map([['index_data_table.parquet', asFile([])]]);
    const handleFor = (name) => ({
      kind: 'file',
      get name() { return name; },
      getFile: async () => store.get(name),
      createWritable: async () => {
        const chunks = [];
        return { write: async (c) => { chunks.push(c); }, close: async () => { store.set(name, asFile(chunks)); } };
      },
      move: async (to) => { if (store.has(to)) throw locked(); store.set(to, store.get(name)); store.delete(name); },
    });
    const dir = {
      values: async function* () { for (const n of [...store.keys()]) yield handleFor(n); },
      getFileHandle: async (name, opts) => {
        if (!store.has(name)) {
          if (!opts?.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
          store.set(name, asFile([]));
        }
        return handleFor(name);
      },
      removeEntry: async (name) => {
        if (name === 'index_data_table.parquet') throw locked();
        store.delete(name);
      },
    };
    navigator.storage = { getDirectory: async () => ({ getDirectoryHandle: async () => dir }) };
    return store;
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, body: null, arrayBuffer: async () => PARQUET.buffer,
    });
  });

  it('reads the download where it landed instead of failing', async () => {
    const store = opfsWithLockedDestination();
    const { saveDataToCache, statFromCache } = load();

    // The old behaviour: the move threw and the whole load died, every time, forever.
    await expect(
      saveDataToCache('index_data_table.parquet', 'https://example/index.parquet')
    ).resolves.toBeDefined();

    const meta = await statFromCache('index_data_table.parquet');
    expect(meta.safeName).toBe('index_data_table.parquet.partial');
    expect(store.get('index_data_table.parquet.partial').size).toBe(PARQUET.length);
  });

  it('registers the file it actually has with duckdb', async () => {
    opfsWithLockedDestination();
    const { saveDataToCache, createTableFromOPFS } = load();
    await saveDataToCache('index_data_table.parquet', 'https://example/index.parquet');

    const conn = fakeConn();
    await createTableFromOPFS({ conn, key: 'index_data_table.parquet' });

    expect(conn.bindings.registerFileHandle).toHaveBeenCalledWith(
      'nrds-cache/index_data_table.parquet.partial',
      expect.anything(), 3, true
    );
  });

  it('does not sweep away the file it is reading from', async () => {
    const store = opfsWithLockedDestination();
    const { saveDataToCache, pruneCache } = load();
    await saveDataToCache('index_data_table.parquet', 'https://example/index.parquet');

    await pruneCache('something-else.parquet');

    expect(store.has('index_data_table.parquet.partial')).toBe(true);
  });

  it('adopts the landed copy on the next page load instead of downloading again', async () => {
    const store = opfsWithLockedDestination();
    // What a previous session left: the canonical name held at 0 bytes, the bytes beside it.
    store.set('index_data_table.parquet.partial', asFile([PARQUET]));
    const { statFromCache } = load();

    const meta = await statFromCache('index_data_table.parquet');

    expect(meta).toMatchObject({ safeName: 'index_data_table.parquet.partial' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not adopt a partial that is itself half a download', async () => {
    const store = opfsWithLockedDestination();
    store.set('index_data_table.parquet.partial', asFile([PARQUET.slice(0, 20)]));
    const { statFromCache } = load();

    expect(await statFromCache('index_data_table.parquet')).toBe(null);
  });

  it('keeps the index copy when a data file is what is being kept', async () => {
    const store = opfsWithLockedDestination();
    store.set('index_data_table.parquet.partial', asFile([PARQUET], 0));
    store.set('someone-elses.parquet.partial', asFile([PARQUET], 0));
    const { pruneCache } = load();

    await pruneCache('vpu.parquet');

    // The index is exempt from eviction, and so is the copy standing in for it.
    expect(store.has('index_data_table.parquet.partial')).toBe(true);
    expect(store.has('someone-elses.parquet.partial')).toBe(false);
  });

  it('survives the clear button, which spares the index by name', async () => {
    const store = opfsWithLockedDestination();
    store.set('index_data_table.parquet.partial', asFile([PARQUET]));
    const { clearCache } = load();

    await clearCache();

    // Comparing the raw entry name meant a landed copy was not recognised as the index, so
    // clearing threw away 103 MB in exactly the case the fallback exists for.
    expect(store.has('index_data_table.parquet.partial')).toBe(true);
  });

  it('still clears an ordinary data file that landed under .partial', async () => {
    const store = opfsWithLockedDestination();
    store.set('vpu_16.parquet.partial', asFile([PARQUET]));
    const { clearCache } = load();

    await clearCache();

    expect(store.has('vpu_16.parquet.partial')).toBe(false);
  });
});
