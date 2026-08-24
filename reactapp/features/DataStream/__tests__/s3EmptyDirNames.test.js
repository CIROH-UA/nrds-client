import { listPublicS3Directories, getOptionsFromURL } from 'features/DataStream/lib/s3Utils';

/**
 * S3 answers some prefixes with a doubled slash, which is an object filed under a directory
 * with no name. This is the real response for
 * outputs/routing_only/v2.2_hydrofabric/ngen.20251205/, measured against the live bucket: it
 * lists one empty name and one real one. The empty name became {value: '', label: ''}, sorted
 * ahead of MEDIUM_RANGE, and was selected by default, which is what blanked the Forecast
 * control and put a doubled slash into every URL built from it.
 */
const BASE = 'outputs/routing_only/v2.2_hydrofabric/ngen.20251205/';

const listing = (names) => `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>${names
  .map((n) => `<CommonPrefixes><Prefix>${BASE}${n}/</Prefix></CommonPrefixes>`)
  .join('')}</ListBucketResult>`;

const respondWith = (xml) => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => xml });
};

describe('S3 directory listings', () => {
  afterEach(() => { delete global.fetch; });

  test('drops the empty name S3 reports as a doubled slash', async () => {
    respondWith(listing(['', 'MEDIUM_RANGE']));
    const { childNames } = await listPublicS3Directories(BASE);
    expect(childNames).toEqual(['MEDIUM_RANGE']);
  });

  test('the first option is the real forecast, not a blank one', async () => {
    respondWith(listing(['', 'MEDIUM_RANGE']));
    const options = await getOptionsFromURL(BASE);
    expect(options[0]).toEqual({ value: 'MEDIUM_RANGE', label: 'MEDIUM_RANGE' });
  });

  test('options are ordered by value rather than left as the listing returned them', async () => {
    respondWith(listing(['short_range', 'analysis_assim', 'medium_range']));
    const options = await getOptionsFromURL(BASE);
    expect(options.map((o) => o.value)).toEqual([
      'analysis_assim',
      'medium_range',
      'short_range',
    ]);
  });

  test('a listing of nothing but empty names yields no options at all', async () => {
    respondWith(listing(['']));
    const options = await getOptionsFromURL(BASE);
    expect(options).toEqual([]);
  });
});
