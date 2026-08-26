/**
 * The search box could not be typed in and threw on every keystroke.
 *
 * Its value came from the store's feature_id, which only changes for a complete id in the
 * loaded vpu, so keystrokes were discarded. Each one also queried the id index, which takes
 * about seven seconds to build on mount, so anything typed before then raised a duckdb catalog
 * error with no catch to absorb it.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useFeatureStore } from 'features/DataStream/store/Layers';

jest.mock('features/DataStream/lib/queryData', () => ({
  // loadTimeseries checks the table is still registered before querying it.
  checkForTable: jest.fn(),
  loadIndexData: jest.fn(),
  getFeatureProperties: jest.fn(),
}));
jest.mock('features/DataStream/actions/loadTimeseries', () => ({ loadTimeseries: jest.fn() }));

const queryData = require('features/DataStream/lib/queryData');
const { loadTimeseries } = require('features/DataStream/actions/loadTimeseries');
const SearchBar = require('features/DataStream/components/map/SearchBar').default;

const initial = {
  ts: useTimeSeriesStore.getState(),
  ds: useDataStreamStore.getState(),
  fs: useFeatureStore.getState(),
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useDataStreamStore.setState(initial.ds, true);
  useFeatureStore.setState(initial.fs, true);
  queryData.loadIndexData.mockResolvedValue(undefined);
  queryData.checkForTable.mockResolvedValue(true);
  queryData.getFeatureProperties.mockResolvedValue([{ id: 'cat-1', vpuid: '01' }]);
  loadTimeseries.mockResolvedValue(undefined);
});

const box = () => screen.getByRole('textbox');
const button = () => screen.getByRole('button', { name: /search/i });
// fireEvent.change, not a raw value assignment: React tracks its own value and would ignore
// the latter, leaving the component's state empty while the DOM looked right.
const type = (text) => fireEvent.change(box(), { target: { value: text } });

const ready = async () => {
  render(<SearchBar />);
  await waitFor(() => expect(box()).not.toBeDisabled());
};

describe('the search box', () => {
  it('keeps what is typed into it', async () => {
    await ready();

    type('cat-123');

    // Its value used to come from the store, so every keystroke was thrown away.
    expect(box()).toHaveValue('cat-123');
  });

  it('does not query while typing', async () => {
    await ready();

    type('cat-1');

    expect(queryData.getFeatureProperties).not.toHaveBeenCalled();
  });

  it('searches once, on submit', async () => {
    await ready();
    type('cat-1');

    await act(async () => { button().click(); });

    expect(queryData.getFeatureProperties).toHaveBeenCalledTimes(1);
    expect(queryData.getFeatureProperties).toHaveBeenCalledWith({
      // Candidates, not one id: a bare number names a catchment, a flowpath and a nexus.
      cacheKey: 'index_data_table', feature_id: ['cat-1'],
    });
    expect(useFeatureStore.getState().selected_feature).toMatchObject({ _id: 'cat-1' });
  });

  it('charts the hit when it is in the loaded vpu', async () => {
    useDataStreamStore.setState({ vpu: 'VPU_01' });
    await ready();
    type('cat-1');

    await act(async () => { button().click(); });

    expect(loadTimeseries).toHaveBeenCalledWith({ featureId: 'cat-1' });
  });

  it('says so when the id is not in the index', async () => {
    queryData.getFeatureProperties.mockResolvedValue([]);
    await ready();
    type('cat-nope');

    await act(async () => { button().click(); });

    // Asserted on the store, not the placeholder: the box still holds the id that was
    // searched for, so a placeholder is never painted and the miss was invisible.
    expect(useTimeSeriesStore.getState().loadingText).toMatch(/No feature found with id/i);
    expect(useTimeSeriesStore.getState().last_error).toMatchObject({ kind: 'search-miss' });
    expect(useFeatureStore.getState().selected_feature).toBe(null);
  });

  it('reports a failed search instead of throwing into the console', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.getFeatureProperties.mockRejectedValue(new Error('Catalog Error'));
    await ready();
    type('cat-1');

    await act(async () => { button().click(); });

    expect(useTimeSeriesStore.getState().loadingText).toMatch(/Search failed for cat-1/);
    expect(useTimeSeriesStore.getState().last_error).toEqual({ kind: 'search', featureId: 'cat-1' });
    consoleError.mockRestore();
  });

  it('is disabled while the index builds, and the header says why', async () => {
    // 2.07 million rows out of a 103 MB parquet: about seven seconds where the box must not
    // invite a search it cannot answer.
    let release;
    queryData.loadIndexData.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    render(<SearchBar />);

    expect(box()).toBeDisabled();
    expect(box()).toHaveAttribute('aria-busy', 'true');
    // The status strip says the words; printing them here as well put the same sentence twice
    // in one header, so the control only reports that it is busy.
    expect(box()).toHaveAttribute('placeholder', 'Search for an id');
    expect(useDataStreamStore.getState().index_status).toBe('loading');

    await act(async () => { release(); });
    await waitFor(() => expect(box()).toBeEnabled());
    expect(useDataStreamStore.getState().index_status).toBe('ready');
  });

  it('loads the index from the store url, with the upstream file as the fallback', async () => {
    // Proved missing by mutation: deleting fallbackUrl from the call left all 20 tests green,
    // because this file mocks loadIndexData and never asserted its arguments.
    useDataStreamStore.setState({
      hydrofabric_index: '/static/nrds/data/slim.parquet',
      hydrofabric_index_fallback: 'https://upstream.test/full.parquet',
    });
    queryData.loadIndexData.mockResolvedValue(undefined);

    render(<SearchBar />);

    await waitFor(() =>
      expect(queryData.loadIndexData).toHaveBeenCalledWith({
        remoteUrl: '/static/nrds/data/slim.parquet',
        fallbackUrl: 'https://upstream.test/full.parquet',
      })
    );
  });

  it('replaces the box with the reason when the index cannot be built', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.loadIndexData.mockRejectedValue(new Error('404'));

    render(<SearchBar />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/search unavailable/i);

    // A control that can never work is worse than none: it invites typing and swallows it.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(useDataStreamStore.getState().index_status).toBe('failed');
    consoleError.mockRestore();
  });

  it.each([
    ['TimeoutError', /download stopped/i],
    ['NotParquetError', /not there/i],
    ['DatabaseTimeoutError', /database is not responding/i],
  ])('names %s so the reader is not left guessing', async (name, shown) => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Each of these has a different remedy, and the only place they used to appear was a
    // console error behind a level filter.
    queryData.loadIndexData.mockRejectedValue(Object.assign(new Error('nope'), { name }));

    render(<SearchBar />);

    // The store change and the reason land in separate renders, so the notice appears first.
    const notice = await screen.findByRole('alert');
    await waitFor(() => expect(notice).toHaveTextContent(shown));
    consoleError.mockRestore();
  });

  it('does not keep claiming to be building the index after it has given up', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.loadIndexData.mockRejectedValue(new Error('404'));

    render(<SearchBar />);
    await screen.findByRole('alert');

    // The old box sat disabled saying "Building the id index" for the rest of the session.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(useDataStreamStore.getState().index_status).not.toBe('loading');
    consoleError.mockRestore();
  });

  it('the failure survives a later load writing its own status', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.loadIndexData.mockRejectedValue(new Error('404'));
    render(<SearchBar />);
    await screen.findByRole('alert');

    // This is what erased the one explanation the reader used to get.
    act(() => { useTimeSeriesStore.setState({ loadingText: 'Loading VPU_16', last_error: null }); });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('can be retried without reloading the page', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryData.loadIndexData.mockRejectedValue(new Error('404'));
    render(<SearchBar />);
    await screen.findByRole('alert');

    // The usual cause is one failed fetch of a large file, not anything permanent.
    queryData.loadIndexData.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('textbox')).toBeEnabled();
    expect(useDataStreamStore.getState().index_status).toBe('ready');
    consoleError.mockRestore();
  });
});

describe('searching by the numeric part', () => {
  const { searchCandidates, numericPartOf } = require('features/DataStream/lib/utils');

  /**
   * People read an id off a chart title or a hover popup and type the number. Requiring the
   * cat- or wb- prefix meant knowing which of the two the app charts before searching for it.
   */
  test('a bare number is looked up as the catchment first, then the reach', () => {
    // nex- was tried third until the nexus layer was removed. The index still holds those rows,
    // so offering them would fly the map to a point with nothing drawn and nothing selectable.
    expect(searchCandidates('2884494')).toEqual([
      'cat-2884494',
      'wb-2884494',
      // Lakes carry no prefix at all in the index.
      '2884494',
    ]);
  });

  test('a nexus id is a miss, not a flight to an empty point', () => {
    // Dropping nex- from the bare-number prefixes only covers "2884494". An id typed with the
    // prefix was still taken as written and still resolves against the index, which carries
    // 409,122 nexus-family rows that nothing on the map can show any more.
    expect(searchCandidates('nex-2884494')).toEqual([]);
    expect(searchCandidates('tnx-100')).toEqual([]);
    expect(searchCandidates('cnx-100')).toEqual([]);
    expect(searchCandidates('inx-100')).toEqual([]);
  });

  test('an id that already names its kind is taken as written', () => {
    expect(searchCandidates('wb-2884494')).toEqual(['wb-2884494']);
    expect(searchCandidates('cat-2884494')).toEqual(['cat-2884494']);
  });

  test('whitespace and case do not matter', () => {
    expect(searchCandidates('  CAT-2884494 ')).toEqual(['cat-2884494']);
  });

  test('nothing typed is nothing to look for', () => {
    expect(searchCandidates('')).toEqual([]);
    expect(searchCandidates(null)).toEqual([]);
  });

  test('the numeric part is what the timeseries tables are keyed by', () => {
    expect(numericPartOf('cat-2884494')).toBe('2884494');
    expect(numericPartOf('wb-2884494')).toBe('2884494');
    expect(numericPartOf('2884494')).toBe('2884494');
    expect(numericPartOf('nex-1000009947')).toBe('1000009947');
    expect(numericPartOf('')).toBeNull();
  });

  test('selects the id the index holds, not the number that was typed', async () => {
    queryData.getFeatureProperties.mockResolvedValue([{ id: 'cat-2884494', vpuid: '16' }]);
    render(<SearchBar />);
    await waitFor(() => expect(box()).toBeEnabled());

    fireEvent.change(box(), { target: { value: '2884494' } });
    fireEvent.click(button());

    await waitFor(() =>
      expect(useFeatureStore.getState().selected_feature._id).toBe('cat-2884494'));
  });
});

/**
 * The prompt the narrowest phones actually get.
 *
 * This was covered only by a regex over SearchBar.js's source, which stays true whatever the
 * component renders: hardcoding useIsNarrowHeader to return false, disabling the swap outright,
 * left the whole suite green. Rendering under a matched media query is the version that fails.
 */
describe('the prompt on a narrow header', () => {
  const setViewport = (matches) => {
    window.matchMedia = (query) => ({
      get matches() { return matches; },
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  };

  const original = window.matchMedia;
  afterEach(() => { window.matchMedia = original; });

  it('spells the prompt out when the row can afford it', async () => {
    setViewport(false);

    await ready();

    expect(box()).toHaveAttribute('placeholder', 'Search for an id');
  });

  it('shortens the prompt where the row cannot', async () => {
    setViewport(true);

    await ready();

    expect(box()).toHaveAttribute('placeholder', 'Find id');
  });

  it('keeps the full sentence as the accessible name either way', async () => {
    setViewport(true);

    await ready();

    expect(screen.getByRole('textbox', { name: 'Search for an id' })).toBeInTheDocument();
  });
});
