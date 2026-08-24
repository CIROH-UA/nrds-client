// DataMenu.js
import React, { Fragment, useMemo, useRef, useState } from 'react';
import { abandonSelectionWithNoOutput } from 'features/DataStream/actions/noOutputFile';
import { XButton, Row, IconLabel, Notice, PanelSectionHeading } from '../styles/Styles';
import SelectComponent from '../SelectComponent';
import { getOptionsFromURL, readableDatesNewestFirst, makePrefix } from 'features/DataStream/lib/s3Utils';
import { getCacheKey } from 'features/DataStream/lib/utils';
import { loadVpu } from 'features/DataStream/actions/loadVpu';
import { beginSelection, isCurrentSelection } from 'features/DataStream/actions/selectionGeneration';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { useShallow } from 'zustand/react/shallow';
import {
  FileIcon
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

export const DataMenuControls = React.memo(function DataMenuControls() {
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
  const { selected_feature_id } = useFeatureStore(
    useShallow((s) => ({
      selected_feature_id: s.selected_feature ? s.selected_feature._id : null,
    }))
  );
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

  const chainsRunning = useRef(0);
  const [selecting, setSelecting] = useState(false);

  /**
   * Run one selection chain: claim it, show the controls as working, and hand the chain its
   * number so it can check before every write.
   *
   * Counted rather than a boolean, following beginLoading/endLoading in actions/loadState.js.
   * A chain that has been superseded still runs to its finally, so a boolean set by whichever
   * chain happens to end first would clear the spinner while another was still going -- and a
   * chain cancelled by a vpu change would leave it stuck on forever, since no later chain
   * arrives to clear it.
   */
  const runSelection = useEvent(async (chain) => {
    const selection = beginSelection();
    chainsRunning.current += 1;
    setSelecting(true);
    try {
      await chain(selection);
    } finally {
      chainsRunning.current -= 1;
      if (chainsRunning.current === 0) setSelecting(false);
    }
  });

  /**
   * Apply an output-file listing, and stop showing stale data when it is empty.
   *
   * An empty listing means nothing in this selection can be read, and pressing Update cannot
   * change that. Without clearing here, the flowpath animation and chart from the previous
   * output file stayed on screen indefinitely, presented as if they belonged to the selection
   * now showing in the controls. The selection itself is left alone: the panel is only open
   * because a feature is selected, so resetting that would close it mid-interaction.
   *
   * The cache key goes too. Clearing the animation and the chart was not enough, because the
   * previous output file's table outlives the selection that loaded it: with the key still
   * naming that table, the next catchment click charted it again, titled with the forecast now
   * showing in the controls. A selection with nothing to read has no key.
   */
  const applyOutputFiles = useEvent((options) => {
    setAvailableOutputFiles(options);
    set_outputFile(options[0]?.value ?? '');
    if (options.length) return;

    abandonSelectionWithNoOutput();
  });

  const handleVisulization = useEvent(async () => {
    const { loading, set_loading_text } = useTimeSeriesStore.getState();
    set_loading_text('');
    if (!selected_feature_id || !vpu) {
      useTimeSeriesStore.setState({
        loadingText: 'Select a feature on the map first',
        last_error: { kind: 'no-selection' },
      });
      return;
    }
    if (!outputFile) {
      useTimeSeriesStore.setState({
        loadingText: 'This model run has no output file to read',
        last_error: { kind: 'no-output-file' },
      });
      return;
    }
    if (loading) {
      set_loading_text('Data is already loading, please wait');
      return;
    }
    const cacheKey = getCacheKey(model, date, forecast, cycle, ensemble, vpu, outputFile);
    set_cache_key(cacheKey);

    const _prefix = makePrefix(model, date, forecast, cycle, ensemble, vpu, outputFile);
    set_prefix(_prefix);

    await loadVpu();
  });

  const handleChangeModel = useEvent(async (v) => {
    const opt = firstOpt(v);
    if (!opt) return;

    set_model(opt.value);

    await runSelection(async (selection) => {
      const datesOptions = await readableDatesNewestFirst(opt.value);
      if (!isCurrentSelection(selection)) return;
      const nextDate = datesOptions[0]?.value ?? '';
      setAvailableDatesList(datesOptions);
      set_date(nextDate);


      const forecastOptions = await getOptionsFromURL(`outputs/${opt.value}/v2.2_hydrofabric/${nextDate}/`);
      if (!isCurrentSelection(selection)) return;
      const nextForecast = forecastOptions[0]?.value ?? '';    
      setForecastOptions(forecastOptions);
      set_forecast(nextForecast);

      const cycleOptions = await getOptionsFromURL(
        `outputs/${opt.value}/v2.2_hydrofabric/${nextDate}/${nextForecast}/`
      );
      if (!isCurrentSelection(selection)) return;
      setAvailableCyclesList(cycleOptions);

      const nextCycle = cycleOptions[0]?.value ?? '';
      set_cycle(nextCycle);

      if (nextForecast === 'medium_range') {
        const ensembleOptions = await getOptionsFromURL(
          `outputs/${opt.value}/v2.2_hydrofabric/${nextDate}/${nextForecast}/${nextCycle}/`
        );
        if (!isCurrentSelection(selection)) return;
        setAvailableEnsembleList(ensembleOptions);
        const nextEns = ensembleOptions[0]?.value ?? '';
        set_ensemble(nextEns);

        const outputFileOptions = await getOptionsFromURL(
          `outputs/${opt.value}/v2.2_hydrofabric/${nextDate}/${nextForecast}/${nextCycle}/${nextEns}/${vpu}/ngen-run/outputs/troute/`
        );
        if (!isCurrentSelection(selection)) return;
        applyOutputFiles(outputFileOptions);
      } else {
        setAvailableEnsembleList([]);
        set_ensemble('');

        const outputFileOptions = await getOptionsFromURL(
          `outputs/${opt.value}/v2.2_hydrofabric/${nextDate}/${nextForecast}/${nextCycle}/${vpu}/ngen-run/outputs/troute/`
        );
        if (!isCurrentSelection(selection)) return;
        applyOutputFiles(outputFileOptions);
      }
    });
  });

  const handleChangeDate = useEvent(async (v) => {
    const opt = firstOpt(v);
    if (!opt) return;

    set_date(opt.value);

    await runSelection(async (selection) => {
      const forecastOptions = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/${opt.value}/`);
      if (!isCurrentSelection(selection)) return;
      const nextForecast = forecastOptions[0]?.value ?? '';    
      setForecastOptions(forecastOptions);
      set_forecast(nextForecast);

      const cycleOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${opt.value}/${nextForecast}/`
      );
      if (!isCurrentSelection(selection)) return;
      setAvailableCyclesList(cycleOptions);

      const nextCycle = cycleOptions[0]?.value ?? '';
      set_cycle(nextCycle);

      if (nextForecast === 'medium_range') {
        const ensembleOptions = await getOptionsFromURL(
          `outputs/${model}/v2.2_hydrofabric/${opt.value}/${nextForecast}/${nextCycle}/`
        );
        if (!isCurrentSelection(selection)) return;
        setAvailableEnsembleList(ensembleOptions);
        const nextEns = ensembleOptions[0]?.value ?? '';
        set_ensemble(nextEns);

        const outputFileOptions = await getOptionsFromURL(
          `outputs/${model}/v2.2_hydrofabric/${opt.value}/${nextForecast}/${nextCycle}/${nextEns}/${vpu}/ngen-run/outputs/troute/`
        );
        if (!isCurrentSelection(selection)) return;
        applyOutputFiles(outputFileOptions);
      } else {
        setAvailableEnsembleList([]);
        set_ensemble('');

        const outputFileOptions = await getOptionsFromURL(
          `outputs/${model}/v2.2_hydrofabric/${opt.value}/${nextForecast}/${nextCycle}/${vpu}/ngen-run/outputs/troute/`
        );
        if (!isCurrentSelection(selection)) return;
        applyOutputFiles(outputFileOptions);
      }
    });
  });

  const handleChangeForecast = useEvent(async (v) => {
    const opt = firstOpt(v);
    if (!opt) return;

    set_forecast(opt.value);

    await runSelection(async (selection) => {
      const cycleOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/`
      );
      if (!isCurrentSelection(selection)) return;
      setAvailableCyclesList(cycleOptions);
      const nextCycle = cycleOptions[0]?.value ?? '';
      set_cycle(nextCycle);

      if (opt.value === 'medium_range') {
        const ensembleOptions = await getOptionsFromURL(
          `outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/${nextCycle}/`
        );
        if (!isCurrentSelection(selection)) return;
        setAvailableEnsembleList(ensembleOptions);
        const nextEns = ensembleOptions[0]?.value ?? '';
        set_ensemble(nextEns);

        const outputFileOptions = await getOptionsFromURL(
          `outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/${nextCycle}/${nextEns}/${vpu}/ngen-run/outputs/troute/`
        );
        if (!isCurrentSelection(selection)) return;
        applyOutputFiles(outputFileOptions);
      } else {
        setAvailableEnsembleList([]);
        set_ensemble('');

        const outputFileOptions = await getOptionsFromURL(
          `outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/${nextCycle}/${vpu}/ngen-run/outputs/troute/`
        );
        if (!isCurrentSelection(selection)) return;
        applyOutputFiles(outputFileOptions);
      }
    });
  });

  const handleChangeCycle = useEvent(async (v) => {
    const opt = firstOpt(v);
    if (!opt) return;

    set_cycle(opt.value);

    await runSelection(async (selection) => {
      if (forecast === 'medium_range') {
        const ensembleOptions = await getOptionsFromURL(
          `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/`
        );
        if (!isCurrentSelection(selection)) return;
        setAvailableEnsembleList(ensembleOptions);
        const nextEns = ensembleOptions[0]?.value ?? '';
        set_ensemble(nextEns);

        const outputFileOptions = await getOptionsFromURL(
          `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/${nextEns}/${vpu}/ngen-run/outputs/troute/`
        );
        if (!isCurrentSelection(selection)) return;
        applyOutputFiles(outputFileOptions);
      } else {
        setAvailableEnsembleList([]);
        set_ensemble('');

        const outputFileOptions = await getOptionsFromURL(
          `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/${vpu}/ngen-run/outputs/troute/`
        );
        if (!isCurrentSelection(selection)) return;
        applyOutputFiles(outputFileOptions);
      }
    });
  });

  const handleChangeEnsemble = useEvent(async (v) => {
    const opt = firstOpt(v);
    if (!opt) return;

    set_ensemble(opt.value);

    await runSelection(async (selection) => {
      const outputFileOptions = await getOptionsFromURL(
        `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${cycle}/${opt.value}/${vpu}/ngen-run/outputs/troute/`
      );
      if (!isCurrentSelection(selection)) return;
      applyOutputFiles(outputFileOptions);
    });
  });

  const handleChangeOutputFile = useEvent((v) => {
    const opt = firstOpt(v);
    if (!opt) return;
    set_outputFile(opt.value);
  });

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
            Model
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
            Date
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
            Forecast
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
            Cycle
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
            Ensembles
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
        label: (
          <>
            Output File
          </>
        ),
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

  const selectionTitle = selecting
    ? 'Still reading this selection'
    : (outputFile ? 'Load this selection' : 'No output file to load');

  return (
    <Fragment>
      <PanelSectionHeading>Change the run</PanelSectionHeading>

      {rows.map((r) => (
        <Row key={r.key}>
          <IconLabel as="label" htmlFor={`select-${r.key}`}>{r.label}</IconLabel>
          <SelectComponent
            inputId={`select-${r.key}`}
            optionsList={r.options}
            value={r.value}
            onChangeHandler={r.onChange}
            isLoading={selecting}
          />
        </Row>
      ))}

      {availableOutputFiles?.length > 0 ? null : (
        <Notice role="alert">
          <FileIcon aria-hidden="true" />
          <span>No output file for this selection</span>
        </Notice>
      )}

      <div style={{ marginTop: '10px' }}>
        <XButton
          onClick={handleVisulization}
          disabled={selecting || !outputFile}
          title={selectionTitle}
        >
          Update
        </XButton>
      </div>
    </Fragment>
  );
});


function DataMenu() {
  return <DataMenuControls />;
}

export default React.memo(DataMenu);
