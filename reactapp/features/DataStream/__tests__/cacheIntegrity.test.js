/**
 * An interrupted download left a 0-byte file in OPFS, and statFromCache reported it as cached,
 * so callers skipped the download and duckdb refused the file: "too small to be a Parquet
 * file". Every reload took the same path, so one interrupted download disabled the search for
 * good. Existence is not validity.
 */
jest.mock('features/Tethys/services/api/app', () => ({ getArrowPerVpu: jest.fn() }));
jest.mock('apache-arrow', () => ({ tableFromIPC: jest.fn() }));
jest.mock('features/DataStream/lib/s3Utils', () => ({ getNCFiles: jest.fn() }));
jest.mock('@duckdb/duckdb-wasm', () => ({ DuckDBDataProtocol: { BROWSER_FSACCESS: 3 } }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  getDuckDB: jest.fn(), getConnection: jest.fn(),
}));

const { getDuckDB, getConnection } = require('features/DataStream/lib/duckdbClient');

const bytes = (s) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const parquet = () => new Blob([bytes('PAR1' + 'x'.repeat(40) + 'PAR1')]);

// jsdom has no OPFS; Blob supplies the slice/arrayBuffer the integrity check needs.
const fakeOpfs = (contents) => {
  const files = new Map(Object.entries(contents).map(([k, v]) => [encodeURIComponent(k), v]));
  const dir = {
    values: async function* () {
      for (const name of [...files.keys()]) yield { kind: 'file', name };
    },
    getFileHandle: async (name) => {
      if (!files.has(name)) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      return { getFile: async () => files.get(name) };
    },
    removeEntry: async (name) => { files.delete(name); },
  };
  navigator.storage = { getDirectory: async () => ({ getDirectoryHandle: async () => dir }) };
  return files;
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
  window.localStorage.clear();
  getDuckDB.mockResolvedValue({ dropFile: jest.fn(), dropFiles: jest.fn() });
  getConnection.mockResolvedValue({ query: jest.fn(), close: jest.fn() });
});

describe('statFromCache', () => {
  it('reports a complete parquet', async () => {
    fakeOpfs({ 'vpu.parquet': parquet() });
    const { statFromCache } = load();

    const meta = await statFromCache('vpu.parquet');

    expect(meta).toMatchObject({ safeName: 'vpu.parquet' });
    expect(meta.sizeBytes).toBeGreaterThan(0);
  });

  it('rejects the 0-byte file an interrupted download leaves behind', async () => {
    const files = fakeOpfs({ 'vpu.parquet': new Blob([]) });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { statFromCache } = load();

    expect(await statFromCache('vpu.parquet')).toBe(null);
    // Removed as well, so the next attempt downloads instead of tripping over it again.
    expect(files.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^Refetching vpu\.parquet: .*\(0 bytes/));
    warn.mockRestore();
  });

  it('rejects a parquet whose footer never arrived', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fakeOpfs({ 'vpu.parquet': new Blob([bytes('PAR1' + 'x'.repeat(400))]) });
    const { statFromCache } = load();

    // Half a download passes a size check and still is not a parquet.
    expect(await statFromCache('vpu.parquet')).toBe(null);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^Refetching vpu\.parquet: .*\(404 bytes/));
    warn.mockRestore();
  });

  it('rejects a file that is not a parquet at all', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fakeOpfs({ 'vpu.parquet': new Blob([bytes('<?xml version="1.0"?><Error/>')]) });
    const { statFromCache } = load();

    expect(await statFromCache('vpu.parquet')).toBe(null);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^Refetching vpu\.parquet: .*\(29 bytes/));
    warn.mockRestore();
  });

  it('accepts an arrow file by its own marker', async () => {
    fakeOpfs({ 'vpu.arrow': new Blob([bytes('ARROW1__payload')]) });
    const { statFromCache } = load();

    expect(await statFromCache('vpu.arrow')).not.toBe(null);
  });

  it('asks nothing of a file type it does not know', async () => {
    fakeOpfs({ 'notes.txt': new Blob([bytes('hello')]) });
    const { statFromCache } = load();

    expect(await statFromCache('notes.txt')).not.toBe(null);
  });

  it('returns null for a file that is not there', async () => {
    fakeOpfs({});
    const { statFromCache } = load();

    expect(await statFromCache('vpu.parquet')).toBe(null);
  });
});
