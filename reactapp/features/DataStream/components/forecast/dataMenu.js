// DataMenu.js
import React, { Fragment, useMemo } from 'react';
import { Spinner } from 'react-bootstrap';
import { XButton, LoadingMessage, Row, IconLabel } from '../styles/Styles';
import SelectComponent from '../SelectComponent';
import { getOptionsFromURL, makePrefix } from 'features/DataStream/lib/s3Utils';
import { getCacheKey } from 'features/DataStream/lib/opfsCache';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import { useShallow } from 'zustand/react/shallow';
import {
  ModelIcon,
  DateIcon,
  ForecastIcon,
  CycleIcon,
  EnsembleIcon,
} from 'features/DataStream/lib/layers';

// -------------------- helpers --------------------
const firstOpt = (v) => (Array.isArray(v) ? v[0] : v);

function useEvent(fn) {
  const ref = React.useRef(fn);
  React.useLayoutEffect(() => {
    ref.current = fn;
  });
  return React.useCallback((...args) => ref.current(...args), []);
}

// -------------------- loading-only subcomponent --------------------
const DataMenuLoading = React.memo(function DataMenuLoading() {
  const { loading, loadingText } = useTimeSeriesStore(
    useShallow((s) => ({
      loading: s.loading,
      loadingText: s.loadingText,
    }))
  );

  return (
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
  );
});

