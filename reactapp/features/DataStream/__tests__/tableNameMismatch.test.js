/**
 * checkForTable was handed the cache key with its file extension still attached, while tables
 * are created with the extension stripped, so it answered false for every parquet key it was
 * ever asked about.
 *
 * That made loadVpu believe the table was missing on every single call. It re-ran the whole
 * load, and because loadVpuData finds the file already in OPFS it appended another row to
 * "Files Loaded" each time, which is why the panel filled with identical 6.2 MB entries. The
 * table itself was never rebuilt: createTableFromOPFS checks the name it actually used and
 * skipped. Nothing was re-downloaded either, but the wasted work was real, and once a series
 * load consulted the same function it happened on every catchment click.
 */
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  getConnection: jest.fn(),
  getDuckDB: jest.fn(),
}));

const { getConnection } = require('features/DataStream/lib/duckdbClient');
const { checkForTable } = require('features/DataStream/lib/queryData');

const KEY = 'cfe_nom_ngen_20260819_medium_range_00_VPU_16_troute_output_202608190100.parquet';
const TABLE = KEY.replace('.parquet', '');

// The name duckdb holds. Any query for something else must come back with a count of zero.
const connectionHolding = (existingTable) => {
  const queries = [];
  return {
    queries,
    conn: {
      query: jest.fn(async (sql) => {
        queries.push(sql);
        const asked = sql.match(/table_name = '([^']*)'/)?.[1];
        const cnt = asked === existingTable ? 1 : 0;
        return { toArray: () => [{ cnt }] };
      }),
      close: jest.fn(),
    },
  };
};

describe('checkForTable', () => {
  test('finds the table duckdb actually created, extension stripped', async () => {
    const { conn } = connectionHolding(TABLE);
    getConnection.mockResolvedValue(conn);

    await expect(checkForTable(KEY)).resolves.toBe(true);
  });

  test('asks for the stripped name, not the cache key', async () => {
    const { conn, queries } = connectionHolding(TABLE);
    getConnection.mockResolvedValue(conn);

    await checkForTable(KEY);

    expect(queries[0]).toContain(`table_name = '${TABLE}'`);
    expect(queries[0]).not.toContain('.parquet');
  });

  test('still answers false when the table is genuinely absent', async () => {
    const { conn } = connectionHolding('some_other_table');
    getConnection.mockResolvedValue(conn);

    await expect(checkForTable(KEY)).resolves.toBe(false);
  });

});


