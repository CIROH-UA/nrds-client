/**
 * A browser exception was printed into the header.
 *
 * The default branch interpolated err.message, so a reader was shown two hundred characters
 * naming a web api and a cache path in a header pill, wide enough to push the retry button off
 * the screen. The point of this function is to say which of a handful of conditions happened;
 * anything it cannot place is a console matter, and the raw error is already logged there.
 *
 * The conditions themselves changed when the cache went. There is no storage to be blocked, full
 * or held by another tab any more, so those cases are gone with the layer that produced them.
 * What a fetch can do instead is stall, answer 404, hand back something that is not a parquet, or
 * fail before it starts -- and the first two arrive shaped by axios rather than by the browser,
 * which is why they are asked through the same predicates the fetch itself decides with.
 */
const { cacheFailureReason } = require('features/DataStream/lib/utils');

// A phrase, not a sentence: this is read in a pill beside a button.
const LONGEST_SENSIBLE = 32;

describe('what the reader is told', () => {
  it('never repeats a browser message, however it arrives', () => {
    const raw = 'NetworkError when attempting to fetch resource. '
      + 'https://example.test/static/nrds/data/hydrofabric_index_slim.parquet';

    const said = cacheFailureReason(Object.assign(new Error(raw), { name: 'TypeError' }));

    expect(said).not.toContain('hydrofabric_index_slim');
    expect(said).not.toContain('http');
    expect(said.length).toBeLessThanOrEqual(LONGEST_SENSIBLE);
  });

  it('places a stall however axios names it', () => {
    // The reason this is asked through isStalled rather than by name: axios raises CanceledError,
    // which no name-based case matched, so every stall fell through to the null default and the
    // reader was told only "Search unavailable".
    for (const err of [
      { name: 'CanceledError' },
      { code: 'ERR_CANCELED' },
      { name: 'AbortError' },
      Object.assign(new Error('x'), { name: 'TimeoutError' }),
    ]) {
      expect(cacheFailureReason(err)).toMatch(/download stopped/i);
    }
  });

  it('places a missing artifact, whether it 404s or answers with the wrong thing', () => {
    expect(cacheFailureReason({ response: { status: 404 } })).toMatch(/not there/i);
    expect(cacheFailureReason({ name: 'NotParquetError' })).toMatch(/not there/i);
  });

  it.each([
    ['DatabaseTimeoutError', /database is not responding/i],
    ['TypeError', /could not fetch it/i],
  ])('still places %s by name', (name, shown) => {
    expect(cacheFailureReason(Object.assign(new Error('x'), { name }))).toMatch(shown);
  });

  it('keeps every phrase short enough for the pill', () => {
    const every = [
      { name: 'CanceledError' },
      { response: { status: 404 } },
      { name: 'NotParquetError' },
      Object.assign(new Error('x'), { name: 'TimeoutError' }),
      Object.assign(new Error('x'), { name: 'DatabaseTimeoutError' }),
      Object.assign(new Error('x'), { name: 'TypeError' }),
    ];
    for (const err of every) {
      expect(cacheFailureReason(err).length).toBeLessThanOrEqual(LONGEST_SENSIBLE);
    }
  });

  it('says nothing at all for anything it cannot place', () => {
    // Rather than a phrase: the caller has a better sentence, and "see the console" was being
    // shown to readers as though it were a reason.
    expect(cacheFailureReason(Object.assign(new Error('something new'), { name: 'WeirdError' })))
      .toBe(null);
    expect(cacheFailureReason({ response: { status: 500 } })).toBe(null);
  });

  it('copes with being handed nothing', () => {
    expect(cacheFailureReason(undefined)).toBe(null);
    expect(cacheFailureReason(null)).toBe(null);
  });
});
