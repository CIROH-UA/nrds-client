/**
 * A duckdb worker that stops answering left the app loading for the life of the tab.
 *
 * The wedged-database fix catches a call that *rejects* -- a worker that failed to start. A
 * worker that is alive but stuck answers nothing at all: the promise never settles, so execution
 * never reaches the catch that reports, nor the finally that clears the spinner. That is the
 * shape the OPFS lock trouble takes, since a read blocked on another tab's handle is a wait, not
 * an error.
 *
 * The deadline sits on getting a connection rather than on each query. A connection is a round
 * trip to the worker and so the cheapest liveness question available; putting a ceiling on the
 * queries themselves would have to be loose enough for a CREATE TABLE over 2.07 million rows,
 * by which point it is no use to a point query that should take milliseconds.
 */
jest.mock('@duckdb/duckdb-wasm', () => ({
  getJsDelivrBundles: jest.fn(() => ({})),
  selectBundle: jest.fn(),
  ConsoleLogger: class {},
  AsyncDuckDB: class {
    async instantiate() {}
    async open() {}
    connect() { return global.__connect(); }
  },
  DuckDBAccessMode: { READ_WRITE: 1 },
}));

const duckdb = require('@duckdb/duckdb-wasm');
const { cacheFailureReason } = require('features/DataStream/lib/utils');

const load = () => {
  let mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    mod = require('features/DataStream/lib/duckdbClient');
  });
  return mod;
};

const flush = async () => { for (let i = 0; i < 50; i += 1) await Promise.resolve(); };

beforeEach(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:worker');
  global.URL.revokeObjectURL = jest.fn();
  global.Worker = class {};
  duckdb.getJsDelivrBundles.mockReturnValue({});
  duckdb.selectBundle.mockResolvedValue({ mainWorker: 'w.js', mainModule: 'm.wasm', pthreadWorker: null });
  global.__connect = () => Promise.resolve({ query: jest.fn(), close: jest.fn() });
});

afterEach(() => { jest.useRealTimers(); });

describe('getting a connection from a worker that has stopped answering', () => {
  it('gives up rather than waiting for the life of the tab', async () => {
    jest.useFakeTimers();
    global.__connect = () => new Promise(() => {}); // never settles, like a stuck worker
    const { getConnection } = load();

    const attempt = getConnection();
    await flush();
    jest.advanceTimersByTime(20_000);

    await expect(attempt).rejects.toMatchObject({ name: 'DatabaseTimeoutError' });
  });

  it('says the database stopped responding, not something about a download', async () => {
    // TimeoutError is already spoken for by a stalled download; these are different failures
    // and the reader is told which one happened.
    // Exact, not a regex that the default branch's "Name: message" would also satisfy.
    expect(cacheFailureReason({ name: 'DatabaseTimeoutError' }))
      .toBe('the database is not responding');
    expect(cacheFailureReason({ name: 'TimeoutError' }))
      .toBe('the download stopped');
  });

  it('does not give up on a worker that is merely busy', async () => {
    jest.useFakeTimers();
    let allow;
    global.__connect = () => new Promise((r) => { allow = () => r({ query: jest.fn(), close: jest.fn() }); });
    const { getConnection } = load();

    const attempt = getConnection();
    await flush();
    jest.advanceTimersByTime(19_000);
    allow();

    await expect(attempt).resolves.toBeDefined();
  });

  it('allows the wasm bundle far longer than a connection, since it is a download', async () => {
    jest.useFakeTimers();
    let arrive;
    duckdb.selectBundle.mockImplementation(() => new Promise((r) => {
      arrive = () => r({ mainWorker: 'w.js', mainModule: 'm.wasm', pthreadWorker: null });
    }));
    const { getConnection } = load();

    const attempt = getConnection();
    await flush();
    // Past the connection deadline but inside the one for fetching and instantiating wasm.
    jest.advanceTimersByTime(25_000);
    arrive();

    await expect(attempt).resolves.toBeDefined();
  });
});

describe('a connection that turns up after the deadline', () => {
  it('is closed rather than left open in the worker', async () => {
    jest.useFakeTimers();
    let handOver;
    const late = { query: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
    global.__connect = () => new Promise((resolve) => { handOver = () => resolve(late); });
    const { getConnection } = load();

    const attempt = getConnection();
    await flush();
    jest.advanceTimersByTime(20_000);
    await expect(attempt).rejects.toMatchObject({ name: 'DatabaseTimeoutError' });

    // The worker was merely slow: nothing can cancel the connect, so the arrival is cleaned up.
    handOver();
    await flush();
    expect(late.close).toHaveBeenCalled();
  });

  it('does not close a connection that arrived in time', async () => {
    const inTime = { query: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
    global.__connect = () => Promise.resolve(inTime);
    const { getConnection } = load();

    await expect(getConnection()).resolves.toBe(inTime);
    await flush();
    expect(inTime.close).not.toHaveBeenCalled();
  });
});
