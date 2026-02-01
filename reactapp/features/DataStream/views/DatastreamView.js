import React,{ useEffect} from 'react';
import { MapContainer, ViewContainer } from 'features/DataStream/components/styles/Styles';
import { ToastContainer } from 'react-toastify';
import MapComponent from 'features/DataStream/components/map/Mapg.js';
import MainMenu from 'features/DataStream/components/menus/MainMenu';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useTimeSeriesStore from '../store/Timeseries';
import { useCacheTablesStore } from '../store/CacheTables';
import { useVPUStore, useFeatureStore } from '../store/Layers';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import { initialS3Data, makePrefix, makeGpkgUrl } from 'features/DataStream/lib/s3Utils';
import { getCacheKey } from 'features/DataStream/lib/opfsCache';
import { checkForTable, 
  getTimeseries, 
  loadVpuData, 
  getFeatureIDs, 
  getDistinctFeatureIds, 
  getDistinctTimes, 
  getVpuVariableFlat, 
  getVariables 
} from 'features/DataStream/lib/queryData';
import { makeTitle } from 'features/DataStream/lib/utils';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useShallow } from "zustand/react/shallow";

function InitialS3Loader() {
  const { vpu } = useDataStreamStore(
    useShallow((s) => ({
      vpu: s.vpu,
      ensemble: s.ensemble,
    }))
  );
  // const {resetTimeSeriesStore} = useTimeSeriesStore(
  //   useShallow((s) => ({ reset: s.reset}))
  // );
  const { set_model, set_forecast, set_cycle, set_outputFile, set_date, set_ensemble, set_cache_key } = useDataStreamStore(
    useShallow((s) => ({
      set_model: s.set_model,
      set_forecast: s.set_forecast,
      set_cycle: s.set_cycle,
      set_outputFile: s.set_outputFile,
      set_date: s.set_date,
      set_ensemble: s.set_ensemble,
      set_cache_key: s.set_cache_key,
    }))
  );
  const { setInitialData } = useS3DataStreamBucketStore(
    useShallow((s) => ({ setInitialData: s.setInitialData }))
  );

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    async function fetchInitialData() {
      if (!vpu) return;
      try {
        const { models, dates, forecasts, cycles, ensembles, outputFiles } =
          await initialS3Data(vpu, { signal: controller.signal });

        if (!alive) return; // <- prevents any setState after unmount/dep change

        const _models = models.filter(m => m.value !== 'test');

        const cacheKey = getCacheKey(
          _models[0]?.value,
          dates[1]?.value,
          forecasts[0]?.value,
          cycles[0]?.value,
          ensembles[0]?.value || null,
          vpu,
          outputFiles[0]?.value
        );

        set_model(_models[0]?.value);
        set_forecast(forecasts[0]?.value);
        set_cycle(cycles[0]?.value);
        set_outputFile(outputFiles[0]?.value);
        set_date(dates[1]?.value);
        set_ensemble(ensembles[0]?.value || null);
        set_cache_key(cacheKey);

        const _prefix = makePrefix(
          _models[0]?.value,
          dates[1]?.value,
          forecasts[0]?.value,
          cycles[0]?.value,
          ensembles[0]?.value || null,
          vpu,
          outputFiles[0]?.value
        );

        setInitialData({
          models: _models,
          dates: dates,
          forecasts: forecasts,
          cycles: cycles,
          outputFiles: outputFiles,
          prefix: _prefix,
        });

      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('Error fetching initial S3 data:', error);
      }
    }
    
    fetchInitialData();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [vpu]);

  return null;
}

