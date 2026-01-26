import React,{ useEffect} from 'react';
import { MapContainer, ViewContainer } from 'features/DataStream/components/styles/Styles';
import { ToastContainer } from 'react-toastify';
import MapComponent from 'features/DataStream/components/map/Mapg.js';
import MainMenu from 'features/DataStream/components/menus/MainMenu';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useTimeSeriesStore from '../store/Timeseries';
import { useVPUStore } from '../store/Layers';
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

const DataStreamView = () => {
  const vpu = useDataStreamStore((state) => state.vpu);
  const cacheKey = useDataStreamStore((state) => state.cache_key);
  const ensemble = useDataStreamStore((state) => state.ensemble);
  const outputFile = useDataStreamStore((state) => state.outputFile);
  const forecast = useDataStreamStore((state) => state.forecast);
  const set_model = useDataStreamStore((state) => state.set_model); 
  const set_date = useDataStreamStore((state) => state.set_date);
  const set_cycle = useDataStreamStore((state) => state.set_cycle);
  const set_forecast = useDataStreamStore((state) => state.set_forecast);
  const set_outputFile = useDataStreamStore((state) => state.set_outputFile);
  const set_variables = useDataStreamStore((state) => state.set_variables);
  const set_cache_key = useDataStreamStore((state) => state.set_cache_key);

  const prefix = useS3DataStreamBucketStore((state) => state.prefix);
  const set_prefix = useS3DataStreamBucketStore((state) => state.set_prefix);
  const setForecastOptions = useS3DataStreamBucketStore((state) => state.set_forecasts);
  const setAvailableDatesList = useS3DataStreamBucketStore((state) => state.set_dates);
  const setAvailableCyclesList = useS3DataStreamBucketStore((state) => state.set_cycles);
  const setAvailableOutputFiles = useS3DataStreamBucketStore((state) => state.set_outputFiles);
  
  const set_feature_ids = useVPUStore((state) => state.set_feature_ids);
  const setVarData = useVPUStore((state) => state.setVarData);

  const feature_id = useTimeSeriesStore((state) => state.feature_id);
  const loading = useTimeSeriesStore((state) => state.loading);
  const set_variable = useTimeSeriesStore((state) => state.set_variable);
  const set_loading_text = useTimeSeriesStore((state) => state.set_loading_text);
  const set_series = useTimeSeriesStore((state) => state.set_series);
  const set_layout = useTimeSeriesStore((state) => state.set_layout);
  const setLoading = useTimeSeriesStore((state) => state.set_loading);  
  const setAnimationIndex = useVPUStore((state) => state.setAnimationIndex);
 
  useEffect(() => {
    async function fetchInitialData() {
      if (!vpu) return;
      const { models, dates, forecasts, cycles, outputFiles } = await initialS3Data(vpu);
      const _models = models.filter(m => m.value !== 'test'); 
      setAvailableDatesList(dates);
      setForecastOptions(forecasts);
      setAvailableCyclesList(cycles);
      setAvailableOutputFiles(outputFiles);
      set_model(_models[0]?.value);
      set_date(dates[1]?.value);
      set_forecast(forecasts[0]?.value);
      set_cycle(cycles[0]?.value);
      set_outputFile(outputFiles[0]?.value);
      const cacheKey = getCacheKey(
        _models[0]?.value,
        dates[1]?.value,
        forecasts[0]?.value,
        cycles[0]?.value,
        ensemble,
        vpu,
        outputFiles[0]?.value
      );
      set_cache_key(cacheKey);
      const _prefix = makePrefix(_models[0]?.value, dates[1]?.value, forecasts[0]?.value, cycles[0]?.value, ensemble, vpu, outputFiles[0]?.value);
      set_prefix(_prefix);
    }
    fetchInitialData();

  }, [vpu]); 

  useEffect( () => {   
   async function getData(){
    if (!outputFile || loading || !feature_id ) return;
    const vpu_gpkg = makeGpkgUrl(vpu);
    const id = feature_id.split('-')[1];
    setLoading(true);
    set_loading_text('Loading feature properties...');
    try {
      const tableExists = await checkForTable(cacheKey);
      if (!tableExists) {
        await loadVpuData(cacheKey, prefix, vpu_gpkg);
        const featureIDs = await getFeatureIDs(cacheKey);
        set_feature_ids(featureIDs);
      }
    } catch (err) {
      console.error('No data for VPU', vpu, err);
      set_loading_text('No data available for selected VPU');
      setLoading(false);
    }
    try {
      const variables = await getVariables({ cacheKey });
      const series = await getTimeseries(id, cacheKey, variables[0]);
      const xy = series.map((d) => ({
        x: new Date(d.time),
        y: d.flow,
      }));
      set_loading_text(`Loaded ${xy.length} points for id: ${id}`);
      set_variables(variables);
      set_variable(variables[0]);
      set_series(xy);
      set_layout({
        yaxis: variables[0],
        xaxis: '',
        title: makeTitle(forecast, feature_id),
      });
      const [featureIds, times, flat] = await Promise.all([
        getDistinctFeatureIds(cacheKey),
        getDistinctTimes(cacheKey),
        getVpuVariableFlat(cacheKey, variables[0]),
      ]);
      setAnimationIndex(featureIds, times);
      setVarData(variables[0], flat);
      set_loading_text('');
      setLoading(false);
    } catch (err) {
        set_loading_text(`Failed to load timeseries for id: ${id}`);
        setLoading(false);
        console.error('Failed to load timeseries for', id, err);
    }
   }
   getData();

  }, [cacheKey, feature_id]);

  return (
    <ViewContainer>
            <ToastContainer stacked  />
            <MapContainer>
              <MapComponent/>
            </MapContainer >
            <MainMenu/>
    </ViewContainer>
  );
};

export default DataStreamView;
