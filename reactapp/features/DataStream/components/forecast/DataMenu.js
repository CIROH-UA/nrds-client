import React, { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { Spinner } from 'react-bootstrap';
import { XButton, LoadingMessage, Row, IconLabel } from '../styles/Styles';
import SelectComponent from '../SelectComponent';
import Breadcrumb from './Breadcrumb';
import { toast } from 'react-toastify';

import { loadVpuData, getVariables, getTimeseries, checkForTable } from 'features/DataStream/lib/queryData';
import { makeGpkgUrl, getOptionsFromURL } from 'features/DataStream/lib/s3Utils';
import { getCacheKey } from 'features/DataStream/lib/opfsCache';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { makeTitle } from 'features/DataStream/lib/utils';

import { ModelIcon, DateIcon, ForecastIcon, CycleIcon, EnsembleIcon, VariableIcon } from 'features/DataStream/lib/layers';

import {
  firstOpt,
  pickDefault,
  findSelected,
  getStepOrder,
  deriveActiveKey,
  getPathForStep,
} from 'features/DataStream/lib/DataMenu.nav';


const ICONS = {
  model: <ModelIcon />,
  date: <DateIcon />,
  forecast: <ForecastIcon />,
  cycle: <CycleIcon />,
  ensemble: <EnsembleIcon />,
  vpu: <EnsembleIcon />,
  outputFile: <VariableIcon />,
};

const LABELS = {
  model: 'Model',
  date: 'Date',
  forecast: 'Forecast',
  cycle: 'Cycle',
  ensemble: 'Ensemble',
  vpu: 'VPU',
  outputFile: 'Output File',
};

const EMPTY_OPTS = {
  model: [],
  date: [],
  forecast: [],
  cycle: [],
  ensemble: [],
  vpu: [],
  outputFile: [],
};

export default function DataMenu() {

  const vpu = useDataStreamStore((s) => s.vpu);
  const model = useDataStreamStore((s) => s.model);
  const date = useDataStreamStore((s) => s.date);
  const forecast = useDataStreamStore((s) => s.forecast);
  const cycle = useDataStreamStore((s) => s.cycle);
  const ensemble = useDataStreamStore((s) => s.ensemble);
  const variables = useDataStreamStore((s) => s.variables);
  const outputFile = useDataStreamStore((s) => s.outputFile);

  const set_model = useDataStreamStore((s) => s.set_model);
  const set_date = useDataStreamStore((s) => s.set_date);
  const set_forecast = useDataStreamStore((s) => s.set_forecast);
  const set_cycle = useDataStreamStore((s) => s.set_cycle);
  const set_ensemble = useDataStreamStore((s) => s.set_ensemble);
  const set_vpu = useDataStreamStore((s) => s.set_vpu);
  const set_variables = useDataStreamStore((s) => s.set_variables);
  const setOutputFile = useDataStreamStore((s) => s.set_outputFile);

  const variable = useTimeSeriesStore((s) => s.variable);
  const set_variable = useTimeSeriesStore((s) => s.set_variable);
  const set_series = useTimeSeriesStore((s) => s.set_series);
  const set_table = useTimeSeriesStore((s) => s.set_table);
  const set_layout = useTimeSeriesStore((s) => s.set_layout);
  const feature_id = useTimeSeriesStore((s) => s.feature_id);
  const loading = useTimeSeriesStore((s) => s.loading);
  const setLoading = useTimeSeriesStore((s) => s.set_loading);


  const [loadingText, setLoadingText] = useState('');
  // const [outputFile, setOutputFile] = useState(''); 
  const [opts, setOpts] = useState(EMPTY_OPTS);

  const didBootstrapRef = useRef(false);

  const selectionState = useMemo(
    () => ({ model, date, forecast, cycle, ensemble, vpu, outputFile }),
    [model, date, forecast, cycle, ensemble, vpu, outputFile]
  );

  const stepOrder = useMemo(() => getStepOrder(forecast), [forecast]);

  const [activeStepKey, setActiveStepKey] = useState(() =>
    deriveActiveKey({ model, date, forecast, cycle, ensemble, vpu })
  );


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

  const fetchOpts = useCallback(async (path) => {
    const res = await getOptionsFromURL(path);
    return Array.isArray(res) ? res : [];
  }, []);

  const setOpt = useCallback((key, list) => {
    setOpts((prev) => ({ ...prev, [key]: Array.isArray(list) ? list : [] }));
  }, []);

  const clearOptionLists = useCallback((keys) => {
    setOpts((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        if (k === 'model') continue; // never clear model list
        next[k] = [];
      }
      return next;
    });
  }, []);

  const nextAfter = useCallback(
    (order, key) => {
      const idx = order.indexOf(key);
      return order[idx + 1] ?? key;
    },
    []
  );

  /**
   * Reset values + options from a step
   * - includeSelf=false : clears only downstream
   * - includeSelf=true  : clears clicked step + downstream
   */
  const resetFromKey = useCallback(
    (fromKey, { includeSelf = false } = {}) => {
      const idx = stepOrder.indexOf(fromKey);
      if (idx < 0) return;

      const start = includeSelf ? idx : idx + 1;
      const toClear = stepOrder.slice(start);

      // Store values
      if (toClear.includes('model')) set_model('');
      if (toClear.includes('date')) set_date('');
      if (toClear.includes('forecast')) set_forecast('');
      if (toClear.includes('cycle')) set_cycle('');
      if (toClear.includes('ensemble')) set_ensemble(null);
      if (toClear.includes('vpu')) set_vpu('');
      if (toClear.includes('outputFile')) setOutputFile('');

      // Options
      clearOptionLists(toClear);

      // Clear variable selection (optional)
      set_variable?.('');
    },
    [stepOrder, set_model, set_date, set_forecast, set_cycle, set_ensemble, set_vpu, clearOptionLists, set_variable]
  );

  const prefetchOptions = useCallback(
    async (stepKey, s) => {
      const path = getPathForStep(stepKey, s);
      if (!path) return;
      const list = await fetchOpts(path);
      setOpt(stepKey, list);
    },
    [fetchOpts, setOpt]
  );


  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (didBootstrapRef.current) return;
      didBootstrapRef.current = true;

      try {
        // MODEL
        const mOpts = await fetchOpts('outputs/');
        if (cancelled) return;
        setOpt('model', mOpts);

        const mDef = model || pickDefault(mOpts, { index: 0 })?.value || '';
        if (!mDef) return;
        set_model(mDef);

        // DATE
        const dOpts = await fetchOpts(getPathForStep('date', { model: mDef }));
        if (cancelled) return;
        setOpt('date', dOpts);

        const dDef =
          date ||
          pickDefault(dOpts, { index: 1 })?.value ||
          pickDefault(dOpts, { index: 0 })?.value ||
          '';
        if (!dDef) return;
        set_date(dDef);

        // FORECAST
        const fOpts = await fetchOpts(getPathForStep('forecast', { model: mDef, date: dDef }));
        if (cancelled) return;
        setOpt('forecast', fOpts);

        const fDef = forecast || pickDefault(fOpts, { index: 0 })?.value || '';
        if (!fDef) return;
        set_forecast(fDef);

        // CYCLE
        const cOpts = await fetchOpts(getPathForStep('cycle', { model: mDef, date: dDef, forecast: fDef }));
        if (cancelled) return;
        setOpt('cycle', cOpts);

        const cDef = cycle || pickDefault(cOpts, { index: 0 })?.value || '';
        if (!cDef) return;
        set_cycle(cDef);

        // ENSEMBLE (optional)
        let eDef = null;
        if (fDef === 'medium_range') {
          const eOpts = await fetchOpts(
            getPathForStep('ensemble', { model: mDef, date: dDef, forecast: fDef, cycle: cDef })
          );
          if (cancelled) return;
          setOpt('ensemble', eOpts);

          eDef = ensemble || pickDefault(eOpts, { index: 0 })?.value || null;
          if (!eDef) return;
          set_ensemble(eDef);
        } else {
          set_ensemble(null);
          setOpt('ensemble', []);
        }

        // VPU
        const vOpts = await fetchOpts(
          getPathForStep('vpu', { model: mDef, date: dDef, forecast: fDef, cycle: cDef, ensemble: eDef })
        );
        if (cancelled) return;
        setOpt('vpu', vOpts);

        const vDef = vpu || pickDefault(vOpts, { index: 0 })?.value || '';
        if (!vDef) return;
        set_vpu(vDef);

        // OUTPUT FILE
        const oOpts = await fetchOpts(
          getPathForStep('outputFile', { model: mDef, date: dDef, forecast: fDef, cycle: cDef, ensemble: eDef, vpu: vDef })
        );
        if (cancelled) return;
        setOpt('outputFile', oOpts);

        const oDef = pickDefault(oOpts, { index: 0 })?.value || '';
        console.log("oDef", oDef);
        setOutputFile(oDef);

        setActiveStepKey('outputFile');
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    fetchOpts,
    setOpt,
    model,
    date,
    forecast,
    cycle,
    ensemble,
    vpu,
    set_model,
    set_date,
    set_forecast,
    set_cycle,
    set_ensemble,
    set_vpu,
  ]);



  const applySelection = useCallback(
    async (stepKey, value) => {
      if (!value) return;

      // outputFile is local only
      if (stepKey === 'outputFile') {
        setOutputFile(value);
        return;
      }

      // Build the "next" state locally (don’t wait for store updates)
      const sNext = { ...selectionState };

      // Set store value
      if (stepKey === 'model') {
        set_model(value);
        sNext.model = value;
      } else if (stepKey === 'date') {
        set_date(value);
        sNext.date = value;
      } else if (stepKey === 'forecast') {
        set_forecast(value);
        sNext.forecast = value;

        // forecast change always invalidates ensemble
        set_ensemble(null);
        sNext.ensemble = null;
        setOpt('ensemble', []);
      } else if (stepKey === 'cycle') {
        set_cycle(value);
        sNext.cycle = value;
      } else if (stepKey === 'ensemble') {
        set_ensemble(value);
        sNext.ensemble = value;
      } else if (stepKey === 'vpu') {
        set_vpu(value);
        sNext.vpu = value;
      }

      // Reset downstream (exclusive)
      resetFromKey(stepKey, { includeSelf: false });

      // Compute next step order using UPDATED forecast
      const orderNext = getStepOrder(stepKey === 'forecast' ? value : sNext.forecast);
      const nextKey = nextAfter(orderNext, stepKey);

      setActiveStepKey(nextKey);

      // Prefetch next options immediately (prevents empty dropdown)
      await prefetchOptions(nextKey, sNext);

    },
    [
      selectionState,
      set_model,
      set_date,
      set_forecast,
      set_cycle,
      set_ensemble,
      set_vpu,
      setOpt,
      resetFromKey,
      nextAfter,
      prefetchOptions,
    ]
  );

  useEffect(() => {
    const stepKey = activeStepKey;
    const list = opts[stepKey] || [];

    // only do this when we actually have exactly 1 option
    if (list.length !== 1) return;

    const onlyValue = list[0]?.value;
    if (!onlyValue) return;

    const currentValue = selectionState[stepKey]; // works for outputFile too (it’s in selectionState)
    const orderNow = getStepOrder(selectionState.forecast);

    // If already selected, and this isn't the last step, auto-advance
    if (currentValue === onlyValue) {
      const nextKey = nextAfter(orderNow, stepKey);
      if (nextKey !== stepKey && stepKey !== 'outputFile') {
        setActiveStepKey(nextKey);
        // prefetch next so the next dropdown isn't empty
        void prefetchOptions(nextKey, selectionState);
      }
      return;
    }

    // Not selected yet -> select it and continue the normal pipeline
    void applySelection(stepKey, onlyValue);
  }, [
    activeStepKey,
    opts,
    selectionState,
  ]);


  const outputFileLabel = useMemo(() => {
    const sel = findSelected(opts.outputFile, outputFile);
    return sel?.label || outputFile;
  }, [opts.outputFile, outputFile]);

  const breadcrumbSegments = useMemo(() => {
    return [
      { id: 'root-outputs', label: 'outputs', kind: 'root_outputs' },
      model ? { id: 'model', label: model, kind: 'value', resetKey: 'model' } : null,
      date ? { id: 'date', label: date, kind: 'value', resetKey: 'date' } : null,
      forecast ? { id: 'forecast', label: forecast, kind: 'value', resetKey: 'forecast' } : null,
      cycle ? { id: 'cycle', label: cycle, kind: 'value', resetKey: 'cycle' } : null,
      forecast === 'medium_range' && ensemble
        ? { id: 'ensemble', label: String(ensemble), kind: 'value', resetKey: 'ensemble' }
        : null,
      vpu ? { id: 'vpu', label: vpu, kind: 'value', resetKey: 'vpu' } : null,
      outputFile ? { id: 'outputFile', label: outputFileLabel, kind: 'value', resetKey: 'outputFile' } : null,
    ].filter(Boolean);
  }, [model, date, forecast, cycle, ensemble, vpu, outputFile]);

  const handleBreadcrumbClick = useCallback(
    async (seg) => {
      console.log('Breadcrumb clicked:', seg);
      if (!seg) return;

      // outputs -> reset from model (inclusive) and show model
      if (seg.kind === 'root_outputs') {
        resetFromKey('model', { includeSelf: true });
        setActiveStepKey('model');
        await prefetchOptions('model', { model: '', date: '', forecast: '', cycle: '', ensemble: null, vpu: '', outputFile: '' });
        return;
      }

      if (seg.kind === 'value' && seg.resetKey) {
        // Reset downstream (exclusive)
        resetFromKey(seg.resetKey, { includeSelf: false });

        // Compute what state will look like after reset (for prefetch)
        const orderNow = getStepOrder(forecast);
        const idx = orderNow.indexOf(seg.resetKey);
        const downstream = orderNow.slice(idx + 1);

        const sNext = { ...selectionState };
        if (downstream.includes('date')) sNext.date = '';
        if (downstream.includes('forecast')) sNext.forecast = '';
        if (downstream.includes('cycle')) sNext.cycle = '';
        if (downstream.includes('ensemble')) sNext.ensemble = null;
        if (downstream.includes('vpu')) sNext.vpu = '';
        if (downstream.includes('outputFile')) sNext.outputFile = '';

        // Next dropdown to show
        const orderNext = getStepOrder(sNext.forecast);
        const nextKey = nextAfter(orderNext, seg.resetKey);

        setActiveStepKey(nextKey);

        await prefetchOptions(nextKey, sNext);
      }
    },
    [resetFromKey, prefetchOptions, selectionState, forecast, nextAfter]
  );

 
  const steps = useMemo(() => {
    const arr = stepOrder.map((key) => {
      const options = opts[key] || [];
      const value =
        key === 'outputFile'
          ? outputFile
          : selectionState[key];

      const selected = findSelected(options, value);

      // enabled depends on having a valid path + options
      const path = getPathForStep(key, selectionState);
      const enabled = key === 'model' ? options.length > 0 : !!path && options.length > 0;

      return {
        key,
        label: LABELS[key],
        icon: ICONS[key],
        options,
        selected,
        enabled,
        onChange: async (v) => {
          const opt = firstOpt(v);
          if (!opt) return;
          await applySelection(key, opt.value);
        },
      };
    });

    return arr;
  }, [stepOrder, opts, selectionState, outputFile, variables, variable, applySelection, set_variable]);

  const activeStep = useMemo(
    () => steps.find((s) => s.key === activeStepKey) ?? steps[0],
    [steps, activeStepKey]
  );

  
  const handleVisulization = async () => {
    if (!feature_id || !vpu) {
      handleError('Please select a feature on the map first');
      return;
    }
    if (loading) {
      toast.info('Data is already loading, please wait...', { autoClose: 300 });
      return;
    }

    handleLoading('Loading Datastream Data');
    const toastId = toast.loading(`Loading data for id: ${feature_id}...`, {
      closeOnClick: false,
      draggable: false,
    });

    try {
      const cacheKey = getCacheKey(model, date, forecast, cycle, ensemble, vpu, outputFile);
      const vpu_gpkg = makeGpkgUrl(vpu);
      const id = feature_id.split('-')[1];

      const tableExists = await checkForTable(cacheKey);
      if (!tableExists) {
        await loadVpuData(model, date, forecast, cycle, ensemble, vpu, outputFile, vpu_gpkg);
      }

      const vars = await getVariables({ cacheKey });
      const _variable = variable || vars[0];

      const series = await getTimeseries(id, cacheKey, _variable);
      const xy = series.map((d) => ({ x: new Date(d.time), y: d[_variable] }));

      set_table(cacheKey);
      set_variables(vars);
      set_variable(_variable);
      set_series(xy);
      set_layout({
        yaxis: _variable,
        xaxis: 'Time',
        title: makeTitle(forecast, feature_id),
      });

      toast.update(toastId, {
        render: `Loaded ${xy.length} data points for id: ${feature_id}`,
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

  return (
    <Fragment>
      <p>S3 Path</p>
      <Breadcrumb segments={breadcrumbSegments} onClick={handleBreadcrumbClick} />
        {
        activeStep.options.length > 1 &&  
        <Row>
          <IconLabel>
            {activeStep.icon} {activeStep.label}
          </IconLabel>
          <SelectComponent
            optionsList={activeStep.options}
            value={activeStep.selected}
            onChangeHandler={activeStep.onChange}
            width={240}
            isDisabled={!activeStep.enabled}
          />
        </Row>
        }

      <div style={{ marginTop: '10px', paddingLeft: '100px', paddingRight: '100px' }}>
        <XButton onClick={handleVisulization}>Update</XButton>
      </div>

      <LoadingMessage>
        {loading && (
          <>
            <Spinner as="span" size="sm" animation="border" role="status" aria-hidden="true" />
            &nbsp; {loadingText}
          </>
        )}
      </LoadingMessage>
    </Fragment>
  );
}
