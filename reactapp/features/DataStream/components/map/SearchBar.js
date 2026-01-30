import React, {useEffect} from 'react';
import { SearchBarWrapper, SearchIcon, SearchInput } from '../styles/Styles';
import { loadIndexData, getFeatureProperties } from 'features/DataStream/lib/queryData';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import {useFeatureStore} from 'features/DataStream/store/Layers';

const SearchBar = ({ placeholder = 'Search for an id' }) => {

  const hydrofabric_index_url = useDataStreamStore((state) => state.hydrofabric_index);
  const set_vpu = useDataStreamStore((state) => state.set_vpu);

  const feature_id = useTimeSeriesStore((state) => state.feature_id);
  const set_feature_id = useTimeSeriesStore((state) => state.set_feature_id);
  const set_selected_feature = useFeatureStore((state) => state.set_selected_feature);

  const handleChange = async (e) => {
    const unbiased_id = e.target.value;
    const features = await getFeatureProperties({ cacheKey: 'index_data_table', feature_id: unbiased_id });
    if (features.length === 0) {
      return 
    };
    const feature = features.length > 0 ? features[0] : null;
    set_selected_feature(feature || null);
    const vpu_str = `VPU_${feature.vpuid}`;
    set_vpu(vpu_str);
    set_feature_id(unbiased_id);
  }

  useEffect(() => {
    const loadSearchData = async () => {
      try {
        await loadIndexData({ remoteUrl: hydrofabric_index_url } );
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    loadSearchData();
    return () => {
    };
  }, []);

  return (
    <>
    <SearchBarWrapper>
      <SearchIcon aria-hidden="true" />
      <SearchInput
        type="text"
        value={feature_id || ''}
        onChange={(e) => handleChange(e)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </SearchBarWrapper>
    </>
 );
};

export default SearchBar;