import React, {useEffect} from 'react';
import { SearchBarWrapper, SearchIcon, SearchInput } from '../styles/Styles';
import { loadIndexData, getFeatureProperties } from 'features/DataStream/lib/queryData';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import {useFeatureStore} from 'features/DataStream/store/Layers';
import {useShallow} from 'zustand/react/shallow';

const SearchBar = ({ placeholder = 'Search for an id' }) => {

  const { hydrofabric_index_url, vpu, set_vpu } = useDataStreamStore(
    useShallow((s) => ({
      hydrofabric_index_url: s.hydrofabric_index,
      vpu: s.vpu,
      set_vpu: s.set_vpu,
    }))
  );

  const { feature_id, set_feature_id } = useTimeSeriesStore(
    useShallow((s) => ({
      feature_id: s.feature_id,
      set_feature_id: s.set_feature_id,
    }))
  );
  
  const { set_selected_feature } = useFeatureStore(
    useShallow((s) => ({
      set_selected_feature: s.set_selected_feature,
    }))
  );

  const handleChange = async (e) => {
    const unbiased_id = e.target.value;
    const features = await getFeatureProperties({ cacheKey: 'index_data_table', feature_id: unbiased_id });
    if (features.length === 0) {
      return 
    };
    const feature = features.length > 0 ? features[0] : null;

    set_selected_feature({
      _id: unbiased_id,
      ...feature,
    });
    const vpu_str = `VPU_${feature.vpuid}`;
    if (vpu_str === vpu){
      set_feature_id(unbiased_id);
    }
    set_vpu(vpu_str);
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