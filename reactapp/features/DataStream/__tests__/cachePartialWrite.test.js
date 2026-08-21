/**
 * "Discarding an incomplete cached file: ... 0 bytes" while S3 held 6 MB of data.
 *
 * getFileHandle with create makes the entry before a single byte arrives, and createWritable
 * stages the bytes in a .crswap that only lands on close, so a page that went away mid-download
 * left the cache key on disk holding nothing. The next visit had to recognise that and throw it
 * away, and the warning read as data loss when the download had simply been cut short.
 *
 * A download now writes under .partial and is moved into place once it is whole, so the name
 * callers read is either absent or complete, never half made.
 */
jest.mock('features/Tethys/services/api/app', () => ({ getArrowPerVpu: jest.fn() }));
jest.mock('apache-arrow', () => ({ tableFromIPC: jest.fn() }));
jest.mock('features/DataStream/lib/s3Utils', () => ({ getNCFiles: jest.fn() }));
jest.mock('@duckdb/duckdb-wasm', () => ({ DuckDBDataProtocol: { BROWSER_FSACCESS: 3 } }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  getDuckDB: jest.fn(), getConnection: jest.fn(),
}));

const { getDuckDB, getConnection } = require('features/DataStream/lib/duckdbClient');

const PARQUET = new Uint8Array([...'PAR1' + 'x'.repeat(40) + 'PAR1'].map((c) => c.charCodeAt(0)));

// jsdom has no OPFS. getFile returns a File rather than a Blob because the sweep reads
// lastModified off it, and move/createWritable are modelled on what Chrome does, since the
// whole point of the change is the moment a name becomes readable.
const asFile = (parts, lastModified = Date.now()) => new File(parts, 'f', { lastModified });

const fakeOpfs = ({ move = true, files = {} } = {}) => {
  const store = new Map(Object.entries(files));
  const handleFor = (name) => ({
    kind: 'file',
    get name() { return name; },
    getFile: async () => {
      if (!store.has(name)) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      return store.get(name);
    },
    createWritable: async () => {
      const chunks = [];
      return {
        write: async (chunk) => { chunks.push(chunk); },
        // Nothing is visible under the name until close, exactly as the swap file behaves.
        close: async () => { store.set(name, asFile(chunks)); },
        abort: async () => {},
      };
    },
    ...(move ? { move: async (to) => { store.set(to, store.get(name) ?? asFile([])); store.delete(name); name = to; } } : {}),
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
    removeEntry: async (name) => { store.delete(name); },
  };
  navigator.storage = { getDirectory: async () => ({ getDirectoryHandle: async () => dir }) };
  return store;
};

const load = () => {
  let mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    mod = require('features/DataStream/lib/opfsCache');
  });
  return mod;
};

const respondWith = (body) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true, status: 200, body: null, arrayBuffer: async () => body.buffer ?? body,
  });
};

beforeEach(() => {
  window.localStorage.clear();
  getDuckDB.mockResolvedValue({ dropFile: jest.fn(), dropFiles: jest.fn() });
  getConnection.mockResolvedValue({ query: jest.fn(), close: jest.fn() });
});

describe('downloading into the cache', () => {
  it('only puts the key on disk once the whole file is there', async () => {
    const store = fakeOpfs();
    respondWith(PARQUET);
    const { saveDataToCache } = load();

    const size = await saveDataToCache('vpu.parquet', 'outputs/vpu.parquet');

    expect([...store.keys()]).toEqual(['vpu.parquet']);
    expect(store.get('vpu.parquet').size).toBe(PARQUET.length);
    expect(size).toMatch(/Bytes|KB/);
  });

  it('leaves nothing behind under the key when the download fails', async () => {
    const store = fakeOpfs();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    const { saveDataToCache } = load();

    await expect(saveDataToCache('vpu.parquet', 'outputs/vpu.parquet')).rejects.toThrow(/403/);

    // The old code left "vpu.parquet" here at 0 bytes for the next visit to discover.
    expect([...store.keys()]).toEqual([]);
  });

  it('writes to the real name where OPFS has no move, so the check still guards it', async () => {
    const store = fakeOpfs({ move: false });
    respondWith(PARQUET);
    const { saveDataToCache } = load();

    await saveDataToCache('vpu.parquet', 'outputs/vpu.parquet');

    expect([...store.keys()]).toEqual(['vpu.parquet']);
  });

  it('replaces a stale file of the same name rather than failing on it', async () => {
    const store = fakeOpfs({ files: { 'vpu.parquet': asFile([new Uint8Array(9)]) } });
    respondWith(PARQUET);
    const { saveDataToCache } = load();

    await saveDataToCache('vpu.parquet', 'outputs/vpu.parquet');

    expect(store.get('vpu.parquet').size).toBe(PARQUET.length);
  });
});

describe('what an interrupted download leaves', () => {
  const old = () => asFile([new Uint8Array(1024)], 0);

  it('is swept when the next download prunes', async () => {
    const store = fakeOpfs({
      files: {
        'old.parquet.partial': old(),
        'old.parquet.crswap': old(),
      },
    });
    respondWith(PARQUET);
    const { saveDataToCache } = load();

    await saveDataToCache('vpu.parquet', 'outputs/vpu.parquet');

    // Neither is a data file, so eviction and the clear button both used to walk past them.
    expect([...store.keys()].filter((n) => /partial|crswap/.test(n))).toEqual([]);
    // And the sweep does not take the file the download just landed.
    expect(store.has('vpu.parquet')).toBe(true);
  });

  it('is left alone while another tab is still writing it', async () => {
    const store = fakeOpfs({
      files: { 'other.parquet.partial': asFile([new Uint8Array(1024)]) },
    });
    respondWith(PARQUET);
    const { saveDataToCache } = load();

    await saveDataToCache('vpu.parquet', 'outputs/vpu.parquet');

    expect(store.has('other.parquet.partial')).toBe(true);
  });
});
