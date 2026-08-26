import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useShallow } from 'zustand/react/shallow';

import Spinner from 'features/Tethys/components/loader/Spinner';
import {
  SearchBarWrapper,
  SearchButton,
  SearchButtonLabel,
  SearchIcon,
  SearchInput,
  SearchNotice,
  SearchSubmitIcon,
} from '../styles/Styles';
import { loadIndexData } from 'features/DataStream/lib/queryData';
import { cacheFailureReason, searchCandidates } from 'features/DataStream/lib/utils';
import { selectIndexedFeature } from 'features/DataStream/actions/selectIndexedFeature';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useIsNarrowHeader } from 'features/DataStream/lib/breakpoints';

/** Find a feature by id and select it. */
/** A bare number is looked up as the catchment first, then its flowpath. */
const SearchBar = ({ placeholder = 'Search for an id', shortPlaceholder = 'Find id' }) => {
  const narrow = useIsNarrowHeader();
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
        placeholder={narrow ? shortPlaceholder : placeholder}
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
        {searching ? <Spinner size={13} /> : (
          <>
            <SearchButtonLabel>Search</SearchButtonLabel>
            <SearchSubmitIcon aria-hidden="true" />
          </>
        )}
      </SearchButton>
    </SearchBarWrapper>
  );
};

SearchBar.propTypes = {
  placeholder: PropTypes.string,
  shortPlaceholder: PropTypes.string,
};

export default SearchBar;