function TimeseriesLoader() {
  const { cacheKey, forecast, vpu, set_variables } = useDataStreamStore(
    useShallow((s) => ({
      cacheKey: s.cache_key,
      forecast: s.forecast,
      vpu: s.vpu,
      set_variables: s.set_variables,
    }))
  );
  const { selected_feature_id } = useFeatureStore(
    useShallow((s) => ({
      selected_feature_id: s.selected_feature ? s.selected_feature._id : null,
    }))
  );

  const { add_cacheTable } = useCacheTablesStore(
    useShallow((s) => ({
      add_cacheTable: s.add_cacheTable,
    }))
  );
  
  const { prefix } = useS3DataStreamBucketStore(
    useShallow((s) => ({ prefix: s.prefix }))
  );

  const { feature_id, loading, variable, set_feature_id, set_variable, set_loading_text, set_series, set_layout, set_loading, reset_series, reset } = useTimeSeriesStore(
    useShallow((s) => ({ 
      feature_id: s.feature_id,
      loading: s.loading,
      variable: s.variable,
      set_feature_id: s.set_feature_id,
      set_variable: s.set_variable,
      set_loading_text: s.set_loading_text,
      set_series: s.set_series,
      set_layout: s.set_layout,
      set_loading: s.set_loading,
      reset_series: s.reset_series,
      reset: s.reset,
    }))
  );
  const { set_feature_ids, setVarData, setAnimationIndex } = useVPUStore(
    useShallow((s) => ({
      set_feature_ids: s.set_feature_ids,
      setVarData: s.setVarData,
      setAnimationIndex: s.setAnimationIndex,
    }))
  );
  useEffect(() => {
    async function getTsData(){
      if (!feature_id || loading ) return;
      console.log('Loading timeseries for feature_id:', feature_id, 'variable:', variable, 'cacheKey:', cacheKey);
      reset_series();
      const id = feature_id.split('-')[1];
      set_loading(true);
      set_loading_text('Loading feature properties...');
      let currentVariable = variable;
      try {
        const series = await getTimeseries(id, cacheKey, currentVariable);
        const xy = series.map((d) => ({
          x: new Date(d.time),
          y: d[currentVariable],
        }));
        set_loading_text(`Loaded ${xy.length} points for id: ${id}`);
        set_series(xy);
        set_layout({
          yaxis: currentVariable,
          xaxis: '',
          title: makeTitle(forecast, feature_id),
        });
        set_loading_text('');
        set_loading(false);
      } 
      catch (err) {
          set_loading_text(`Failed to load timeseries for id: ${feature_id}`);
          set_loading(false);
          console.error('Failed to load timeseries for', feature_id, err);
      }
   }
    getTsData();
    
  },[feature_id]);

  useEffect( () => {
   async function getVPUData(){
    if (!cacheKey || loading ) return;
    console.log('Loading VPU data for cacheKey:', cacheKey);
    reset();
    const vpu_gpkg = makeGpkgUrl(vpu);
    set_loading(true);
    set_loading_text('Loading feature properties...');
    let currentVariable = variable;
    try {
      const tableExists = await checkForTable(cacheKey);
      if (!tableExists) {
        try{
          const fileSize = await loadVpuData(cacheKey, prefix, vpu_gpkg);
          add_cacheTable({id: cacheKey, name: cacheKey.replaceAll('_',' '), size: fileSize});
        }catch(err){
          console.error('No data for VPU', vpu, err);
          set_loading_text('No data available for selected VPU');
          set_loading(false);
        }
      }
      const featureIDs = await getFeatureIDs(cacheKey);
      set_feature_ids(featureIDs);
      const variables = await getVariables({ cacheKey });
      set_variables(variables);
      set_variable(variables[0]);
      currentVariable = variables[0];
      const [featureIds, times, flat] = await Promise.all([
        getDistinctFeatureIds(cacheKey),
        getDistinctTimes(cacheKey),
        getVpuVariableFlat(cacheKey, currentVariable),
      ]);
      setAnimationIndex(featureIds, times);
      setVarData(currentVariable, flat);
      set_feature_id(selected_feature_id);

      set_loading_text('');
      set_loading(false);
    } 
    catch (err) {
        set_loading_text(`Failed to load timeseries for id: ${id}`);
        set_loading(false);
        console.error('Failed to load timeseries for', id, err);
    }
   }
   getVPUData();

  }, [cacheKey]);

  return null;
}


const DataStreamView = () => {
  return (
    <ViewContainer>
      <InitialS3Loader />
      <TimeseriesLoader />
      <ToastContainer stacked  />
        <MapContainer>
          <MapComponent/>
        </MapContainer >
        <MainMenu/>
    </ViewContainer>
  );
};
export default DataStreamView;
