import React, { useMemo, Fragment } from 'react';
import { Spinner } from 'react-bootstrap';
import { XButton, LoadingMessage, Row, IconLabel } from '../styles/Styles';
import SelectComponent from '../SelectComponent';
import {getOptionsFromURL, makePrefix } from 'features/DataStream/lib/s3Utils';
import { getCacheKey } from 'features/DataStream/lib/opfsCache';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import {
  ModelIcon,
  DateIcon,
  ForecastIcon,
  CycleIcon,
  EnsembleIcon,
} from 'features/DataStream/lib/layers';

export default function DataMenu() {

  const vpu = useDataStreamStore((state) => state.vpu);
  const date = useDataStreamStore((state) => state.date);
  const forecast = useDataStreamStore((state) => state.forecast);
  const ensemble = useDataStreamStore((state) => state.ensemble);
  const cycle = useDataStreamStore((state) => state.cycle);
  const variables = useDataStreamStore((state) => state.variables);
  const model = useDataStreamStore((state) => state.model);
  const outputFile = useDataStreamStore((state) => state.outputFile);

  const set_date = useDataStreamStore((state) => state.set_date);
  const set_forecast = useDataStreamStore((state) => state.set_forecast);
  const set_ensemble = useDataStreamStore((state) => state.set_ensemble);
  const set_cycle = useDataStreamStore((state) => state.set_cycle);
  const set_model = useDataStreamStore((state) => state.set_model);
  const set_outputFile = useDataStreamStore((state) => state.set_outputFile);
  const set_cache_key = useDataStreamStore((state) => state.set_cache_key);
  
  const feature_id = useTimeSeriesStore((state) => state.feature_id);
  const loading = useTimeSeriesStore((state) => state.loading);
  const loadingText = useTimeSeriesStore((state) => state.loadingText);
  const setLoadingText = useTimeSeriesStore((state) => state.set_loading_text);

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

  const firstOpt = (v) => (Array.isArray(v) ? v[0] : v);

  const handleVisulization = async () => {
    if (!feature_id || !vpu) {
      setLoadingText('Please select a feature on the map first');
      setLoadingText('');
      return;
    }
    if(!outputFile){
      setLoadingText('No Output File selected');
      setLoadingText('');
      return;
    }

    if (loading){
      setLoadingText('Data is already loading, please wait...');
      setLoadingText('');
      return
    }
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

