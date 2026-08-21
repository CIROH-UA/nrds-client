/**
 * The index fetch bounds silence, not the whole transfer, and refuses a body that is not a parquet.
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
 *
 * Both failures are renamed on the way out. An earlier version let axios's CanceledError escape,
 * which cacheFailureReason has no case for, so every stall was reduced to a bare "Search
 * unavailable" with the specific phrase already sitting unused two files away.
 */
jest.mock('axios', () => ({ get: jest.fn() }));

const axios = require('axios');
const {
  fetchParquetBuffer,
  isMissing,
  isStalled,
} = require('features/DataStream/lib/fetchParquet');

const URL_ = '/static/nrds/data/hydrofabric_index_slim.parquet';

/** Bytes shaped like a parquet: PAR1 at both ends, which is what the guard checks. */
const parquet = (payload = [1, 2, 3, 4]) =>
  new Uint8Array([...Buffer.from('PAR1'), ...payload, ...Buffer.from('PAR1')]);

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
    const body = parquet();
    axios.get.mockResolvedValue({ data: body.buffer });

    const out = await fetchParquetBuffer(URL_);

    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.byteLength).toBe(body.byteLength);
  });

  it('passes a body that is already a typed array straight through', async () => {
    axios.get.mockResolvedValue({ data: parquet([9, 8]) });

    expect((await fetchParquetBuffer(URL_)).byteLength).toBe(10);
  });

  it('asks for bytes and supplies an abort signal', async () => {
    axios.get.mockResolvedValue({ data: parquet() });

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
    axios.get.mockResolvedValue({ data: parquet() });

    await fetchParquetBuffer(URL_);

    const [, config] = axios.get.mock.calls[0];
    expect(config.cache).toBeUndefined();
    expect(config.headers?.['Cache-Control']).toBeUndefined();
  });

  it('aborts when nothing arrives inside the first-byte window', () => {
    jest.useFakeTimers();
    const config = pending();
    fetchParquetBuffer(URL_, { firstByteMs: 1000, stallMs: 500 }).catch(() => {});

    expect(config().signal.aborted).toBe(false);
    jest.advanceTimersByTime(1001);
    expect(config().signal.aborted).toBe(true);
  });

  it('does not abort a slow download that keeps delivering', () => {
    jest.useFakeTimers();
    const config = pending();
    fetchParquetBuffer(URL_, { firstByteMs: 1000, stallMs: 1000 }).catch(() => {});

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
    fetchParquetBuffer(URL_, { firstByteMs: 5000, stallMs: 1000 }).catch(() => {});

    config().onDownloadProgress({ loaded: 1024 });
    jest.advanceTimersByTime(999);
    expect(config().signal.aborted).toBe(false);
    jest.advanceTimersByTime(2);
    expect(config().signal.aborted).toBe(true);
  });

  it('reports a stall as a timeout rather than as axios cancellation', async () => {
    // The name is the whole point: cacheFailureReason has a phrase for TimeoutError and none for
    // CanceledError, so letting axios's own type escape turns a stall into "Search unavailable".
    const cancelled = Object.assign(new Error('canceled'), { name: 'CanceledError' });
    axios.get.mockImplementation((_url, config) => {
      config.signal.dispatchEvent?.(new Event('abort'));
      Object.defineProperty(config.signal, 'aborted', { value: true, configurable: true });
      return Promise.reject(cancelled);
    });

    await expect(fetchParquetBuffer(URL_)).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('rejects an html error page served with a 200', async () => {
    // The realistic wrong body: a proxy or login page, arriving as an ArrayBuffer like any other.
    // An earlier version of this test used a string, which axios never returns for
    // responseType arraybuffer -- so it asserted a case that could not happen and let this one past.
    const html = Buffer.from('<!doctype html><title>Sign in</title>');
    axios.get.mockResolvedValue({ data: new Uint8Array(html).buffer });

    await expect(fetchParquetBuffer(URL_)).rejects.toMatchObject({ name: 'NotParquetError' });
  });

  it('rejects a truncated body that has only the opening magic', async () => {
    axios.get.mockResolvedValue({ data: new Uint8Array([...Buffer.from('PAR1'), 1, 2]).buffer });

    await expect(fetchParquetBuffer(URL_)).rejects.toMatchObject({ name: 'NotParquetError' });
  });

  it('rejects a body that is not bytes at all', async () => {
    axios.get.mockResolvedValue({ data: undefined });

    await expect(fetchParquetBuffer(URL_)).rejects.toThrow(/rather than bytes/);
  });
});

describe('failure classification', () => {
  it('treats a 404 and a non-parquet body alike, since both mean try the fallback', () => {
    expect(isMissing({ response: { status: 404 } })).toBe(true);
    expect(isMissing({ name: 'NotParquetError' })).toBe(true);
    expect(isMissing({ response: { status: 500 } })).toBe(false);
    expect(isMissing(new Error('offline'))).toBe(false);
  });

  it('recognises an aborted request', () => {
    expect(isStalled({ code: 'ERR_CANCELED' })).toBe(true);
    expect(isStalled({ name: 'CanceledError' })).toBe(true);
    expect(isStalled(new Error('boom'))).toBe(false);
  });
});