// -------------------- controls-only subcomponent --------------------
const DataMenuControls = React.memo(function DataMenuControls() {
  const { vpu, date, forecast, ensemble, cycle, model, outputFile } =
    useDataStreamStore(
      useShallow((state) => ({
        vpu: state.vpu,
        date: state.date,
        forecast: state.forecast,
        ensemble: state.ensemble,
        cycle: state.cycle,
        model: state.model,
        outputFile: state.outputFile,
      }))
    );

  // setters
  const {
    set_date,
    set_forecast,
    set_ensemble,
    set_cycle,
    set_model,
    set_outputFile,
    set_cache_key,
  } = useDataStreamStore(
    useShallow((state) => ({
      set_date: state.set_date,
      set_forecast: state.set_forecast,
      set_ensemble: state.set_ensemble,
      set_cycle: state.set_cycle,
      set_model: state.set_model,
      set_outputFile: state.set_outputFile,
      set_cache_key: state.set_cache_key,
    }))
  );

  const feature_id = useTimeSeriesStore((s) => s.feature_id);

  // s3 available lists
  const {
    availableModelsList,
    availableDatesList,
    availableForecastList,
    availableCyclesList,
    availableEnsembleList,
    availableOutputFiles,
  } = useS3DataStreamBucketStore(
    useShallow((state) => ({
      availableModelsList: state.models,
      availableDatesList: state.dates,
      availableForecastList: state.forecasts,
      availableCyclesList: state.cycles,
      availableEnsembleList: state.ensembles,
      availableOutputFiles: state.outputFiles,
    }))
  );

  // s3 setters
  const {
    set_prefix,
    setForecastOptions,
    setAvailableDatesList,
    setAvailableCyclesList,
    setAvailableEnsembleList,
    setAvailableOutputFiles,
  } = useS3DataStreamBucketStore(
    useShallow((state) => ({
      set_prefix: state.set_prefix,
      setForecastOptions: state.set_forecasts,
      setAvailableDatesList: state.set_dates,
      setAvailableCyclesList: state.set_cycles,
      setAvailableEnsembleList: state.set_ensembles,
      setAvailableOutputFiles: state.set_outputFiles,
    }))
  );

  // -------------------- stable handlers (no stale closures) --------------------
  const handleVisulization = useEvent(async () => {
    const { loading, set_loading_text } = useTimeSeriesStore.getState();
    if (!feature_id || !vpu) {
      set_loading_text('Please select a feature on the map first');
      set_loading_text('');
      return;
    }
    if (!outputFile) {
      set_loading_text('No Output File selected');
      set_loading_text('');
      return;
    }
    if (loading) {
      set_loading_text('Data is already loading, please wait...');
      set_loading_text('');
      return;
    }

    const cacheKey = getCacheKey(model, date, forecast, cycle, ensemble, vpu, outputFile);
    set_cache_key(cacheKey);

    const _prefix = makePrefix(model, date, forecast, cycle, ensemble, vpu, outputFile);
    set_prefix(_prefix);
  });

  const handleChangeModel = useEvent(async (v) => {
    const opt = firstOpt(v);
    if (!opt) return;

    set_model(opt.value);

    const datesOptions = await getOptionsFromURL(`outputs/${opt.value}/v2.2_hydrofabric/`);
    const nextDate = datesOptions[0]?.value ?? '';
    setAvailableDatesList(datesOptions);
    set_date(nextDate);


    const forecastOptions = await getOptionsFromURL(`outputs/${opt.value}/v2.2_hydrofabric/${nextDate}/`);
    const nextForecast = forecastOptions[0]?.value ?? '';    
    setForecastOptions(forecastOptions);
    set_forecast(nextForecast);

    const cycleOptions = await getOptionsFromURL(
      `outputs/${opt.value}/v2.2_hydrofabric/${nextDate}/${nextForecast}/`
    );
    setAvailableCyclesList(cycleOptions);

    const nextCycle = cycleOptions[0]?.value ?? '';
    set_cycle(nextCycle);

    if (nextForecast === 'medium_range') {
      const ensembleOptions = await getOptionsFromURL(
        `outputs/${opt.value}/v2.2_hydrofabric/${nextDate}/${nextForecast}/${nextCycle}/`
      );
      setAvailableEnsembleList(ensembleOptions);
      const nextEns = ensembleOptions[0]?.value ?? '';
      set_ensemble(nextEns);

      const outputFileOptions = await getOptionsFromURL(
        `outputs/${opt.value}/v2.2_hydrofabric/${nextDate}/${nextForecast}/${nextCycle}/${nextEns}/${vpu}/ngen-run/outputs/troute/`
      );
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value ?? '');
    } else {
      setAvailableEnsembleList([]);
      set_ensemble('');

      const outputFileOptions = await getOptionsFromURL(
        `outputs/${opt.value}/v2.2_hydrofabric/${nextDate}/${nextForecast}/${nextCycle}/${vpu}/ngen-run/outputs/troute/`
      );
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value ?? '');
    }

  });

  const handleChangeDate = useEvent(async (v) => {
    const opt = firstOpt(v);
    if (!opt) return;

    set_date(opt.value);

    const forecastOptions = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/${opt.value}/`);
    const nextForecast = forecastOptions[0]?.value ?? '';    
    setForecastOptions(forecastOptions);
    set_forecast(nextForecast);

    const cycleOptions = await getOptionsFromURL(
      `outputs/${model}/v2.2_hydrofabric/${opt.value}/${nextForecast}/`
    );
    setAvailableCyclesList(cycleOptions);

    const nextCycle = cycleOptions[0]?.value ?? '';
    set_cycle(nextCycle);

    if (nextForecast === 'medium_range') {
      const ensembleOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${opt.value}/${nextForecast}/${nextCycle}/`
      );
      setAvailableEnsembleList(ensembleOptions);
      const nextEns = ensembleOptions[0]?.value ?? '';
      set_ensemble(nextEns);

      const outputFileOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${opt.value}/${nextForecast}/${nextCycle}/${nextEns}/${vpu}/ngen-run/outputs/troute/`
      );
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value ?? '');
    } else {
      setAvailableEnsembleList([]);
      set_ensemble('');

      const outputFileOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${opt.value}/${nextForecast}/${nextCycle}/${vpu}/ngen-run/outputs/troute/`
      );
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value ?? '');
    }

  });

  const handleChangeForecast = useEvent(async (v) => {
    const opt = firstOpt(v);
    if (!opt) return;

    set_forecast(opt.value);

    const cycleOptions = await getOptionsFromURL(
      `outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/`
    );
    setAvailableCyclesList(cycleOptions);
    const nextCycle = cycleOptions[0]?.value ?? '';
    set_cycle(nextCycle);

    if (opt.value === 'medium_range') {
      const ensembleOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/${nextCycle}/`
      );
      setAvailableEnsembleList(ensembleOptions);
      const nextEns = ensembleOptions[0]?.value ?? '';
      set_ensemble(nextEns);

      const outputFileOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/${nextCycle}/${nextEns}/${vpu}/ngen-run/outputs/troute/`
      );
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value ?? '');
    } else {
      setAvailableEnsembleList([]);
      set_ensemble('');

      const outputFileOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/${nextCycle}/${vpu}/ngen-run/outputs/troute/`
      );
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value ?? '');
    }
  });

  const handleChangeCycle = useEvent(async (v) => {
    const opt = firstOpt(v);
    if (!opt) return;

    set_cycle(opt.value);

    if (forecast === 'medium_range') {
      const ensembleOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/`
      );
      setAvailableEnsembleList(ensembleOptions);
      const nextEns = ensembleOptions[0]?.value ?? '';
      set_ensemble(nextEns);

      const outputFileOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/${nextEns}/${vpu}/ngen-run/outputs/troute/`
      );
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value ?? '');
    } else {
      setAvailableEnsembleList([]);
      set_ensemble('');

      const outputFileOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/${vpu}/ngen-run/outputs/troute/`
      );
      setAvailableOutputFiles(outputFileOptions);
      set_outputFile(outputFileOptions[0]?.value ?? '');
    }
  });

  const handleChangeEnsemble = useEvent(async (v) => {
    const opt = firstOpt(v);
    if (!opt) return;

    set_ensemble(opt.value);

    const outputFileOptions = await getOptionsFromURL(
      `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${cycle}/${opt.value}/${vpu}/ngen-run/outputs/troute/`
    );
    setAvailableOutputFiles(outputFileOptions);
    set_outputFile(outputFileOptions[0]?.value ?? '');
  });

  const handleChangeOutputFile = useEvent((v) => {
    const opt = firstOpt(v);
    if (!opt) return;
    set_outputFile(opt.value);
  });

  // -------------------- selected values --------------------
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

  const selectedCycleOption = useMemo(
    () =>
      availableCyclesList.find((opt) => opt.value === cycle) ??
      availableCyclesList[0] ??
      null,
    [availableCyclesList, cycle]
  );

  const selectedEnsembleOption = useMemo(
    () =>
      availableEnsembleList.find((opt) => opt.value === ensemble) ??
      availableEnsembleList[0] ??
      null,
    [availableEnsembleList, ensemble]
  );

  const selectedOutputFileOption = useMemo(
    () =>
      availableOutputFiles.find((opt) => opt.value === outputFile) ??
      availableOutputFiles[0] ??
      null,
    [availableOutputFiles, outputFile]
  );

  const rows = useMemo(() => {
    const out = [];

    if (availableModelsList?.length > 0) {
      out.push({
        key: 'model',
        label: (
          <>
            <ModelIcon /> Model
          </>
        ),
        options: availableModelsList,
        value: selectedModelOption,
        onChange: handleChangeModel,
      });
    }

    if (availableDatesList?.length > 0) {
      out.push({
        key: 'date',
        label: (
          <>
            <DateIcon /> Date
          </>
        ),
        options: availableDatesList,
        value: selectedDateOption,
        onChange: handleChangeDate,
      });
    }

    if (availableForecastList?.length > 0) {
      out.push({
        key: 'forecast',
        label: (
          <>
            <ForecastIcon /> Forecast
          </>
        ),
        options: availableForecastList,
        value: selectedForecastOption,
        onChange: handleChangeForecast,
      });
    }

    if (availableCyclesList?.length > 0) {
      out.push({
        key: 'cycle',
        label: (
          <>
            <CycleIcon /> Cycle
          </>
        ),
        options: availableCyclesList,
        value: selectedCycleOption,
        onChange: handleChangeCycle,
      });
    }

    if (availableEnsembleList?.length > 0) {
      out.push({
        key: 'ensemble',
        label: (
          <>
            <EnsembleIcon /> Ensembles
          </>
        ),
        options: availableEnsembleList,
        value: selectedEnsembleOption,
        onChange: handleChangeEnsemble,
      });
    }

    if (availableOutputFiles?.length > 0) {
      out.push({
        key: 'outputFile',
        label: <>Output File</>,
        options: availableOutputFiles,
        value: selectedOutputFileOption,
        onChange: handleChangeOutputFile,
      });
    }

    return out;
  }, [
    availableModelsList,
    availableDatesList,
    availableForecastList,
    availableCyclesList,
    availableEnsembleList,
    availableOutputFiles,
    selectedModelOption,
    selectedDateOption,
    selectedForecastOption,
    selectedCycleOption,
    selectedEnsembleOption,
    selectedOutputFileOption,
    handleChangeModel,
    handleChangeDate,
    handleChangeForecast,
    handleChangeCycle,
    handleChangeEnsemble,
    handleChangeOutputFile,
  ]);

  return (
    <Fragment>
      {rows.map((r) => (
        <Row key={r.key}>
          <IconLabel>{r.label}</IconLabel>
          <SelectComponent
            optionsList={r.options}
            value={r.value}
            onChangeHandler={r.onChange}
          />
        </Row>
      ))}

      {availableOutputFiles?.length > 0 ? null : <p>No Outputs Available</p>}

      <div style={{ marginTop: '10px', paddingLeft: '100px', paddingRight: '100px' }}>
        <XButton onClick={handleVisulization}>Update</XButton>
      </div>
    </Fragment>
  );
});


function DataMenu() {
  return (
    <>
      <DataMenuControls />
      <DataMenuLoading />
    </>
  );
}

DataMenu.whyDidYouRender = true;
export default React.memo(DataMenu);
