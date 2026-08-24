import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useShallow } from 'zustand/react/shallow';

import Spinner from 'features/Tethys/components/loader/Spinner';
import {
  SearchBarWrapper,
  SearchButton,
  SearchIcon,
  SearchInput,
  SearchNotice,
} from '../styles/Styles';
import { loadIndexData } from 'features/DataStream/lib/queryData';
import { cacheFailureReason, searchCandidates } from 'features/DataStream/lib/utils';
import { selectIndexedFeature } from 'features/DataStream/actions/selectIndexedFeature';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';


/**
 * Find a feature by id and select it.
 *
 * Three things were wrong here. The input's value came from the store's feature_id, which only
 * changes for a complete id in the loaded vpu, so every keystroke was thrown away and the box
 * could not be typed in. Each keystroke also ran a duckdb query, and the index those queries
 * need takes about seven seconds to build on mount -- 2.07 million rows from a 103 MB parquet
 * -- so anything typed before it existed raised "Table with name index_data_table does not
 * exist". The handler had no catch, so those arrived as unhandled rejections in the console.
 *
 * Now the box owns its own text, searching is an explicit submit rather than a side effect of
 * typing, and it says what it is doing while the index builds.
 *
 * A miss is reported through the store rather than the placeholder. The placeholder only paints
 * on an empty input, and after a search the input still holds the id that was searched for, so
 * "no feature with id x" was written somewhere it could never be seen. Searching for something
 * absent looked exactly like searching for nothing, which is why it read as silently ignored.
 *
 * A failed index is a state, not a message. It used to leave the box disabled and still claiming
 * to be building the index, with its one explanation in loadingText where the next vpu load
 * overwrote it: the box lied for the rest of the session. It now says it plainly and offers to
 * try again, since the usual cause is a transient fetch of a 103 MB file.
 */
/**
 * A bare number is looked up as the catchment first, then its flowpath.
 *
 * While the index is loading the control is disabled and marked aria-busy, and says nothing in
 * words: the status strip beside it already carries "Building the search index", and saying it
 * twice made a pill wide enough to push the button off the screen.
 */
const SearchBar = ({ placeholder = 'Search for an id' }) => {
  const {
    hydrofabric_index_url,
    hydrofabric_index_fallback,
    indexStatus,
    setIndexStatus,
  } = useDataStreamStore(
    useShallow((s) => ({
      hydrofabric_index_url: s.hydrofabric_index,
      hydrofabric_index_fallback: s.hydrofabric_index_fallback,
      indexStatus: s.index_status,
      setIndexStatus: s.set_index_status,
    }))
  );

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reason, setReason] = useState(null);

  useEffect(() => {
    let alive = true;
    setIndexStatus('loading');
    setReason(null);
    loadIndexData({
      remoteUrl: hydrofabric_index_url,
      fallbackUrl: hydrofabric_index_fallback,
    })
      .then(() => { if (alive) setIndexStatus('ready'); })
      .catch((err) => {
        if (!alive) return;
        console.error('Could not build the search index', err);
        setReason(cacheFailureReason(err));
        setIndexStatus('failed');
      });
    return () => { alive = false; };
  }, [hydrofabric_index_url, hydrofabric_index_fallback, attempt, setIndexStatus]);

  const runSearch = useCallback(async (event) => {
    event?.preventDefault();
    const id = query.trim();
    if (!id || indexStatus !== 'ready' || searching) return;

    setSearching(true);
    setNotFound(false);
    try {
      const matchedId = await selectIndexedFeature(searchCandidates(id));
      if (!matchedId) {
        setNotFound(true);
        useTimeSeriesStore.setState({
          loadingText: `No feature found with id ${id}`,
          last_error: { kind: 'search-miss', featureId: id },
        });
        return;
      }
      useTimeSeriesStore.setState({ loadingText: '', last_error: null });
    } catch (err) {
      console.error('Search failed for', id, err);
      useTimeSeriesStore.setState({
        loadingText: `Search failed for ${id}`,
        last_error: { kind: 'search', featureId: id },
      });
    } finally {
      setSearching(false);
    }
  }, [query, indexStatus, searching]);

  if (indexStatus === 'failed') {
    return (
      <SearchNotice role="alert">
        <span>{reason ? `Search unavailable: ${reason}` : 'Search unavailable'}</span>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </SearchNotice>
    );
  }

  const loading = indexStatus === 'loading';


  return (
    <SearchBarWrapper as="form" onSubmit={runSearch} role="search">
      <SearchIcon aria-hidden="true" />
      <SearchInput
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setNotFound(false); }}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-invalid={notFound || undefined}
        aria-busy={loading || undefined}
        $notFound={notFound}
        disabled={loading}
      />
      <SearchButton
        type="submit"
        disabled={loading || searching || !query.trim()}
        aria-label={searching ? 'Searching' : 'Search'}
      >
        {searching ? <Spinner size={13} /> : 'Search'}
      </SearchButton>
    </SearchBarWrapper>
  );
};

SearchBar.propTypes = {
  placeholder: PropTypes.string,
};

export default SearchBar;
