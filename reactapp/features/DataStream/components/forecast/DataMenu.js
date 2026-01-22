import React, { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { Spinner } from 'react-bootstrap';
import { XButton, LoadingMessage, Row, IconLabel } from '../styles/Styles';
import SelectComponent from '../SelectComponent';
import Breadcrumb from './Breadcrumb'; // ✅ add this (path as needed)
import { toast } from 'react-toastify';

import { loadVpuData, getVariables, getTimeseries, checkForTable } from 'features/DataStream/lib/queryData';
import { makeGpkgUrl, getOptionsFromURL } from 'features/DataStream/lib/s3Utils';
import { getCacheKey } from 'features/DataStream/lib/opfsCache';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { makeTitle } from 'features/DataStream/lib/utils';

import {
  ModelIcon,
  DateIcon,
  ForecastIcon,
  CycleIcon,
  EnsembleIcon,
  VariableIcon,
} from 'features/DataStream/lib/layers';

const firstOpt = (v) => (Array.isArray(v) ? v[0] : v);

const pickDefault = (opts, { index = 0, preferValue } = {}) => {
  if (!Array.isArray(opts) || opts.length === 0) return null;
  if (preferValue) {
    const found = opts.find((o) => o.value === preferValue);
    if (found) return found;
  }
  const safe = Math.min(Math.max(index, 0), opts.length - 1);
  return opts[safe] ?? opts[0] ?? null;
};

const findSelected = (opts, value) => opts.find((o) => o.value === value) ?? null;

export default function DataMenu() {
  // ─────────────────────────────────────
  // Stores
  // ─────────────────────────────────────
  const vpu = useDataStreamStore((s) => s.vpu);
  const model = useDataStreamStore((s) => s.model);
  const date = useDataStreamStore((s) => s.date);
  const forecast = useDataStreamStore((s) => s.forecast);
  const cycle = useDataStreamStore((s) => s.cycle);
  const ensemble = useDataStreamStore((s) => s.ensemble);
  const variables = useDataStreamStore((s) => s.variables);

  const set_model = useDataStreamStore((s) => s.set_model);
  const set_date = useDataStreamStore((s) => s.set_date);
  const set_forecast = useDataStreamStore((s) => s.set_forecast);
  const set_cycle = useDataStreamStore((s) => s.set_cycle);
  const set_ensemble = useDataStreamStore((s) => s.set_ensemble);
  const set_vpu = useDataStreamStore((s) => s.set_vpu);
  const set_variables = useDataStreamStore((s) => s.set_variables);

  const variable = useTimeSeriesStore((s) => s.variable);
  const set_variable = useTimeSeriesStore((s) => s.set_variable);
  const set_series = useTimeSeriesStore((s) => s.set_series);
  const set_table = useTimeSeriesStore((s) => s.set_table);
  const set_layout = useTimeSeriesStore((s) => s.set_layout);
  const feature_id = useTimeSeriesStore((s) => s.feature_id);
  const loading = useTimeSeriesStore((s) => s.loading);
  const setLoading = useTimeSeriesStore((s) => s.set_loading);

  // ─────────────────────────────────────
  // Local UI state
  // ─────────────────────────────────────
  const [loadingText, setLoadingText] = useState('');

  const [modelsList, setModelsList] = useState([]);
  const [datesList, setDatesList] = useState([]);
  const [forecastList, setForecastList] = useState([]);
  const [cyclesList, setCyclesList] = useState([]);
  const [ensembleList, setEnsembleList] = useState([]);
  const [vpuList, setVpuList] = useState([]);
  const [outputFilesList, setOutputFilesList] = useState([]);

  const [outputFile, setOutputFile] = useState('');


  const didBootstrapRef = useRef(false);
  const isMedium = forecast === 'medium_range';

  // ─────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────
  // put near your helpers
const deriveActiveKey = ({ model, date, forecast, cycle, ensemble, vpu }) => {
  if (!model) return 'model';
  if (!date) return 'date';
  if (!forecast) return 'forecast';
  if (!cycle) return 'cycle';

  if (forecast === 'medium_range') {
    if (!ensemble) return 'ensemble';
    if (!vpu) return 'vpu';
    return 'outputFile';
  }

  if (!vpu) return 'vpu';
  return 'outputFile';
};
  // one dropdown at a time
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
    const opts = await getOptionsFromURL(path);
    return Array.isArray(opts) ? opts : [];
  }, []);

  const stepOrder = useMemo(() => {
    const base = ['model', 'date', 'forecast', 'cycle'];
    if (isMedium) base.push('ensemble');
    base.push('vpu', 'outputFile');
    return base;
  }, [isMedium]);

  const nextAfter = useCallback(
    (key) => {
      const idx = stepOrder.indexOf(key);
      return stepOrder[idx + 1] ?? key;
    },
    [stepOrder]
  );

  /**
   * Reset values/lists from a step
   * - includeSelf=false : clears only downstream
   * - includeSelf=true  : clears the clicked step + downstream
   */
  const resetFromKey = useCallback(
    (fromKey, { includeSelf = false, preserveLists = new Set() } = {}) => {
      const idx = stepOrder.indexOf(fromKey);
      if (idx < 0) return;

      const start = includeSelf ? idx : idx + 1;
      const toClear = new Set(stepOrder.slice(start));

      // Store values
      if (toClear.has('model')) set_model('');
      if (toClear.has('date')) set_date('');
      if (toClear.has('forecast')) set_forecast('');
      if (toClear.has('cycle')) set_cycle('');
      if (toClear.has('ensemble')) set_ensemble(null);
      if (toClear.has('vpu')) set_vpu('');
      if (toClear.has('outputFile')) setOutputFile('');

      // Local option lists (never clear modelsList)
      if (toClear.has('date') && !preserveLists.has('date')) setDatesList([]);
      if (toClear.has('forecast')) setForecastList([]);
      if (toClear.has('cycle')) setCyclesList([]);
      if (toClear.has('ensemble')) setEnsembleList([]);
      if (toClear.has('vpu')) setVpuList([]);
      if (toClear.has('outputFile')) setOutputFilesList([]);

      set_variable?.('');
    },
    [
      stepOrder,
      set_model,
      set_date,
      set_forecast,
      set_cycle,
      set_ensemble,
      set_vpu,
      set_variable,
    ]
  );

  // prefix up to the folder that contains VPU folders
  const vpuBasePath = useMemo(() => {
    if (!model || !date || !forecast || !cycle) return '';
    if (forecast === 'medium_range') {
      if (!ensemble) return '';
      return `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${cycle}/${ensemble}/`;
    }
    return `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${cycle}/`;
  }, [model, date, forecast, cycle, ensemble]);

  // used ONLY for querying output files; NOT shown in breadcrumb
  const troutePath = useMemo(() => {
    if (!vpuBasePath || !vpu) return '';
    return `${vpuBasePath}${vpu}/ngen-run/outputs/troute/`;
  }, [vpuBasePath, vpu]);

  // ─────────────────────────────────────
  // Bootstrap defaults
  // ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (didBootstrapRef.current) return;
      didBootstrapRef.current = true;

      try {
        const mOpts = await fetchOpts('outputs/');
        if (cancelled) return;
        setModelsList(mOpts);
        const mDef = pickDefault(mOpts, { index: 0 })?.value || '';
        if (!mDef) return;

        const dOpts = await fetchOpts(`outputs/${mDef}/v2.2_hydrofabric/`);
        if (cancelled) return;
        setDatesList(dOpts);
        const dDef =
          pickDefault(dOpts, { index: 1 })?.value ||
          pickDefault(dOpts, { index: 0 })?.value ||
          '';
        if (!dDef) return;

        const fOpts = await fetchOpts(`outputs/${mDef}/v2.2_hydrofabric/${dDef}/`);
        if (cancelled) return;
        setForecastList(fOpts);
        const fDef = pickDefault(fOpts, { index: 0 })?.value || '';
        if (!fDef) return;

        const cOpts = await fetchOpts(`outputs/${mDef}/v2.2_hydrofabric/${dDef}/${fDef}/`);
        if (cancelled) return;
        setCyclesList(cOpts);
        const cDef = pickDefault(cOpts, { index: 0 })?.value || '';
        if (!cDef) return;

        let eDef = null;
        if (fDef === 'medium_range') {
          const eOpts = await fetchOpts(`outputs/${mDef}/v2.2_hydrofabric/${dDef}/${fDef}/${cDef}/`);
          if (cancelled) return;
          setEnsembleList(eOpts);
          eDef = pickDefault(eOpts, { index: 0 })?.value || null;
          if (!eDef) return;
        } else {
          setEnsembleList([]);
        }

        const vBase =
          fDef === 'medium_range'
            ? `outputs/${mDef}/v2.2_hydrofabric/${dDef}/${fDef}/${cDef}/${eDef}/`
            : `outputs/${mDef}/v2.2_hydrofabric/${dDef}/${fDef}/${cDef}/`;

        const vOpts = await fetchOpts(vBase);
        if (cancelled) return;
        setVpuList(vOpts);

        const vDef = pickDefault(vOpts, { preferValue: vpu, index: 0 })?.value || '';
        if (!vDef) return;

        const fileOpts = await fetchOpts(`${vBase}${vDef}/ngen-run/outputs/troute/`);
        if (cancelled) return;
        setOutputFilesList(fileOpts);

        const fileDef = pickDefault(fileOpts, { index: 0 })?.label || '';

        set_model(mDef);
        set_date(dDef);
        set_forecast(fDef);
        set_cycle(cDef);
        set_ensemble(eDef);
        set_vpu(vDef);
        setOutputFile(fileDef);

        setActiveStepKey('outputFile');
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchOpts, set_model, set_date, set_forecast, set_cycle, set_ensemble, set_vpu, vpu]);

  // ─────────────────────────────────────
  // Lazy-load options for step (FORCE-supported)
  // ─────────────────────────────────────
  const ensureOptionsForStep = useCallback(
    async (stepKey, { force = false } = {}) => {
      try {
        if (stepKey === 'model' && (force || modelsList.length === 0)) {
          setModelsList(await fetchOpts('outputs/'));
        }

        if (stepKey === 'date' && model && (force || datesList.length === 0)) {
          setDatesList(await fetchOpts(`outputs/${model}/v2.2_hydrofabric/`));
        }

        if (stepKey === 'forecast' && model && date && (force || forecastList.length === 0)) {
          setForecastList(await fetchOpts(`outputs/${model}/v2.2_hydrofabric/${date}/`));
        }

        if (stepKey === 'cycle' && model && date && forecast && (force || cyclesList.length === 0)) {
          setCyclesList(await fetchOpts(`outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/`));
        }

        if (
          stepKey === 'ensemble' &&
          model &&
          date &&
          forecast === 'medium_range' &&
          cycle &&
          (force || ensembleList.length === 0)
        ) {
          setEnsembleList(await fetchOpts(`outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${cycle}/`));
        }

        if (stepKey === 'vpu' && vpuBasePath && (force || vpuList.length === 0)) {
          setVpuList(await fetchOpts(vpuBasePath));
        }

        if (stepKey === 'outputFile' && troutePath && (force || outputFilesList.length === 0)) {
          setOutputFilesList(await fetchOpts(troutePath));
        }
      } catch (e) {
        console.error(e);
      }
    },
    [
      fetchOpts,
      model,
      date,
      forecast,
      cycle,
      vpuBasePath,
      troutePath,
      modelsList.length,
      datesList.length,
      forecastList.length,
      cyclesList.length,
      ensembleList.length,
      vpuList.length,
      outputFilesList.length,
    ]
  );

  // ─────────────────────────────────────
  // Breadcrumb segments (NO v2.2_hydrofabric segment)
  // outputs is clickable and resets from model (inclusive)
  // ─────────────────────────────────────
  const breadcrumbSegments = useMemo(() => {
    return [
      { id: 'root-outputs', label: 'outputs', kind: 'root_outputs' },
      model ? { id: 'model', label: model, kind: 'value', resetKey: 'model' } : null,
      date ? { id: 'date', label: date, kind: 'value', resetKey: 'date' } : null,
      forecast ? { id: 'forecast', label: forecast, kind: 'value', resetKey: 'forecast' } : null,
      cycle ? { id: 'cycle', label: cycle, kind: 'value', resetKey: 'cycle' } : null,
      isMedium ? (ensemble ? { id: 'ensemble', label: ensemble, kind: 'value', resetKey: 'ensemble' } : null) : null,
      vpu ? { id: 'vpu', label: vpu, kind: 'value', resetKey: 'vpu' } : null,
      outputFile ? { id: 'outputFile', label: outputFile, kind: 'value', resetKey: 'outputFile' } : null,
    ].filter(Boolean);
  }, [model, date, forecast, cycle, ensemble, isMedium, vpu, outputFile]);

  const handleBreadcrumbClick = useCallback(
    async (seg) => {
      if (!seg) return;

      // outputs → reset from model (inclusive) and show model dropdown
      if (seg.kind === 'root_outputs') {
        resetFromKey('model', { includeSelf: true });
        setActiveStepKey('model');
        await ensureOptionsForStep('model', { force: true });
        return;
      }

      // normal value segment: reset downstream (exclusive) and show NEXT dropdown
      if (seg.kind === 'value' && seg.resetKey) {
        resetFromKey(seg.resetKey, { includeSelf: false });

        const next = nextAfter(seg.resetKey);
        setActiveStepKey(next);

        // force fetch because we just cleared lists and length checks may be stale this tick
        await ensureOptionsForStep(next, { force: true });
      }
    },
    [resetFromKey, nextAfter, ensureOptionsForStep]
  );

  // ─────────────────────────────────────
  // Variables list (from store variables)
  // ─────────────────────────────────────
  const availableVariablesList = useMemo(
    () => (variables || []).map((vv) => ({ value: vv, label: vv })),
    [variables]
  );
