import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { Spinner } from 'react-bootstrap';
import { XButton, LoadingMessage, Row, IconLabel } from '../styles/Styles';
import SelectComponent from '../SelectComponent';
import { toast } from 'react-toastify';
import { loadVpuData, getVariables, getTimeseries, checkForTable, getFeatureIDs } from 'features/DataStream/lib/queryData';
import { makeGpkgUrl, getOptionsFromURL, initialS3Data, makePrefix } from 'features/DataStream/lib/s3Utils';
import { getCacheKey } from 'features/DataStream/lib/opfsCache';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import { makeTitle } from 'features/DataStream/lib/utils';
import {
  ModelIcon,
  DateIcon,
  ForecastIcon,
  CycleIcon,
  EnsembleIcon,
  VariableIcon,
} from 'features/DataStream/lib/layers';
import { useVPUStore } from 'features/DataStream/store/Layers';


export default function DataMenu() {

  const vpu = useDataStreamStore((state) => state.vpu);
  const date = useDataStreamStore((state) => state.date);
  const forecast = useDataStreamStore((state) => state.forecast);
  const ensemble = useDataStreamStore((state) => state.ensemble);
  const cycle = useDataStreamStore((state) => state.cycle);
  const variables = useDataStreamStore((state) => state.variables);
  const model = useDataStreamStore((state) => state.model);
  const outputFile = useDataStreamStore((state) => state.outputFile);
  const cacheKey = useDataStreamStore((state) => state.cache_key);
  // const table = useTimeSeriesStore((state) => state.table);

  const set_date = useDataStreamStore((state) => state.set_date);
  const set_forecast = useDataStreamStore((state) => state.set_forecast);
  const set_ensemble = useDataStreamStore((state) => state.set_ensemble);
  const set_cycle = useDataStreamStore((state) => state.set_cycle);
  const set_variables = useDataStreamStore((state) => state.set_variables);
  const set_model = useDataStreamStore((state) => state.set_model);
  const set_outputFile = useDataStreamStore((state) => state.set_outputFile);
  const set_cache_key = useDataStreamStore((state) => state.set_cache_key);
  const variable = useTimeSeriesStore((state) => state.variable);
  const set_series = useTimeSeriesStore((state) => state.set_series);
  // const set_table = useTimeSeriesStore((state) => state.set_table);
  const set_variable = useTimeSeriesStore((state) => state.set_variable);
  const set_layout = useTimeSeriesStore((state) => state.set_layout);
  const feature_id = useTimeSeriesStore((state) => state.feature_id);
  const loading = useTimeSeriesStore((state) => state.loading);
  const setLoading = useTimeSeriesStore((state) => state.set_loading);
  const reset = useTimeSeriesStore((state) => state.reset);
  const [loadingText, setLoadingText] = useState('');

  const availableModelsList = useS3DataStreamBucketStore((state) => state.models);
  const availableDatesList = useS3DataStreamBucketStore((state) => state.dates);
  const availableForecastList = useS3DataStreamBucketStore((state) => state.forecasts);
  const availableCyclesList = useS3DataStreamBucketStore((state) => state.cycles);
  const availableEnsembleList = useS3DataStreamBucketStore((state) => state.ensembles);
  const availableOutputFiles = useS3DataStreamBucketStore((state) => state.outputFiles);
  
  const set_prefix = useS3DataStreamBucketStore((state) => state.set_prefix);

  const setForecastOptions = useS3DataStreamBucketStore((state) => state.set_forecasts);
  const setAvailableDatesList = useS3DataStreamBucketStore((state) => state.set_dates);
  const setAvailableCyclesList = useS3DataStreamBucketStore((state) => state.set_cycles);
  const setAvailableEnsembleList = useS3DataStreamBucketStore((state) => state.set_ensembles);
  const setAvailableOutputFiles = useS3DataStreamBucketStore((state) => state.set_outputFiles);

  const set_feature_ids = useVPUStore((state) => state.set_feature_ids);

  const handleLoading = (text) => {
    setLoading(true);
    setLoadingText(text);
  };

  const handleSuccess = () => {
    setLoading(false);
    setLoadingText('');
  };

  const handleError = (text) => {
    toast.error(text, { autoClose: 1000 });
    setLoading(false);
    setLoadingText('');
  };

  const firstOpt = (v) => (Array.isArray(v) ? v[0] : v);

  const handleVisulization = async () => {
    if (!feature_id || !vpu) {
      handleError('Please select a feature on the map first');
      return;
    }
    if(!outputFile){
      handleError('No Output File selected');
      return;
    }

    if (loading){
      toast.info('Data is already loading, please wait...', { autoClose: 300});
      return
    }
    
    handleLoading('Loading Datastream Data'); 
    const toastId = toast.loading(`DataMenu - Loading data for id: ${feature_id}...`, {
      closeOnClick: false,
      draggable: false,
    });
    try{
      const cacheKey = getCacheKey(
        model,
        date,
        forecast,
        cycle,
        ensemble,
        vpu,
        outputFile
      );
      set_cache_key(cacheKey);
      const _prefix = makePrefix(model, date, forecast, cycle, ensemble, vpu, outputFile);
      set_prefix(_prefix);
      const vpu_gpkg = makeGpkgUrl(vpu);      
      const id = feature_id.split('-')[1];
      const tableExists = await checkForTable(cacheKey);
      if (!tableExists) {
        // await loadVpuData(model, date, forecast, cycle, ensemble, vpu, outputFile, vpu_gpkg);
        await loadVpuData(cacheKey, _prefix, vpu_gpkg);
        const featureIDs = await getFeatureIDs(cacheKey);
        set_feature_ids(featureIDs);
      } else {
        console.log(`Table ${cacheKey} already exists.`);
      }
    
      const variables = await getVariables({cacheKey});
      const _variable = variable ? variable : variables[0];
      const series = await getTimeseries(id, cacheKey, _variable);
      const xy = series.map((d) => ({
        x: new Date(d.time),
        y: d[variables[0]],
       }));
      const textToast = `Loaded ${xy.length} data points for id: ${feature_id}`;
      set_variables(variables);
      set_series(xy);
      set_variable(_variable);
      set_layout({
        'yaxis': _variable,
        'xaxis': "Time",
        'title': makeTitle(forecast, feature_id),
      });
      toast.update(toastId, {
        render: `${textToast}`,
        type: 'success',
        isLoading: false,
        autoClose: 300,
        closeOnClick: true,
      });     

      handleSuccess();
      
    } catch (err) {
      console.error(err);
      toast.update(toastId, {
        render: `Failed to load data for id: ${feature_id}`,
        type: 'error',
        isLoading: false,
        autoClose: 500,
        closeOnClick: true,
      });
      
      handleError('Error loading datastream data');
    }

  };


  const handleChangeModel = async (v) => {
    const opt = firstOpt(v)
    if (opt) set_model(opt.value);
    const options = await getOptionsFromURL(`outputs/${opt.value}/v2.2_hydrofabric/`);
    setAvailableDatesList(options);
    set_date(options[0]?.value);
    setAvailableOutputFiles([]);
    setAvailableEnsembleList([]);
    setAvailableCyclesList([]);
    setForecastOptions([]);
    set_forecast('');
    set_cycle('');
    set_ensemble('');
    set_outputFile('');
  };

  const handleChangeDate = async (v) => {
    const opt = firstOpt(v);
    if (opt) set_date(opt.value); 
    const options = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/${opt.value}/`);
    setForecastOptions(options);
    set_forecast(options[0]?.value);
    setAvailableEnsembleList([]);
    setAvailableCyclesList([]);
    setAvailableOutputFiles([]);
    set_cycle('');
    set_ensemble('');
    set_outputFile('');
  };

  const handleChangeForecast = async (v) => {
    const opt = firstOpt(v);
    if (opt) set_forecast(opt.value);
    const options = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/`);
    setAvailableCyclesList(options);
    set_cycle(options[0]?.value);
    if (opt.value === 'medium_range') {
      const ensembleOptions = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/${options[0]?.value}/`);
      setAvailableEnsembleList(ensembleOptions);
      set_ensemble(ensembleOptions[0]?.value); 
      const outputFileOptions = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/${options[0]?.value}/${ensembleOptions[0]?.value}/${vpu}/ngen-run/outputs/troute/`);
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value);
    }
    else{
      setAvailableEnsembleList([]);
      set_ensemble('');
      const outputFileOptions = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/${options[0]?.value}/${vpu}/ngen-run/outputs/troute/`);
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value);
    }

  };

  const handleChangeCycle = async (v) => {
    const opt = firstOpt(v);
    if (opt) set_cycle(opt.value);
    if(forecast =='medium_range'){
      const options = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/`);
      setAvailableEnsembleList(options);
      set_ensemble(options[0]?.value);
      const outputFileOptions = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/${options[0]?.value}/${vpu}/ngen-run/outputs/troute/`);
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value);
    }
    else{
      const outputFileOptions = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/${vpu}/ngen-run/outputs/troute/`);
      setAvailableEnsembleList([]);
      set_ensemble('');
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value);
    }
  };

  const handleChangeEnsemble = async(v) => {
    const opt =firstOpt(v)
    if (opt) set_ensemble(opt.value);
    const options = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/${vpu}/ngen-run/outputs/troute/`);
    setAvailableOutputFiles(options);
    set_outputFile(options[0]?.value);
  };

  const handleChangeOutputFile = (v) => {
    const opt = firstOpt(v)
    if (opt) set_outputFile(opt.value);
  };

  const handleChangeVariable = async (optionArray) => {
    const opt = optionArray?.[0];
    if (opt) set_variable(opt.value);
    const id = feature_id.split('-')[1]; 
    const series = await getTimeseries(id, cacheKey, opt.value);
    const xy = series.map((d) => ({
      x: new Date(d.time),
      y: d[opt.value],
      }));
    set_series(xy);
    set_layout({
      'yaxis': opt.value,
      'xaxis': "Time",
      'title': makeTitle(forecast, feature_id),
    });

  };

  const availableVariablesList = useMemo(() => {
    return variables.map((v) => ({ value: v, label: v }));
  }, [variables]);

  const selectedDateOption = useMemo(
    () =>
      availableDatesList.find((opt) => opt.value === date) ??
      availableDatesList[0] ??
      null,
    [date, availableDatesList]
  );

  const selectedForecastOption = useMemo(
    () =>
      availableForecastList.find((opt) => opt.value === forecast) ??
      availableForecastList[0] ??
      null,
    [forecast, availableForecastList]
  );

  const selectedModelOption = useMemo(
    () =>
      availableModelsList.find((opt) => opt.value === model) ??
      availableModelsList[0] ??
      null,
    [model, availableModelsList]
  );

  const selectedCycleOption = useMemo(() => {    
    return availableCyclesList.find((opt) => opt.value === cycle) ??
    availableCyclesList[0] ??
    null
  }, [availableCyclesList, cycle]);

  const selectedEnsembleOption = useMemo(() => {
    return availableEnsembleList.find((opt) => opt.value === ensemble) ??
    availableEnsembleList[0] ??
    null
  }, [availableEnsembleList, ensemble]);

  const selectedOutputFileOption = useMemo(() => {
    return availableOutputFiles.find((opt) => opt.value === outputFile) ??
    availableOutputFiles[0] ??
    null
  }, [availableOutputFiles, outputFile]);

  const selectedVariableOption = useMemo(() => {
    const opts = availableVariablesList || [];
    return opts.find((opt) => opt.value === variable) ?? null;
  }
  , [variables, variable]);

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
    }
    fetchInitialData();

  }, [vpu]);

  return (
    <Fragment>
      <Fragment>
        {
         availableModelsList.length > 0 && (
        <Row>
          <IconLabel> <ModelIcon/> Model </IconLabel>
          <SelectComponent
            optionsList={availableModelsList}
            value={selectedModelOption}
            onChangeHandler={handleChangeModel}
          />
        </Row>
 
         ) 
        }
       {
          availableDatesList.length > 0 && (
           <Row>
            <IconLabel> <DateIcon/> Date </IconLabel>
            <SelectComponent
              optionsList={availableDatesList}
              value={selectedDateOption}
              onChangeHandler={handleChangeDate}
            />
          </Row>
 
          )
        }
       {availableForecastList?.length > 0 && (
          <Row>
            <IconLabel> <ForecastIcon/>Forecast</IconLabel>
            <SelectComponent
              optionsList={availableForecastList}
              value={selectedForecastOption}
              onChangeHandler={handleChangeForecast}
            />
          </Row>
        )}  
        {availableCyclesList?.length > 0 && (
          <Row>
            <IconLabel> <CycleIcon/> Cycle</IconLabel>
            <SelectComponent
              optionsList={availableCyclesList}
              value={selectedCycleOption}
              onChangeHandler={handleChangeCycle}
            />
          </Row>
        )}

        {availableEnsembleList?.length > 0 && (
          <Row>
            <IconLabel> <EnsembleIcon/> Ensembles</IconLabel>
            <SelectComponent
              optionsList={availableEnsembleList}
              value={selectedEnsembleOption}
              onChangeHandler={handleChangeEnsemble}
            />
          </Row>
        )}
        {
            availableOutputFiles.length > 0 ? (
            <Row>
                <IconLabel> Output File</IconLabel>
                <SelectComponent
                optionsList={availableOutputFiles}
                value={selectedOutputFileOption}
                onChangeHandler={handleChangeOutputFile}
                />
            </Row>
            ) :  <p> No Outputs Available</p>
        }
        <div style={{marginTop: '10px', paddingLeft: '100px', paddingRight: '100px'}}>
          <XButton onClick={handleVisulization}>Update</XButton>
        </div>
      </Fragment>

        { availableVariablesList.length > 0 && (
          <Row>
            <IconLabel> <VariableIcon /> Variable</IconLabel>
            <SelectComponent
              optionsList={availableVariablesList}
              value={selectedVariableOption}
              onChangeHandler={handleChangeVariable}
            />
          </Row>
        )}

      <LoadingMessage>
        {loading && (
          <>
            <Spinner
              as="span"
              size="sm"
              animation="border"
              role="status"
              aria-hidden="true"
            />
            &nbsp; {loadingText}
          </>
        )}
      </LoadingMessage>
      <Fragment>
       
      </Fragment>
    </Fragment>
  );
}

