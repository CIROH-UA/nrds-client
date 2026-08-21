/**
 * The id index no longer goes through OPFS.
 *
 * It used to: 103 MB and 2.07 million ids, cached so the cost was once per browser rather than
 * once per visit. That cache is what made a FileSystemSyncAccessHandle -- exclusive for the
 * origin, not for the tab -- the app's biggest source of failure, because a second tab could not
 * open the file the first one held and got no search index and no data at all.
 *
 * The artifact this app serves is ten columns instead of 37, about 45 MiB, and comes from our own
 * static files, so ordinary HTTP caching replaces the layer entirely. What is left is: fetch the
 * bytes, register them in duckdb long enough for CREATE TABLE to copy the rows out, drop them.
 */
jest.mock('features/DataStream/lib/fetchParquet', () => ({
  fetchParquetBuffer: jest.fn(),
  isMissing: (err) => err?.response?.status === 404,
}));
jest.mock('features/DataStream/lib/opfsCache', () => ({
  statFromCache: jest.fn(),
  saveDataToCache: jest.fn(),
  createTableFromOPFS: jest.fn(),
  formatBytes: jest.fn((n) => `${n} B`),
  // Mirrors the real helper: the index table is named by the same rule as every other table.
  tableNameForKey: (key) => String(key).replace(/\.(arrow|parquet)$/i, ''),
}));
jest.mock('features/DataStream/lib/duckdbClient', () => ({ getConnection: jest.fn() }));

const opfs = require('features/DataStream/lib/opfsCache');
const { fetchParquetBuffer } = require('features/DataStream/lib/fetchParquet');
const { getConnection } = require('features/DataStream/lib/duckdbClient');
const { loadIndexData } = require('features/DataStream/lib/queryData');

const STATIC_URL = '/static/nrds/data/hydrofabric_index_slim.parquet';
const UPSTREAM_URL = 'https://example.test/map/hydrofabric_index.parquet';
const BYTES = new Uint8Array([1, 2, 3, 4]);

const notFound = () => Object.assign(new Error('Request failed with status code 404'), {
  response: { status: 404 },
});

const connectionWhere = (tableExists) => ({
  query: jest.fn(async () => ({ toArray: () => [{ cnt: tableExists ? 1 : 0 }] })),
  close: jest.fn(async () => {}),
  bindings: { registerFileBuffer: jest.fn(async () => {}), dropFile: jest.fn(async () => {}) },
});

beforeEach(() => {
  opfs.statFromCache.mockReset();
  opfs.saveDataToCache.mockReset();
  opfs.createTableFromOPFS.mockReset();
  fetchParquetBuffer.mockReset();
  getConnection.mockReset();
});

describe('loadIndexData', () => {
  it('fetches the artifact and builds the table from the buffer', async () => {
    const conn = connectionWhere(false);
    getConnection.mockResolvedValue(conn);
    fetchParquetBuffer.mockResolvedValue(BYTES);

    await loadIndexData({ remoteUrl: STATIC_URL, fallbackUrl: UPSTREAM_URL });

    expect(fetchParquetBuffer).toHaveBeenCalledWith(STATIC_URL);
    expect(conn.bindings.registerFileBuffer).toHaveBeenCalledWith(expect.any(String), BYTES);
    const created = conn.query.mock.calls.map(([sql]) => sql).join('\n');
    expect(created).toMatch(/CREATE TABLE "index_data_table" AS/);
    expect(created).toMatch(/read_parquet/);
  });

  it('drops the registered buffer once the table is built', async () => {
    const conn = connectionWhere(false);
    getConnection.mockResolvedValue(conn);
    fetchParquetBuffer.mockResolvedValue(BYTES);

    await loadIndexData({ remoteUrl: STATIC_URL });

    const [registered] = conn.bindings.registerFileBuffer.mock.calls[0];
    expect(conn.bindings.dropFile).toHaveBeenCalledWith(registered);
  });

  it('drops the registered buffer even when CREATE TABLE throws', async () => {
    const conn = connectionWhere(false);
    // The exists probe answers, then the CREATE TABLE fails: a file duckdb cannot parse must not
    // stay registered with no table to show for it.
    conn.query
      .mockImplementationOnce(async () => ({ toArray: () => [{ cnt: 0 }] }))
      .mockImplementationOnce(async () => {
        throw new Error('Invalid Input Error: not a parquet file');
      });
    getConnection.mockResolvedValue(conn);
    fetchParquetBuffer.mockResolvedValue(BYTES);

    await expect(loadIndexData({ remoteUrl: STATIC_URL })).rejects.toThrow(/parquet/);
    expect(conn.bindings.dropFile).toHaveBeenCalled();
  });

  it('does not fetch again when the table is already there', async () => {
    getConnection.mockResolvedValue(connectionWhere(true));

    await loadIndexData({ remoteUrl: STATIC_URL });

    expect(fetchParquetBuffer).not.toHaveBeenCalled();
  });

  it('touches no OPFS api at all', async () => {
    getConnection.mockResolvedValue(connectionWhere(false));
    fetchParquetBuffer.mockResolvedValue(BYTES);

    await loadIndexData({ remoteUrl: STATIC_URL });

    expect(opfs.statFromCache).not.toHaveBeenCalled();
    expect(opfs.saveDataToCache).not.toHaveBeenCalled();
    expect(opfs.createTableFromOPFS).not.toHaveBeenCalled();
  });

  it('falls back to the upstream index when the static artifact is absent', async () => {
    getConnection.mockResolvedValue(connectionWhere(false));
    fetchParquetBuffer
      .mockRejectedValueOnce(notFound())
      .mockResolvedValueOnce(BYTES);

    await loadIndexData({ remoteUrl: STATIC_URL, fallbackUrl: UPSTREAM_URL });

    expect(fetchParquetBuffer).toHaveBeenNthCalledWith(1, STATIC_URL);
    expect(fetchParquetBuffer).toHaveBeenNthCalledWith(2, UPSTREAM_URL);
  });

  it('reports the failure when there is no fallback to try', async () => {
    getConnection.mockResolvedValue(connectionWhere(false));
    fetchParquetBuffer.mockRejectedValue(notFound());

    await expect(loadIndexData({ remoteUrl: STATIC_URL })).rejects.toMatchObject({
      response: { status: 404 },
    });
    expect(fetchParquetBuffer).toHaveBeenCalledTimes(1);
  });

  it('does not fall back on a failure that is not a missing file', async () => {
    getConnection.mockResolvedValue(connectionWhere(false));
    fetchParquetBuffer.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500 } })
    );

    await expect(
      loadIndexData({ remoteUrl: STATIC_URL, fallbackUrl: UPSTREAM_URL })
    ).rejects.toThrow('boom');
    expect(fetchParquetBuffer).toHaveBeenCalledTimes(1);
  });
});
