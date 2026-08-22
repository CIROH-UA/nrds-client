/**
 * Only the outputFiles listing depends on the vpu, but the effect that calls initialS3Data
 * re-runs on every vpu change, so it used to refetch all five listings each time. These
 * tests hold it to one request per subsequent vpu, and check that an incomplete listing is
 * not remembered.
 *
 * The first call also probes dates for readable outputs, which costs listings of its own. Those
 * are counted here on purpose: the whole point of caching the base is that a vpu change pays
 * none of it, and a probe that leaked into every call would be the most expensive regression
 * this file could miss.
 */
const requestedPrefix = (url) => decodeURIComponent(new URL(url).searchParams.get('prefix'));

const directoryXml = (prefix, children) => `<?xml version="1.0"?>
<ListBucketResult>${children
  .map((c) => `<CommonPrefixes><Prefix>${prefix}${c}/</Prefix></CommonPrefixes>`)
  .join('')}</ListBucketResult>`;

const fileXml = (prefix, keys) => `<?xml version="1.0"?>
<ListBucketResult>${keys
  .map((k) => `<Contents><Key>${prefix}${k}</Key></Contents>`)
  .join('')}</ListBucketResult>`;

// Two children at every level, because the date list is read at index 1.
// A date prefix is listed without a delimiter when probing for readable outputs, so it has to
// answer with keys rather than child directories -- the real bucket holds both.
const isDateProbe = (url) =>
  !new URL(url).searchParams.has('delimiter') && /ngen\.|\/(aa|bb)\/$/.test(requestedPrefix(url));

const respondWith = (children = ['aa', 'bb'], { readable = true } = {}) =>
  jest.fn(async (url) => {
    const prefix = requestedPrefix(url);
    let body;
    if (prefix.includes('troute')) {
      body = fileXml(prefix, ['troute_output.parquet']);
    } else if (isDateProbe(url)) {
      body = fileXml(prefix, [
        `f/c/VPU_16/ngen-run/outputs/troute/troute_output.${readable ? 'parquet' : 'nc'}`,
      ]);
    } else {
      body = directoryXml(prefix, children);
    }
    return { ok: true, status: 200, statusText: 'OK', text: async () => body };
  });

const loadModule = () => {
  let mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    mod = require('features/DataStream/lib/s3Utils');
  });
  return mod;
};

describe('initialS3Data', () => {
  it('fetches every listing on the first call', async () => {
    global.fetch = respondWith();
    const { initialS3Data } = loadModule();

    const result = await initialS3Data('16');

    // Five listings, plus the two date probes: with both ends readable the whole list is kept
    // and the binary search never runs.
    expect(global.fetch).toHaveBeenCalledTimes(7);
    expect(result.models.map((m) => m.value)).toEqual(['aa', 'bb']);
    expect(result.outputFiles.map((f) => f.value)).toEqual(['troute_output.parquet']);
  });

  it('refetches only the vpu-dependent listing on a later vpu', async () => {
    global.fetch = respondWith();
    const { initialS3Data } = loadModule();

    await initialS3Data('16');
    global.fetch.mockClear();

    const result = await initialS3Data('01');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(requestedPrefix(global.fetch.mock.calls[0][0])).toContain('/01/');
    // The reused listings are still reported to the caller.
    expect(result.models.map((m) => m.value)).toEqual(['aa', 'bb']);
    expect(result.cycles.length).toBe(2);
  });

  it('offers dates newest first', async () => {
    global.fetch = respondWith(['ngen.20260101', 'ngen.20260820']);
    const { initialS3Data } = loadModule();

    const result = await initialS3Data('16');

    // S3 answers oldest first, and a reader opening this control wants the latest run at the top.
    expect(result.dates.map((d) => d.value)).toEqual(['ngen.20260820', 'ngen.20260101']);
  });

  it('offers no dates for a model whose runs are all unreadable', async () => {
    // A model that stopped publishing before the pipeline moved to parquet. Every date would open
    // onto an empty output list, so inviting the click helps nobody.
    global.fetch = respondWith(['ngen.20260101', 'ngen.20260102'], { readable: false });
    const { initialS3Data } = loadModule();

    const result = await initialS3Data('16');

    expect(result.dates).toEqual([]);
  });

  it('keeps every date when a probe cannot answer', async () => {
    // Offering a date that turns out empty costs one click. Hiding one that would have worked is
    // silent, so an unreadable probe leaves the list alone.
    global.fetch = jest.fn(async (url) => {
      const prefix = requestedPrefix(url);
      if (prefix.includes('troute')) {
        return { ok: true, status: 200, statusText: 'OK', text: async () => fileXml(prefix, ['x.parquet']) };
      }
      if (isDateProbe(url)) return { ok: false, status: 500, statusText: 'Server Error', text: async () => '' };
      return { ok: true, status: 200, statusText: 'OK', text: async () => directoryXml(prefix, ['aa', 'bb']) };
    });
    const { initialS3Data } = loadModule();

    const result = await initialS3Data('16');

    expect(result.dates.map((d) => d.value)).toEqual(['bb', 'aa']);
  });

  it('does not remember an incomplete listing', async () => {
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => directoryXml(requestedPrefix(url), []),
    }));
    const { initialS3Data } = loadModule();

    const first = await initialS3Data('16');
    expect(first.models).toEqual([]);
    const callsAfterFirst = global.fetch.mock.calls.length;

    // An empty bucket listing is a transient condition, so it must be retried, not cached.
    await initialS3Data('16');
    expect(global.fetch.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('caches the base listings even when first called without a vpu', async () => {
    global.fetch = respondWith();
    const { initialS3Data } = loadModule();
    await initialS3Data(null);

    global.fetch.mockClear();
    const result = await initialS3Data('16');

    // The base was complete, so only the vpu listing is needed.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.outputFiles.length).toBe(1);
  });
});
