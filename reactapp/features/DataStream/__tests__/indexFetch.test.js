/**
 * The index fetch bounds silence, not the whole transfer.
 *
 * The artifact is about 45 MiB, which at 1 Mbps is roughly six minutes of entirely healthy
 * download, so a total deadline would abort exactly the users the smaller index was meant to
 * help. What deserves to fail is a connection that opens and then stops delivering, which is the
 * rule opfsCache already applies to the NetCDF reply and the one its docstring argues for.
 *
 * axios rather than fetch because it reports download progress, which is the only way to tell
 * slow from stopped; because XHR uses the HTTP cache normally, so a reload revalidates instead of
 * re-transferring; and because it is mockable here, where whatwg-fetch exposes no res.body and a
 * chunked reader cannot be driven at all.
 */
jest.mock('axios', () => ({ get: jest.fn() }));

const axios = require('axios');
const {
  fetchParquetBuffer,
  isMissing,
  isStalled,
} = require('features/DataStream/lib/fetchParquet');

const URL_ = '/static/nrds/data/hydrofabric_index_slim.parquet';

/** Hand back the config axios was called with, without ever settling the request. */
const pending = () => {
  let captured;
  axios.get.mockImplementation((_url, config) => {
    captured = config;
    return new Promise(() => {});
  });
  return () => captured;
};

afterEach(() => {
  jest.useRealTimers();
});

describe('fetchParquetBuffer', () => {
  it('returns the body as a Uint8Array', async () => {
    const body = new Uint8Array([1, 2, 3]).buffer;
    axios.get.mockResolvedValue({ data: body });

    const out = await fetchParquetBuffer(URL_);

    expect(out).toBeInstanceOf(Uint8Array);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('passes a body that is already a typed array straight through', async () => {
    axios.get.mockResolvedValue({ data: new Uint8Array([9, 8]) });

    expect(Array.from(await fetchParquetBuffer(URL_))).toEqual([9, 8]);
  });

  it('asks for bytes and supplies an abort signal', async () => {
    axios.get.mockResolvedValue({ data: new Uint8Array([1]).buffer });

    await fetchParquetBuffer(URL_);

    const [, config] = axios.get.mock.calls[0];
    expect(config.responseType).toBe('arraybuffer');
    expect(config.signal).toBeDefined();
    expect(typeof config.onDownloadProgress).toBe('function');
  });

  it('never opts out of the http cache', async () => {
    // The OPFS download passed cache: "no-store" on purpose, because OPFS was the cache. Carrying
    // that over would re-transfer 45 MiB on every load and silently void the revalidation this
    // whole change depends on.
    axios.get.mockResolvedValue({ data: new Uint8Array([1]).buffer });

    await fetchParquetBuffer(URL_);

    const [, config] = axios.get.mock.calls[0];
    expect(config.cache).toBeUndefined();
    expect(config.headers?.['Cache-Control']).toBeUndefined();
  });

  it('aborts when nothing arrives inside the first-byte window', () => {
    jest.useFakeTimers();
    const config = pending();
    fetchParquetBuffer(URL_, { firstByteMs: 1000, stallMs: 500 });

    expect(config().signal.aborted).toBe(false);
    jest.advanceTimersByTime(1001);
    expect(config().signal.aborted).toBe(true);
  });

  it('does not abort a slow download that keeps delivering', () => {
    jest.useFakeTimers();
    const config = pending();
    fetchParquetBuffer(URL_, { firstByteMs: 1000, stallMs: 1000 });

    // Well past any total deadline, but never silent for a full window.
    for (let elapsed = 0; elapsed < 20_000; elapsed += 900) {
      jest.advanceTimersByTime(900);
      config().onDownloadProgress({ loaded: elapsed });
    }

    expect(config().signal.aborted).toBe(false);
  });

  it('aborts when bytes stop arriving mid-transfer', () => {
    jest.useFakeTimers();
    const config = pending();
    fetchParquetBuffer(URL_, { firstByteMs: 5000, stallMs: 1000 });

    config().onDownloadProgress({ loaded: 1024 });
    jest.advanceTimersByTime(999);
    expect(config().signal.aborted).toBe(false);
    jest.advanceTimersByTime(2);
    expect(config().signal.aborted).toBe(true);
  });

  it('rejects a body that is not bytes', async () => {
    axios.get.mockResolvedValue({ data: '<html>nope</html>' });

    await expect(fetchParquetBuffer(URL_)).rejects.toThrow(/rather than bytes/);
  });
});

describe('failure classification', () => {
  it('recognises a missing artifact', () => {
    expect(isMissing({ response: { status: 404 } })).toBe(true);
    expect(isMissing({ response: { status: 500 } })).toBe(false);
    expect(isMissing(new Error('offline'))).toBe(false);
  });

  it('recognises an aborted request', () => {
    expect(isStalled({ code: 'ERR_CANCELED' })).toBe(true);
    expect(isStalled({ name: 'CanceledError' })).toBe(true);
    expect(isStalled(new Error('boom'))).toBe(false);
  });
});
