/**
 * Two rules for one thing: tables are created with tableNameForKey, which strips the extension,
 * while six query functions split the key on its first dot. They agree on today's keys and part
 * company on any key holding another dot, which is the shape of the bug that once had
 * checkForTable answering false for every key it was given.
 */
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  getConnection: jest.fn(), getDuckDB: jest.fn(),
}));

const { getConnection } = require('features/DataStream/lib/duckdbClient');
const queryData = require('features/DataStream/lib/queryData');

const sql = [];
beforeEach(() => {
  sql.length = 0;
  getConnection.mockResolvedValue({
    query: jest.fn(async (text) => {
      sql.push(text);
      return { toArray: () => [{ cnt: 0, n: 0 }], getChild: () => ({ get: () => 0 }), numRows: 0 };
    }),
    send: jest.fn(async (text) => { sql.push(text); return (async function* () {})(); }),
    close: jest.fn(),
  });
});

const KEY = 'cfe_nom.v2_VPU_16_troute_output.parquet';

describe('the table a cache key names', () => {
  it.each([
    ['checkForTable', () => queryData.checkForTable(KEY)],
    ['getFeatureIDs', () => queryData.getFeatureIDs(KEY)],
    ['getDistinctFeatureIds', () => queryData.getDistinctFeatureIds(KEY)],
    ['getDistinctTimes', () => queryData.getDistinctTimes(KEY)],
    ['getVpuVariableFlat', () => queryData.getVpuVariableFlat(KEY, 'flow')],
  ])('%s strips the extension rather than cutting at the first dot', async (_name, call) => {
    await call();

    const asked = sql.join('\n');
    expect(asked).toContain('cfe_nom.v2_VPU_16_troute_output');
    expect(asked).not.toMatch(/["']cfe_nom["']/);
  });

  it('asks information_schema about the main schema, like the other probes here', async () => {
    await queryData.checkForTable(KEY);

    expect(sql.join('\n')).toMatch(/table_schema = 'main'/);
  });

  it('quotes a name containing a quote instead of ending the identifier early', async () => {
    await queryData.getFeatureIDs('od"d_VPU_16.parquet');

    expect(sql.join('\n')).toContain('"od""d_VPU_16"');
  });
});
