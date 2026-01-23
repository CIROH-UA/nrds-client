import React, {useState, useEffect } from 'react';
import { SearchBarWrapper, SearchIcon, SearchInput } from '../styles/Styles';
import { loadIndexData, getFeatureProperties } from 'features/DataStream/lib/queryData';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import {useFeatureStore} from 'features/DataStream/store/Layers';
import { getTimeseries, getVariables, checkForTable, loadVpuData } from 'features/DataStream/lib/queryData';
import { makeTitle } from 'features/DataStream/lib/utils';
import { getCacheKey } from 'features/DataStream/lib/opfsCache';
import { makeGpkgUrl } from 'features/DataStream/lib/s3Utils';
import ResetDataButton from '../forecast/cacheHandler';
import { toast } from 'react-toastify';

const SearchBar = ({ placeholder = 'Search for an id' }) => {
  // const [searchInput, setSearchInput] = useState('');
  const hydrofabric_index_url = useDataStreamStore((state) => state.hydrofabric_index);
  const forecast = useDataStreamStore((state) => state.forecast);
  const model = useDataStreamStore((state) => state.model);
  const date = useDataStreamStore((state) => state.date);
  const cycle = useDataStreamStore((state) => state.cycle);
  const time = useDataStreamStore((state) => state.time);
  const vpu = useDataStreamStore((state) => state.vpu);
  const outputFile = useDataStreamStore((state) => state.outputFile);
  const set_variables = useDataStreamStore((state) => state.set_variables);
  
  const set_table = useTimeSeriesStore((state) => state.set_table);
  const variable = useTimeSeriesStore((state) => state.variable);  
  const set_series = useTimeSeriesStore((state) => state.set_series);
  const set_layout = useTimeSeriesStore((state) => state.set_layout);
  const set_variable = useTimeSeriesStore((state) => state.set_variable);
  const feature_id = useTimeSeriesStore((state) => state.feature_id);
  const set_feature_id = useTimeSeriesStore((state) => state.set_feature_id);
  const loading = useTimeSeriesStore((state) => state.loading);
  const setLoading = useTimeSeriesStore((state) => state.set_loading);  
  const set_selected_feature = useFeatureStore((state) => state.set_selected_feature);

  const handleChange = async (e) => {
    if (loading) {
      toast.info('Data is already loading, please wait...', { autoClose: 300 });
      return
    };
    setLoading(true);
    const unbiased_id = e.target.value;
    set_feature_id(unbiased_id);
    const id = unbiased_id.split('-')[1];
    const toastId = toast.loading(`Loading data for id: ${id}...`, {
      closeOnClick: false,
      draggable: false,
    });
    try{
      const features = await getFeatureProperties({ cacheKey: 'index_data_table', feature_id: unbiased_id });
      if (features.length === 0) {
        setLoading(false);
        return 
      };
      const feature = features.length > 0 ? features[0] : null;
      set_selected_feature(feature || null);
      const vpu_str = `VPU_${feature.vpuid}`;
      const cacheKey = getCacheKey(
        model,
        date,
        forecast,
        cycle,
        time,
        vpu_str,
        outputFile
      );

      const tableExists = await checkForTable(cacheKey);
      if (!tableExists) {
        await loadVpuData(
          model,
          date,
          forecast,
          cycle,
          time,
          outputFile,
          vpu_str,
          makeGpkgUrl(vpu)
        );
      } else {
        console.log(`Table ${cacheKey} already exists.`);
      }
      const variables = await getVariables({cacheKey});
      const _variable = variable ? variable : variables[0];
      console.log("Using variable:", _variable);
      const series = await getTimeseries(id, cacheKey, _variable);
      const xy = series.map((d) => ({
        x: new Date(d.time),
        y: d[variables[0]],
      }));
      const textToat = `Loaded ${xy.length} points for id: ${id}`;
      set_series(xy);
      set_table(cacheKey);
      set_variables(variables);
      set_variable(_variable);
      set_layout({
        'yaxis': _variable,
        'xaxis': "Time",
        'title': makeTitle(forecast, unbiased_id),
      });
      toast.update(toastId, {
          render: `${textToat}`,
          type: 'success',
          isLoading: false,
          autoClose: 3000,
          closeOnClick: true,
        });
    }
    catch (error) {
      console.error('Error fetching data for feature id:', unbiased_id, error);
      toast.update(toastId, {
        render: `No data for id: ${id}`,
        type: 'warning',
        isLoading: false,
        autoClose: 500,
        closeOnClick: true,
      });
    } finally {
      setLoading(false);
    }

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
  }, []); // dependencies array

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
      <ResetDataButton />
    </>
 );
};

export default SearchBar;