// ✅ auto-advance when the path becomes “deeper” (e.g., after bootstrap sets values)
useEffect(() => {
  const derived = deriveActiveKey({ model, date, forecast, cycle, ensemble, vpu });

  setActiveStepKey((prev) => {
    const prevIdx = stepOrder.indexOf(prev);
    const nextIdx = stepOrder.indexOf(derived);
    return nextIdx > prevIdx ? derived : prev; // only advance
  });

  // if we’re at the vpu level, make sure output files are fetched
  if (derived === 'outputFile') {
    ensureOptionsForStep('outputFile', { force: true });
  }
}, [
  model,
  date,
  forecast,
  cycle,
  ensemble,
  vpu,
  stepOrder,
  ensureOptionsForStep,
]);
  // ─────────────────────────────────────
  // Step definitions
  // ─────────────────────────────────────
  const steps = useMemo(() => {
    const modelStep = {
      key: 'model',
      label: 'Model',
      icon: <ModelIcon />,
      options: modelsList,
      selected: findSelected(modelsList, model),
      enabled: modelsList.length > 0,
      onChange: async (v) => {
        const opt = firstOpt(v);
        if (!opt) return;

        set_model(opt.value);
        resetFromKey('model', { includeSelf: false });
        setActiveStepKey('date');

        const dOpts = await fetchOpts(`outputs/${opt.value}/v2.2_hydrofabric/`);
        setDatesList(dOpts);
      },
    };

    const dateStep = {
      key: 'date',
      label: 'Date',
      icon: <DateIcon />,
      options: datesList,
      selected: findSelected(datesList, date),
      enabled: !!model && datesList.length > 0,
      onChange: async (v) => {
        const opt = firstOpt(v);
        if (!opt) return;

        set_date(opt.value);
        resetFromKey('date', { includeSelf: false });
        setActiveStepKey('forecast');

        const fOpts = await fetchOpts(`outputs/${model}/v2.2_hydrofabric/${opt.value}/`);
        setForecastList(fOpts);
      },
    };

    const forecastStep = {
      key: 'forecast',
      label: 'Forecast',
      icon: <ForecastIcon />,
      options: forecastList,
      selected: findSelected(forecastList, forecast),
      enabled: !!model && !!date && forecastList.length > 0,
      onChange: async (v) => {
        const opt = firstOpt(v);
        if (!opt) return;

        set_forecast(opt.value);
        resetFromKey('forecast', { includeSelf: false });
        setActiveStepKey('cycle');

        const cOpts = await fetchOpts(`outputs/${model}/v2.2_hydrofabric/${date}/${opt.value}/`);
        setCyclesList(cOpts);
      },
    };

    const cycleStep = {
      key: 'cycle',
      label: 'Cycle',
      icon: <CycleIcon />,
      options: cyclesList,
      selected: findSelected(cyclesList, cycle),
      enabled: !!model && !!date && !!forecast && cyclesList.length > 0,
      onChange: async (v) => {
        const opt = firstOpt(v);
        if (!opt) return;

        set_cycle(opt.value);
        resetFromKey('cycle', { includeSelf: false });

        if (forecast === 'medium_range') {
          setActiveStepKey('ensemble');
          const eOpts = await fetchOpts(`outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/`);
          setEnsembleList(eOpts);
        } else {
          set_ensemble(null);
          setEnsembleList([]);
          setActiveStepKey('vpu');

          const vOpts = await fetchOpts(`outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${opt.value}/`);
          setVpuList(vOpts);
        }
      },
    };

    const ensembleStep = {
      key: 'ensemble',
      label: 'Ensemble',
      icon: <EnsembleIcon />,
      options: ensembleList,
      selected: findSelected(ensembleList, ensemble),
      enabled: isMedium && !!model && !!date && !!forecast && !!cycle && ensembleList.length > 0,
      onChange: async (v) => {
        const opt = firstOpt(v);
        if (!opt) return;

        set_ensemble(opt.value);
        resetFromKey('ensemble', { includeSelf: false });

        setActiveStepKey('vpu');
        const vOpts = await fetchOpts(
          `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${cycle}/${opt.value}/`
        );
        setVpuList(vOpts);
      },
    };

    const vpuStep = {
      key: 'vpu',
      label: 'VPU',
      icon: <EnsembleIcon />,
      options: vpuList,
      selected: findSelected(vpuList, vpu),
      enabled: !!vpuBasePath && vpuList.length > 0,
      onChange: async (v) => {
        const opt = firstOpt(v);
        if (!opt) return;

        set_vpu(opt.value);
        resetFromKey('vpu', { includeSelf: false });

        setActiveStepKey('outputFile');
        const files = await fetchOpts(`${vpuBasePath}${opt.value}/ngen-run/outputs/troute/`);
        setOutputFilesList(files);
      },
    };

    const outputFileStep = {
      key: 'outputFile',
      label: 'Output File',
      icon: <VariableIcon />,
      options: outputFilesList,
      selected: findSelected(outputFilesList, outputFile),
      enabled: !!troutePath && outputFilesList.length > 0,
      onChange: (v) => {
        const opt = firstOpt(v);
        if (!opt) return;
        setOutputFile(opt.label);
      },
    };

    const arr = [modelStep, dateStep, forecastStep, cycleStep];
    if (isMedium) arr.push(ensembleStep);
    arr.push(vpuStep, outputFileStep);

    if (availableVariablesList.length > 0) {
      arr.push({
        key: 'variable',
        label: 'Variable',
        icon: <VariableIcon />,
        options: availableVariablesList,
        selected: findSelected(availableVariablesList, variable),
        enabled: true,
        onChange: (v) => {
          const opt = firstOpt(v);
          if (!opt) return;
          set_variable(opt.value);
        },
      });
    }

    return arr;
  }, [
    modelsList,
    datesList,
    forecastList,
    cyclesList,
    ensembleList,
    vpuList,
    outputFilesList,
    model,
    date,
    forecast,
    cycle,
    ensemble,
    vpu,
    outputFile,
    isMedium,
    vpuBasePath,
    troutePath,
    availableVariablesList,
    variable,
    fetchOpts,
    set_model,
    set_date,
    set_forecast,
    set_cycle,
    set_ensemble,
    set_vpu,
    set_variable,
    resetFromKey,
  ]);

  const activeStep = useMemo(
    () => 
      
      steps.find((s) => s.key === activeStepKey) ?? steps[0],
    [steps, activeStepKey]
  );

  // ─────────────────────────────────────
  // Visualization
  // ─────────────────────────────────────
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
      const cacheKey = getCacheKey(model, date, forecast, cycle, ensemble, vpu);
      const vpu_gpkg = makeGpkgUrl(vpu);
      const id = feature_id.split('-')[1];

      const tableExists = await checkForTable(cacheKey);
      if (!tableExists) {
        await loadVpuData(model, date, forecast, cycle, ensemble, vpu, vpu_gpkg);
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

  // ─────────────────────────────────────
  // Render
  // ─────────────────────────────────────
  return (
    <Fragment>
      {/* ✅ Breadcrumb Component */}
      <Breadcrumb segments={breadcrumbSegments} onClick={handleBreadcrumbClick} />

      {/* Single active dropdown */}
      <Row>
        <IconLabel>
          {activeStep.icon} {activeStep.label}
        </IconLabel>
        <SelectComponent
          optionsList={activeStep.options}
          value={activeStep.selected}
          onChangeHandler={activeStep.onChange}
          width={240}
        />
      </Row>

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
