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
import { loadIndexData, getFeatureProperties } from 'features/DataStream/lib/queryData';
import { cacheFailureReason, searchCandidates } from 'features/DataStream/lib/utils';
import { loadTimeseries } from 'features/DataStream/actions/loadTimeseries';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useFeatureStore } from 'features/DataStream/store/Layers';

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
const SearchBar = ({ placeholder = 'Search for an id' }) => {
  const { hydrofabric_index_url, vpu, set_vpu, indexStatus, setIndexStatus } = useDataStreamStore(
    useShallow((s) => ({
      hydrofabric_index_url: s.hydrofabric_index,
      vpu: s.vpu,
      set_vpu: s.set_vpu,
      indexStatus: s.index_status,
      setIndexStatus: s.set_index_status,
    }))
  );
  const set_selected_feature = useFeatureStore((s) => s.set_selected_feature);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reason, setReason] = useState(null);

  useEffect(() => {
    let alive = true;
    setIndexStatus('loading');
    setReason(null);
    // Building the id index is the one load that has to happen without being asked for.
    loadIndexData({ remoteUrl: hydrofabric_index_url })
      .then(() => { if (alive) setIndexStatus('ready'); })
      .catch((err) => {
        if (!alive) return;
        console.error('Could not build the search index', err);
        setReason(cacheFailureReason(err));
        setIndexStatus('failed');
      });
    return () => { alive = false; };
  }, [hydrofabric_index_url, attempt, setIndexStatus]);

  const runSearch = useCallback(async (event) => {
    event?.preventDefault();
    const id = query.trim();
    if (!id || indexStatus !== 'ready' || searching) return;

    setSearching(true);
    setNotFound(false);
    try {
      // A bare number is looked up as the catchment, its flowpath and its nexus, in that order.
      const features = await getFeatureProperties({
        cacheKey: 'index_data_table',
        feature_id: searchCandidates(id),
      });
      if (!features.length) {
        setNotFound(true);
        // Through the store, not the placeholder; see the note above.
        useTimeSeriesStore.setState({
          loadingText: `No feature found with id ${id}`,
          last_error: { kind: 'search-miss', featureId: id },
        });
        return;
      }
      const feature = features[0];
      useTimeSeriesStore.setState({ loadingText: '', last_error: null });
      // The id the index actually holds, not the one typed: searching "2884494" selects
      // cat-2884494, and everything downstream keys off that.
      const matchedId = feature.id ?? id;
      set_selected_feature({ _id: matchedId, ...feature });

      const vpuName = `VPU_${feature.vpuid}`;
      // Same rule as a map click: chart it here only if its vpu is the one already loaded.
      if (vpuName === vpu) {
        loadTimeseries({ featureId: matchedId }).catch((err) => {
          console.error('Could not chart', matchedId, err);
        });
      }
      set_vpu(vpuName);
    } catch (err) {
      console.error('Search failed for', id, err);
      useTimeSeriesStore.setState({
        loadingText: `Search failed for ${id}`,
        last_error: { kind: 'search', featureId: id },
      });
    } finally {
      setSearching(false);
    }
  }, [query, indexStatus, searching, vpu, set_vpu, set_selected_feature]);

  if (indexStatus === 'failed') {
    return (
      <SearchNotice role="alert">
        <span>
          Search unavailable: the id index could not be loaded
          {reason ? ` (${reason})` : ''}
        </span>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </SearchNotice>
    );
  }

  const loading = indexStatus === 'loading';
  // The status strip beside it carries "Building the search index" with the spinner, so saying
  // it here too printed the same sentence twice in one header. Disabled plus aria-busy is the
  // part only the control can say.


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
