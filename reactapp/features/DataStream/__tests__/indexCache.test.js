/**
 * The id index was read over http on every page load: a 103 MB parquet holding 2.07 million
 * ids, measured at about 6.3 seconds each visit. It is cached in OPFS now, like the vpu tables,
 * which measured 5.8 seconds on a first visit and 1.9 on every one after it.
 */
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
const { getConnection } = require('features/DataStream/lib/duckdbClient');
const { loadIndexData } = require('features/DataStream/lib/queryData');

const URL_ = 'https://example.test/hydrofabric_index.parquet';

// The table-exists probe reads information_schema; everything else here is mocked away.
const connectionWhere = (tableExists) => ({
  query: jest.fn(async () => ({ toArray: () => [{ cnt: tableExists ? 1 : 0 }] })),
  close: jest.fn(async () => {}),
});

beforeEach(() => {
  opfs.statFromCache.mockReset();
  opfs.saveDataToCache.mockReset();
  opfs.createTableFromOPFS.mockReset();
  getConnection.mockReset();
});

describe('loadIndexData', () => {
  it('downloads once and builds the table from the cached copy', async () => {
    getConnection.mockResolvedValue(connectionWhere(false));
    opfs.statFromCache
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ safeName: 'index_data_table.parquet', sizeBytes: 103389785 });

    await loadIndexData({ remoteUrl: URL_ });

    expect(opfs.saveDataToCache).toHaveBeenCalledWith('index_data_table.parquet', URL_);
    expect(opfs.createTableFromOPFS).toHaveBeenCalledWith(expect.objectContaining({
      key: 'index_data_table.parquet',
      safeName: 'index_data_table.parquet',
    }));
  });

  it('does not download again when the file is already cached', async () => {
    getConnection.mockResolvedValue(connectionWhere(false));
    opfs.statFromCache.mockResolvedValue({ safeName: 'index_data_table.parquet', sizeBytes: 1 });

    await loadIndexData({ remoteUrl: URL_ });

    // This is the whole point: a second visit pays for the table build and nothing else.
    expect(opfs.saveDataToCache).not.toHaveBeenCalled();
    expect(opfs.createTableFromOPFS).toHaveBeenCalled();
  });

  it('does nothing at all once the table is in this session', async () => {
    getConnection.mockResolvedValue(connectionWhere(true));

    await loadIndexData({ remoteUrl: URL_ });

    expect(opfs.statFromCache).not.toHaveBeenCalled();
    expect(opfs.createTableFromOPFS).not.toHaveBeenCalled();
  });

  it('fails loudly when the download reports success but leaves nothing behind', async () => {
    getConnection.mockResolvedValue(connectionWhere(false));
    opfs.statFromCache.mockResolvedValue(null);

    await expect(loadIndexData({ remoteUrl: URL_ })).rejects.toThrow(/cannot stat/i);
  });

  it('keys the cache so the table keeps the name the search queries', async () => {
    getConnection.mockResolvedValue(connectionWhere(false));
    opfs.statFromCache.mockResolvedValue({ safeName: 'x', sizeBytes: 1 });

    await loadIndexData({ remoteUrl: URL_ });

    // createTableFromOPFS strips the extension, so index_data_table.parquet -> index_data_table.
    const { key } = opfs.createTableFromOPFS.mock.calls[0][0];
    expect(key.replace(/\.parquet$/, '')).toBe('index_data_table');
  });
});
