/**
 * Every NetCDF selection was fetched, converted, written to the cache, and then thrown away.
 *
 * The completeness check asks a .arrow file to begin with "ARROW1", which is the magic of the
 * Arrow *file* format. The backend writes pa.ipc.new_stream, which is the *stream* format: it
 * begins with a four byte continuation marker and ends with an end of stream marker, and it has
 * no "ARROW1" anywhere. So statFromCache refused every arrow file the app had just downloaded,
 * deleted it, and reported nothing to stat -- which surfaced as "No data available for selected
 * VPU" on a selection whose data was sitting on disk a moment earlier.
 *
 * The byte patterns below are copied from a real reply: 7,689,208 bytes for a 5 MB NetCDF,
 * beginning ff ff ff ff 50 06 00 00 and ending ff ff ff ff 00 00 00 00.
 */
jest.mock('features/Tethys/services/api/app', () => ({ getArrowPerVpu: jest.fn() }));
jest.mock('apache-arrow', () => ({ tableFromIPC: jest.fn() }));
jest.mock('features/DataStream/lib/s3Utils', () => ({ getNCFiles: jest.fn() }));
jest.mock('@duckdb/duckdb-wasm', () => ({ DuckDBDataProtocol: { BROWSER_FSACCESS: 3 } }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  getDuckDB: jest.fn(), getConnection: jest.fn(),
}));

const { getDuckDB, getConnection } = require('features/DataStream/lib/duckdbClient');

const STREAM_START = [0xff, 0xff, 0xff, 0xff, 0x50, 0x06, 0x00, 0x00];
const STREAM_END = [0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00];
const arrowStream = () => new Blob([Uint8Array.from([...STREAM_START, ...new Array(64).fill(7), ...STREAM_END])]);
const arrowFileFormat = () => new Blob([
  new TextEncoder().encode('ARROW1'), new Uint8Array(64), new TextEncoder().encode('ARROW1'),
]);
const truncatedStream = () => new Blob([Uint8Array.from([...STREAM_START, ...new Array(32).fill(7)])]);

const fakeOpfs = (contents) => {
  const files = new Map(Object.entries(contents).map(([k, v]) => [encodeURIComponent(k), v]));
  const dir = {
    values: async function* () { for (const name of [...files.keys()]) yield { kind: 'file', name }; },
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

describe('an Arrow file in the cache', () => {
  it('is accepted in the stream format the backend actually writes', async () => {
    const files = fakeOpfs({ 'vpu.arrow': arrowStream() });
    const { statFromCache } = load();

    const meta = await statFromCache('vpu.arrow');

    expect(meta).toMatchObject({ safeName: 'vpu.arrow' });
    expect(files.size).toBe(1);
  });

  it('is accepted in the file format too, so a change of writer is not a silent break', async () => {
    fakeOpfs({ 'vpu.arrow': arrowFileFormat() });
    const { statFromCache } = load();

    expect(await statFromCache('vpu.arrow')).toMatchObject({ safeName: 'vpu.arrow' });
  });

  it('is refused when the stream stops before its end marker', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const files = fakeOpfs({ 'vpu.arrow': truncatedStream() });
    const { statFromCache } = load();

    expect(await statFromCache('vpu.arrow')).toBe(null);
    expect(files.size).toBe(0);
    warn.mockRestore();
  });

  it('is refused when it is empty', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fakeOpfs({ 'vpu.arrow': new Blob([]) });
    const { statFromCache } = load();

    expect(await statFromCache('vpu.arrow')).toBe(null);
    warn.mockRestore();
  });
});
