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

// Two children at every level, because the date list is read at index 1. Dated names at the
// date level and plain ones elsewhere, matching the bucket: the app now decides what counts as
// a run by the ngen.YYYYMMDD shape, so a mock answering `aa` there would not exercise the rule.
// A date prefix is listed without a delimiter when probing for readable outputs, so it has to
// answer with keys rather than child directories -- the real bucket holds both.
const isDateProbe = (url) =>
  !new URL(url).searchParams.has('delimiter') && /ngen\.|\/(aa|bb|test)\/$/.test(requestedPrefix(url));

const isDateListing = (url) => requestedPrefix(url).endsWith('v2.2_hydrofabric/');

const respondWith = (dates = ['ngen.20260101', 'ngen.20260102'], { readable = true } = {}) =>
  jest.fn(async (url) => {
    const prefix = requestedPrefix(url);
    let body;
    if (prefix.includes('troute')) {
      body = fileXml(prefix, ['troute_output.parquet']);
    } else if (isDateProbe(url)) {
      body = fileXml(prefix, [
        `f/c/VPU_16/ngen-run/outputs/troute/troute_output.${readable ? 'parquet' : 'nc'}`,
      ]);
    } else if (isDateListing(url)) {
      body = directoryXml(prefix, dates);
    } else {
      body = directoryXml(prefix, ['aa', 'bb']);
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

    /**
     * Five listings plus the probing, counted rather than waved at: all of it is paid once, a
     * vpu change must pay none of it, and the count is what caught two requests being made
     * twice over.
     *
     * models(1) + per model a date listing and a probe to decide it is offerable at all, two
     * models so 4, + the chosen model's date list, whose listing and whose newest-date probe
     * are both already known from that check and so cost nothing, + the oldest-date probe(1),
     * with both ends readable so the binary search never runs, + forecasts(1) + cycles(1) +
     * outputFiles(1) = 9.
     */
    expect(global.fetch).toHaveBeenCalledTimes(9);
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

  /**
   * A model that stopped publishing before the format changed dead-ends on an empty date list,
   * which reads as a broken app rather than as an archived model. This needs a readable model
   * alongside it: if nothing at all were readable the list would come back untouched, on the
   * grounds that an empty model control is worse than an imperfect one.
   */
  it('drops a model whose recent runs are all unreadable, keeping the others', async () => {
    global.fetch = jest.fn(async (url) => {
      const prefix = requestedPrefix(url);
      const ok = (body) => ({ ok: true, status: 200, statusText: 'OK', text: async () => body });
      if (prefix === 'outputs/') return ok(directoryXml(prefix, ['live', 'retired']));
      if (prefix.includes('troute')) return ok(fileXml(prefix, ['troute_output.parquet']));
      if (isDateProbe(url)) {
        const ext = prefix.includes('/retired/') ? 'nc' : 'parquet';
        return ok(fileXml(prefix, [`f/c/VPU_16/ngen-run/outputs/troute/troute_output.${ext}`]));
      }
      return ok(directoryXml(prefix, ['ngen.20260101', 'ngen.20260102']));
    });
    const { initialS3Data } = loadModule();

    const result = await initialS3Data('16');

    expect(result.models.map((m) => m.value)).toEqual(['live']);
  });

  /**
   * Publishing is not atomic: a model's newest prefix appears in S3 before its troute output
   * does, so for part of every day the newest run of a healthy model reads as unreadable. One
   * failed run at the troute step looks identical. Judging on that run alone dropped the model
   * from the control until the next good run landed. As with the sibling case above, this needs
   * a genuinely dead model alongside it -- were nothing readable the list would come back
   * untouched and the assertion would pass against the very bug it is meant to catch.
   */
  it('keeps a model whose newest run has not finished publishing', async () => {
    global.fetch = jest.fn(async (url) => {
      const prefix = requestedPrefix(url);
      const ok = (body) => ({ ok: true, status: 200, statusText: 'OK', text: async () => body });
      if (prefix === 'outputs/') return ok(directoryXml(prefix, ['publishing', 'retired']));
      if (prefix.includes('troute')) return ok(fileXml(prefix, ['troute_output.parquet']));
      if (isDateProbe(url)) {
        // publishing/ has today's prefix up but no troute output in it yet; retired/ has none anywhere.
        const empty = prefix.includes('/retired/') || prefix.includes('ngen.20260103');
        return ok(fileXml(prefix, empty ? [] : ['f/c/VPU_16/ngen-run/outputs/troute/o.parquet']));
      }
      const children = isDateListing(url)
        ? ['ngen.20260101', 'ngen.20260102', 'ngen.20260103']
        : ['aa', 'bb'];
      return ok(directoryXml(prefix, children));
    });
    const { initialS3Data } = loadModule();

    const result = await initialS3Data('16');

    expect(result.models.map((m) => m.value)).toEqual(['publishing']);
  });

  it('offers dates newest first', async () => {
    global.fetch = respondWith(['ngen.20260101', 'ngen.20260820']);
    const { initialS3Data } = loadModule();

    const result = await initialS3Data('16');

    // S3 answers oldest first, and a reader opening this control wants the latest run at the top.
    expect(result.dates.map((d) => d.value)).toEqual(['ngen.20260820', 'ngen.20260101']);
  });

  it('ignores a child of the model directory that is not a dated run', async () => {
    // routing_only carries `test` and `retro-test` alongside its runs, and those sort after every
    // real date -- exactly where the newest run is looked for. Taken as the newest run, `test`
    // holds no parquet, so the model was dropped from the control on the strength of a directory
    // nobody meant to publish, and it would have led the date list had it survived.
    global.fetch = respondWith(['ngen.20260101', 'ngen.20260102', 'test']);
    const { initialS3Data } = loadModule();

    const result = await initialS3Data('16');

    expect(result.models.map((m) => m.value)).toEqual(['aa', 'bb']);
    expect(result.dates.map((d) => d.value)).toEqual(['ngen.20260102', 'ngen.20260101']);
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
      const children = isDateListing(url) ? ['ngen.20260101', 'ngen.20260102'] : ['aa', 'bb'];
      return { ok: true, status: 200, statusText: 'OK', text: async () => directoryXml(prefix, children) };
    });
    const { initialS3Data } = loadModule();

    const result = await initialS3Data('16');

    expect(result.dates.map((d) => d.value)).toEqual(['ngen.20260102', 'ngen.20260101']);
  });

  /**
   * Going back to a model already looked at is ordinary, and the answer costs a listing plus
   * two to eleven probes. Held for the life of the page, like the base listings above.
   */
  it('does not re-probe a model whose dates it has already read', async () => {
    global.fetch = respondWith();
    const { readableDatesNewestFirst } = loadModule();

    const first = await readableDatesNewestFirst('aa');
    const callsAfterFirst = global.fetch.mock.calls.length;
    const second = await readableDatesNewestFirst('aa');

    expect(global.fetch).toHaveBeenCalledTimes(callsAfterFirst);
    expect(second).toBe(first);
  });

  /**
   * A listing that failed and a listing that came back empty used to be the same value, so a
   * network blip while reading a model's runs took that model out of the interface for the rest
   * of the session -- silently, and exactly the failure this filter exists to prevent. The
   * listing now says which of the two happened, and only the second is grounds for dropping.
   */
  it('keeps a model whose run listing could not be read, and does not remember the failure', async () => {
    let listings = 0;
    global.fetch = jest.fn(async (url) => {
      const prefix = requestedPrefix(url);
      const ok = (body) => ({ ok: true, status: 200, statusText: 'OK', text: async () => body });
      if (prefix === 'outputs/') return ok(directoryXml(prefix, ['aa', 'bb']));
      if (prefix.includes('troute')) return ok(fileXml(prefix, ['troute_output.parquet']));
      if (isDateProbe(url)) {
        return ok(fileXml(prefix, ['f/c/VPU_16/ngen-run/outputs/troute/o.parquet']));
      }
      if (isDateListing(url) && prefix.includes('/aa/')) {
        listings += 1;
        // Fails the first time only, so the retry can be seen to happen.
        if (listings === 1) return { ok: false, status: 503, statusText: 'Slow Down', text: async () => '' };
      }
      return ok(directoryXml(prefix, ['ngen.20260101', 'ngen.20260102']));
    });
    const { initialS3Data, readableDatesNewestFirst } = loadModule();

    const result = await initialS3Data('16');

    expect(result.models.map((m) => m.value)).toEqual(['aa', 'bb']);
    // Not remembered, so the model recovers on its own rather than staying broken all session.
    expect((await readableDatesNewestFirst('aa')).map((d) => d.value))
      .toEqual(['ngen.20260102', 'ngen.20260101']);
  });

  it('remembers a model that genuinely has no dated runs', async () => {
    // The bucket answered, and the answer was "nothing here". That is a fact, not a bad moment.
    global.fetch = jest.fn(async (url) => ({
      ok: true, status: 200, statusText: 'OK',
      text: async () => directoryXml(requestedPrefix(url), []),
    }));
    const { readableDatesNewestFirst } = loadModule();

    expect(await readableDatesNewestFirst('aa')).toEqual([]);
    const callsAfterFirst = global.fetch.mock.calls.length;
    await readableDatesNewestFirst('aa');

    expect(global.fetch.mock.calls.length).toBe(callsAfterFirst);
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
