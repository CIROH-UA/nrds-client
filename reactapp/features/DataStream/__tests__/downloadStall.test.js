/**
 * A download that stopped delivering left the app loading for as long as the tab stayed open.
 *
 * Nothing passed an AbortSignal to fetch and nothing set a timeout, so a connection that opened
 * and then went quiet never settled: the search box sat at "Building the search index", and a
 * catchment click sat at "Loading cat-...", with no error and nothing to retry. A whole-transfer
 * deadline would be the wrong fix, since the id index is 103 MB and slow is not broken, so what
 * is bounded is the gap between one chunk and the next.
 */
jest.mock('features/Tethys/services/api/app', () => ({ getArrowPerVpu: jest.fn() }));
jest.mock('apache-arrow', () => ({ tableFromIPC: jest.fn() }));
jest.mock('features/DataStream/lib/s3Utils', () => ({ getNCFiles: jest.fn() }));
jest.mock('@duckdb/duckdb-wasm', () => ({ DuckDBDataProtocol: { BROWSER_FSACCESS: 3 } }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  getDuckDB: jest.fn(), getConnection: jest.fn(),
}));

const { getDuckDB, getConnection } = require('features/DataStream/lib/duckdbClient');
const { cacheFailureReason } = require('features/DataStream/lib/utils');

const asFile = (parts, lastModified = 0) => new File(parts, 'f', { lastModified });

// Set by the backpressure test to make each write take time, the way a slow disk does.
let writeDelay = null;

// A response body without ReadableStream, which jsdom does not have: the download only needs a
// reader, so this is the whole contract it depends on.
const bodyOf = (chunks) => {
  let i = 0;
  return { getReader: () => ({ read: async () => (
    i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }
  ) }) };
};

const fakeOpfs = () => {
  const store = new Map();
  const handleFor = (name) => ({
    kind: 'file',
    get name() { return name; },
    getFile: async () => store.get(name) ?? asFile([]),
    createWritable: async () => {
      const chunks = [];
      const stream = {
        write: async (c) => { chunks.push(c); },
        close: async () => { store.set(name, asFile(chunks)); },
      };
      // A real FileSystemWritableFileStream is a WritableStream, so it hands out a writer.
      stream.getWriter = () => ({
        write: async (c) => { if (writeDelay) await writeDelay(); chunks.push(c); },
        close: async () => { store.set(name, asFile(chunks)); },
      });
      return stream;
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

beforeEach(() => {
  writeDelay = null;
  window.localStorage.clear();
  getDuckDB.mockResolvedValue({ dropFile: jest.fn(), dropFiles: jest.fn() });
  getConnection.mockResolvedValue({ query: jest.fn(), close: jest.fn() });
});

afterEach(() => { jest.useRealTimers(); });

// This jest has no advanceTimersByTimeAsync, and the awaits before fetch have to run before the
// clock moves: advancing first would step past a timer that is not armed yet.
const flush = async () => { for (let i = 0; i < 50; i += 1) await Promise.resolve(); };

describe('a download that stops delivering', () => {
  it('gives up instead of waiting for ever', async () => {
    jest.useFakeTimers();
    const store = fakeOpfs();
    // A fetch that opens and then never settles, which is what a dead connection looks like.
    global.fetch = jest.fn((url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    }));
    const { saveDataToCache } = load();

    const attempt = saveDataToCache('vpu.parquet', 'outputs/vpu.parquet');
    await flush();
    jest.advanceTimersByTime(30_000);
    await expect(attempt).rejects.toMatchObject({ name: 'TimeoutError' });

    // And nothing is left under either name for the next read to trip over.
    expect([...store.keys()]).toEqual([]);
  });

  it('passes a signal to fetch at all, which is what makes that possible', async () => {
    fakeOpfs();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, body: null, arrayBuffer: async () => new Uint8Array(4).buffer,
    });
    const { saveDataToCache } = load();

    await saveDataToCache('vpu.parquet', 'outputs/vpu.parquet');

    expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('does not abort a download that is merely slow', async () => {
    jest.useFakeTimers();
    fakeOpfs();
    let release;
    global.fetch = jest.fn(() => new Promise((resolve) => { release = () => resolve({
      ok: true, status: 200, body: null, arrayBuffer: async () => new Uint8Array(4).buffer,
    }); }));
    const { saveDataToCache } = load();

    const attempt = saveDataToCache('vpu.parquet', 'outputs/vpu.parquet');
    await flush();
    jest.advanceTimersByTime(29_000);
    release();

    await expect(attempt).resolves.toBeDefined();
  });

  it('says what happened rather than naming an error class', () => {
    expect(cacheFailureReason({ name: 'TimeoutError' })).toBe('the download stopped');
    expect(cacheFailureReason({ name: 'AbortError' })).toBe('the download stopped');
  });
});

describe('a download that is making progress', () => {
  it('lands every chunk it was sent', async () => {
    const store = fakeOpfs();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, body: bodyOf([new Uint8Array(64), new Uint8Array(32)]),
    });
    const { saveDataToCache } = load();

    await saveDataToCache('vpu.parquet', 'outputs/vpu.parquet');

    expect(store.get('vpu.parquet').size).toBe(96);
  });

  it('survives writes slow enough to matter, as long as they keep landing', async () => {
    jest.useFakeTimers();
    const store = fakeOpfs();
    // Twenty seconds per write, inside the thirty-second window. This does not discriminate
    // resetting after the write from resetting after the read -- checked by mutation, both pass
    // -- so it pins the property that matters: progress is not an abort.
    writeDelay = () => new Promise((r) => setTimeout(r, 20_000));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, body: bodyOf([new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)]),
    });
    const { saveDataToCache } = load();

    const attempt = saveDataToCache('vpu.parquet', 'outputs/vpu.parquet');
    for (let i = 0; i < 4; i += 1) {
      await flush();
      jest.advanceTimersByTime(20_000);
    }
    await flush();
    jest.useRealTimers();

    await expect(attempt).resolves.toBeDefined();
    expect(store.get('vpu.parquet').size).toBe(24);
  });
});
