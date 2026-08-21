import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useShallow } from 'zustand/react/shallow';

import Spinner from 'features/Tethys/components/loader/Spinner';
import { SearchBarWrapper, SearchButton, SearchIcon, SearchInput } from '../styles/Styles';
import { loadIndexData, getFeatureProperties } from 'features/DataStream/lib/queryData';
import { searchCandidates } from 'features/DataStream/lib/utils';
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
 * typing, and it stays disabled with a plain explanation until the index is ready.
 *
 * A miss is reported through the store rather than the placeholder. The placeholder only paints
 * on an empty input, and after a search the input still holds the id that was searched for, so
 * "no feature with id x" was written somewhere it could never be seen. Searching for something
 * absent looked exactly like searching for nothing, which is why it read as silently ignored.
 */
const SearchBar = ({ placeholder = 'Search for an id' }) => {
  const { hydrofabric_index_url, vpu, set_vpu } = useDataStreamStore(
    useShallow((s) => ({
      hydrofabric_index_url: s.hydrofabric_index,
      vpu: s.vpu,
      set_vpu: s.set_vpu,
    }))
  );
  const set_selected_feature = useFeatureStore((s) => s.set_selected_feature);

  const [query, setQuery] = useState('');
  const [indexReady, setIndexReady] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    // Building the id index is the one load that has to happen without being asked for.
    loadIndexData({ remoteUrl: hydrofabric_index_url })
      .then(() => { if (alive) setIndexReady(true); })
      .catch((err) => {
        if (!alive) return;
        console.error('Could not build the search index', err);
        useTimeSeriesStore.setState({
          loadingText: 'Search is unavailable: the id index could not be loaded',
          last_error: { kind: 'search-index' },
        });
      });
    return () => { alive = false; };
  }, [hydrofabric_index_url]);

  const runSearch = useCallback(async (event) => {
    event?.preventDefault();
    const id = query.trim();
    if (!id || !indexReady || searching) return;

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
        loadTimeseries({ featureId: matchedId });
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
  }, [query, indexReady, searching, vpu, set_vpu, set_selected_feature]);

  const label = indexReady ? placeholder : 'Building the id index';

  return (
    <SearchBarWrapper as="form" onSubmit={runSearch} role="search">
      <SearchIcon aria-hidden="true" />
      <SearchInput
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setNotFound(false); }}
        placeholder={label}
        aria-label={placeholder}
        aria-invalid={notFound || undefined}
        $notFound={notFound}
        disabled={!indexReady}
      />
      <SearchButton
        type="submit"
        disabled={!indexReady || searching || !query.trim()}
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
