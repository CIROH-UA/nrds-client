/**
 * The NetCDF route had the gap that was just closed for parquet.
 *
 * A .nc output is not downloaded from s3 by the browser: the app asks its own backend, which
 * fetches the file, converts it to a dataframe and serialises it to Arrow before replying. That
 * request went through the shared axios client, which sets no timeout, and axios defaults to
 * none, so a backend that never answered left the app loading until the tab closed.
 *
 * Nothing arrives to measure until the reply starts, so the wait for the first byte is generous
 * and separate. Once bytes are arriving, silence means what it means anywhere else.
 */
jest.mock('features/Tethys/services/api/app', () => ({ getArrowPerVpu: jest.fn() }));
jest.mock('apache-arrow', () => ({ tableFromIPC: jest.fn() }));
jest.mock('features/DataStream/lib/s3Utils', () => ({
  getNCFiles: (p) => `s3://bucket/${p}`,
}));
jest.mock('@duckdb/duckdb-wasm', () => ({ DuckDBDataProtocol: { BROWSER_FSACCESS: 3 } }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  getDuckDB: jest.fn(), getConnection: jest.fn(),
}));

const appAPI = require('features/Tethys/services/api/app').default
  ?? require('features/Tethys/services/api/app');
const { getDuckDB, getConnection } = require('features/DataStream/lib/duckdbClient');

const asFile = (parts, lastModified = 0) => new File(parts, 'f', { lastModified });

const fakeOpfs = () => {
  const store = new Map();
  const handleFor = (name) => ({
    kind: 'file',
    get name() { return name; },
    getFile: async () => store.get(name) ?? asFile([]),
    createWritable: async () => {
      const chunks = [];
      return { write: async (c) => { chunks.push(c); }, close: async () => { store.set(name, asFile(chunks)); } };
    },
    move: async (to) => { store.set(to, store.get(name)); store.delete(name); },
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

const flush = async () => { for (let i = 0; i < 50; i += 1) await Promise.resolve(); };

beforeEach(() => {
  window.localStorage.clear();
  getDuckDB.mockResolvedValue({ dropFile: jest.fn(), dropFiles: jest.fn() });
  getConnection.mockResolvedValue({ query: jest.fn(), close: jest.fn() });
});

afterEach(() => { jest.useRealTimers(); });

describe('converting a NetCDF that never comes back', () => {
  it('is given a signal at all, which is what makes the rest possible', async () => {
    fakeOpfs();
    appAPI.getArrowPerVpu.mockResolvedValue(new Uint8Array(8).buffer);
    const { saveDataToCache } = load();

    await saveDataToCache('vpu.arrow', 'outputs/vpu.nc');

    const [, config] = appAPI.getArrowPerVpu.mock.calls[0];
    expect(config.signal).toBeInstanceOf(AbortSignal);
    expect(typeof config.onDownloadProgress).toBe('function');
  });

  it('gives up on a backend that never answers', async () => {
    jest.useFakeTimers();
    const store = fakeOpfs();
    appAPI.getArrowPerVpu.mockImplementation((_data, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), {
        name: 'CanceledError', code: 'ERR_CANCELED',
      })));
    }));
    const { saveDataToCache } = load();

    const attempt = saveDataToCache('vpu.arrow', 'outputs/vpu.nc');
    await flush();
    jest.advanceTimersByTime(90_000);

    // Reported as the download stopping: the reader should not meet axios's own error type.
    await expect(attempt).rejects.toMatchObject({ name: 'TimeoutError' });
    expect([...store.keys()]).toEqual([]);
  });

  it('waits longer for the conversion than for a silence mid-reply', async () => {
    jest.useFakeTimers();
    fakeOpfs();
    let finish;
    appAPI.getArrowPerVpu.mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve(new Uint8Array(8).buffer);
    }));
    const { saveDataToCache } = load();

    const attempt = saveDataToCache('vpu.arrow', 'outputs/vpu.nc');
    await flush();
    // Past the window a parquet gets between chunks, because the server is still working.
    jest.advanceTimersByTime(60_000);
    finish();

    await expect(attempt).resolves.toBeDefined();
  });

  it('holds the reply to the shorter window once bytes are arriving', async () => {
    jest.useFakeTimers();
    fakeOpfs();
    let progress;
    appAPI.getArrowPerVpu.mockImplementation((_d, { signal, onDownloadProgress }) => {
      progress = onDownloadProgress;
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), {
          name: 'CanceledError',
        })));
      });
    });
    const { saveDataToCache } = load();

    const attempt = saveDataToCache('vpu.arrow', 'outputs/vpu.nc');
    await flush();
    progress({ loaded: 1024 });          // the reply has started
    jest.advanceTimersByTime(31_000);    // and then goes quiet

    await expect(attempt).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});
