import { createStore } from './store.js';

/**
 * The app's single observable store (migration unit U2), the vanilla replacement for the six
 * zustand stores the React client held: the selection (Datastream), the map layer toggles
 * (Layers), the hovered/selected feature (Layers' feature store), the S3 option lists (s3Store),
 * the theme signal (theme), the animation clock and charted series (Timeseries), and the VPU
 * animation arrays with their least-recently-used variable cache (VPU).
 *
 * Because createStore is one flat store rather than six, each former store becomes a named slice
 * of the state and every zustand action becomes an entry in the flat `actions` object below.
 * Cross-store effects that zustand expressed as `store.subscribe` calls are reproduced here as
 * explicit subscriptions on the single store (see the wiring at the foot of the file), and the
 * effective-theme signal is seeded and applied at module load exactly as the theme store did.
 *
 * Inlined helpers: the data layer is being ported in parallel and none of the helpers these
 * stores imported are present under ../lib yet (getYesterdayDateString, sameArrayValues,
 * sameObjectValues, animationIsOnMap, DEFAULT_SCALE), so minimal local copies live here. The load
 * and selection cancellers Datastream.leaveCurrentVpu called live in the data layer's action
 * modules (not lib), so they are reached through a canceller registry the data layer registers
 * into rather than an import of a not-yet-ported module.
 */

/** The identity checks the stores use to answer "nothing changed". */
const sameArrayValues = (a, b) =>
  a === b || (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]));

const sameObjectValues = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((k) => a[k] === b[k]);
};

/** Yesterday as `YYYYMMDD`, the default forecast date. Inlined from lib/utils' React copy. */
const getYesterdayDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

/** Whether the animation is on the map. Inlined from lib/flowpaths' React copy. */
const animationIsOnMap = ({ times, flowpathsVisible }) =>
  Boolean(flowpathsVisible) && (times?.length ?? 0) > 0;

/** The scale a fresh view uses. Inlined from lib/colorScale's DEFAULT_SCALE. */
const DEFAULT_SCALE = 'linear';

const DEFAULT_BUCKET = 'ciroh-community-ngen-datastream';

/** Compare arrays of option objects ({ value, label?, ... }) by their `value` identity. */
function sameOptionsByValue(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.value !== b[i]?.value) return false;
  }
  return true;
}

const samePrimitive = (a, b) => a === b;

/** The id a flattened map feature is keyed by: its `_id` first, since a flattened feature has no
 * `.properties` to fall back on and a null key must not read as "same as the one already held". */
const featureKey = (f) =>
  f?._id ?? f?.id ?? f?.properties?.id ?? f?.properties?.feature_id ?? null;

/** Whether two features share an identifiable key; a null key always counts as a change. */
const sameFeature = (a, b) => {
  const keyA = featureKey(a);
  return keyA !== null && keyA === featureKey(b);
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const buildFeatureIdToIndex = (featureIds) => {
  const m = {};
  for (let idx = 0; idx < featureIds.length; idx++) {
    const id = featureIds[idx];
    m[id] = idx;
    m[`wb-${id}`] = idx;
  }
  return m;
};

const MAX_CACHED_VARS = 3;

export const THEME_STORAGE_KEY = 'nrds-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The stored choice, or 'light' as the default when none is stored or storage is unavailable. */
const readStoredPreference = () => {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'light';
  } catch {
    return 'light';
  }
};

/** Persist a manual choice; a return to 'system' clears the key rather than storing a word. */
const persistPreference = (preference) => {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* empty */
  }
};

/** Whether the reader's system asks for a dark interface. */
const systemPrefersDark = () => {
  try {
    return window.matchMedia?.(DARK_QUERY)?.matches ?? false;
  } catch {
    return false;
  }
};

/** The effective theme for a preference. */
const effectiveFor = (preference) =>
  preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;

/** Reflect the preference onto the document root: an attribute only for a manual choice. */
const applyDocumentTheme = (preference) => {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root) return;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
};

/** Where the app reads its data from, before anything is selected. */
const DATASTREAM_DEFAULTS = {
  bucket: DEFAULT_BUCKET,
  community_pmtiles: 'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/merged.pmtiles',
  flowpaths_pmtiles:
    'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/only_geometry/upstream_index/flowpaths.pmtiles',
  hydrofabric_index: '/static/nrds/data/hydrofabric_index_slim.parquet',
  hydrofabric_index_fallback:
    'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/hydrofabric_index.parquet',
  cache_key: null,
  vpu: null,
  model: 'cfe_nom',
  date: `ngen.${getYesterdayDateString()}`,
  forecast: 'analysis_assim_extend',
  ensemble: null,
  cycle: '00',
  outputFile: null,
  variables: [],
  /** Whether the id index is loading, ready, or gave up. */
  index_status: 'idle',
};

const EMPTY_SERIES = [];
const DEFAULT_LAYOUT = Object.freeze({
  yaxis: 'Streamflow',
  xaxis: 'Simulation Time Period (YYYY-MM-DD)',
  title: 'TimeSeries',
});

const initialThemePreference = readStoredPreference();
applyDocumentTheme(initialThemePreference);

const INITIAL_STATE = {
  datastream: { ...DATASTREAM_DEFAULTS },
  layers: {
    catchments: { visible: true },
    flowpaths: { visible: true },
    conus_gauges: { visible: false },
    vpu: { visible: true },
    colorBounds: {
      flow: { min: 0, max: 100 },
      velocity: { min: 0, max: 5 },
      depth: { min: 0, max: 3 },
    },
    hovered_enabled: false,
  },
  feature: {
    selected_feature: null,
  },
  s3: {
    bucket: DEFAULT_BUCKET,
    models: [],
    dates: [],
    forecasts: [],
    cycles: [],
    ensembles: [],
    outputFiles: [],
    prefix: '',
  },
  theme: {
    /** 'light' | 'dark' | 'system' -- what the reader chose. */
    preference: initialThemePreference,
    /** 'light' | 'dark' -- the effective-theme signal the map and legend read. */
    theme: effectiveFor(initialThemePreference),
    /** The selected colour ramp for the flowpath values. Inlined from valueRamp's DEFAULT_RAMP_NAME. */
    rampName: 'datastream',
  },
  timeseries: {
    series: EMPTY_SERIES,
    feature_id: null,
    variable: '',
    layout: DEFAULT_LAYOUT,
    loading: false,
    /** Work promised but not yet begun. */
    pending: false,
    loadingText: '',
    last_loaded_key: null,
    last_answered_key: null,
    last_error: null,
    currentTimeIndex: 0,
    isPlaying: false,
    playSpeed: 1,
    baseFrameMs: 400,
  },
  vpu: {
    featureIds: [],
    featureIdToIndex: {},
    times: [],
    valuesByVar: {},
    varDataOrder: [],
    scale: DEFAULT_SCALE,
  },
};

export const store = createStore(INITIAL_STATE);

/** Patch a single named slice; skip the notify entirely when the updater reports no change. */
const patchSlice = (name, next) => {
  if (next === store.get()[name]) return;
  store.set({ [name]: next });
};

/** How many steps the time cursor may take: the VPU times drive it, the series is the fallback. */
const stepCount = (series) => store.get().vpu.times.length || series?.length || 0;

const cancellers = new Set();

/** Register a teardown the data layer runs when the reader leaves a VPU. Returns an unregister. */
const registerVpuCanceller = (fn) => {
  cancellers.add(fn);
  return () => cancellers.delete(fn);
};

/** Leave a vpu: cancel loads still fetching it, stop playback, and drop its animation arrays. */
function leaveCurrentVpu() {
  for (const fn of [...cancellers]) {
    try {
      fn();
    } catch {
      /* empty */
    }
  }
  const ts = store.get().timeseries;
  if (ts.isPlaying) patchSlice('timeseries', { ...ts, isPlaying: false });
  actions.resetVPU();
}

/** Playback stops when there is nothing left to play. */
const stopPlaybackWithNothingToPlay = () => {
  const ts = store.get().timeseries;
  if (!ts.isPlaying) return;
  const onMap = animationIsOnMap({
    times: store.get().vpu.times,
    flowpathsVisible: store.get().layers.flowpaths.visible,
  });
  if (!onMap) patchSlice('timeseries', { ...ts, isPlaying: false });
};

export const actions = {
  registerVpuCanceller,

  set_bucket: (bucket) => {
    const s = store.get().datastream;
    patchSlice('datastream', s.bucket === bucket ? s : { ...s, bucket });
  },
  set_cache_key: (cache_key) => {
    const s = store.get().datastream;
    patchSlice('datastream', s.cache_key === cache_key ? s : { ...s, cache_key });
  },
  /** Move to another vpu, and stop animating the one being left. */
  set_vpu: (vpu) => {
    const s = store.get().datastream;
    if (s.vpu === vpu) return;
    leaveCurrentVpu();
    patchSlice('datastream', { ...store.get().datastream, vpu });
  },
  set_date: (date) => {
    const s = store.get().datastream;
    patchSlice('datastream', s.date === date ? s : { ...s, date });
  },
  set_forecast: (forecast) => {
    const s = store.get().datastream;
    patchSlice('datastream', s.forecast === forecast ? s : { ...s, forecast });
  },
  set_ensemble: (ensemble) => {
    const s = store.get().datastream;
    patchSlice('datastream', s.ensemble === ensemble ? s : { ...s, ensemble });
  },
  set_cycle: (cycle) => {
    const s = store.get().datastream;
    patchSlice('datastream', s.cycle === cycle ? s : { ...s, cycle });
  },
  set_model: (model) => {
    const s = store.get().datastream;
    patchSlice('datastream', s.model === model ? s : { ...s, model });
  },
  set_outputFile: (outputFile) => {
    const s = store.get().datastream;
    patchSlice('datastream', s.outputFile === outputFile ? s : { ...s, outputFile });
  },
  set_community_pmtiles: (community_pmtiles) => {
    const s = store.get().datastream;
    patchSlice(
      'datastream',
      s.community_pmtiles === community_pmtiles ? s : { ...s, community_pmtiles }
    );
  },
  set_hydrofabric_index: (hydrofabric_index) => {
    const s = store.get().datastream;
    patchSlice(
      'datastream',
      s.hydrofabric_index === hydrofabric_index ? s : { ...s, hydrofabric_index }
    );
  },
  set_index_status: (index_status) => {
    const s = store.get().datastream;
    patchSlice('datastream', s.index_status === index_status ? s : { ...s, index_status });
  },
  set_variables: (variables) => {
    const s = store.get().datastream;
    patchSlice('datastream', sameArrayValues(s.variables, variables) ? s : { ...s, variables });
  },
  reset_datastream: () => {
    const s = store.get().datastream;
    const already =
      s.bucket === DATASTREAM_DEFAULTS.bucket &&
      s.community_pmtiles === DATASTREAM_DEFAULTS.community_pmtiles &&
      s.hydrofabric_index === DATASTREAM_DEFAULTS.hydrofabric_index &&
      s.cache_key === DATASTREAM_DEFAULTS.cache_key &&
      s.vpu === DATASTREAM_DEFAULTS.vpu &&
      s.model === DATASTREAM_DEFAULTS.model &&
      s.date === DATASTREAM_DEFAULTS.date &&
      s.forecast === DATASTREAM_DEFAULTS.forecast &&
      s.ensemble === DATASTREAM_DEFAULTS.ensemble &&
      s.cycle === DATASTREAM_DEFAULTS.cycle &&
      s.outputFile === DATASTREAM_DEFAULTS.outputFile &&
      sameArrayValues(s.variables, DATASTREAM_DEFAULTS.variables);
    patchSlice('datastream', already ? s : { ...DATASTREAM_DEFAULTS });
  },

  get_catchments_visibility: () => store.get().layers.catchments.visible,

  set_hovered_enabled: (isEnabled) => {
    const s = store.get().layers;
    patchSlice('layers', s.hovered_enabled === isEnabled ? s : { ...s, hovered_enabled: isEnabled });
  },
  set_catchments_visibility: (isVisible) => {
    const s = store.get().layers;
    patchSlice(
      'layers',
      s.catchments.visible === isVisible
        ? s
        : { ...s, catchments: { ...s.catchments, visible: isVisible } }
    );
  },
  set_flowpaths_visibility: (isVisible) => {
    const s = store.get().layers;
    patchSlice(
      'layers',
      s.flowpaths.visible === isVisible
        ? s
        : { ...s, flowpaths: { ...s.flowpaths, visible: isVisible } }
    );
  },
  set_vpu_visibility: (isVisible) => {
    const s = store.get().layers;
    patchSlice(
      'layers',
      s.vpu.visible === isVisible ? s : { ...s, vpu: { ...s.vpu, visible: isVisible } }
    );
  },
  set_conus_gauges_visibility: (isVisible) => {
    const s = store.get().layers;
    patchSlice(
      'layers',
      s.conus_gauges.visible === isVisible
        ? s
        : { ...s, conus_gauges: { ...s.conus_gauges, visible: isVisible } }
    );
  },
  set_colorBounds: (key, bounds) => {
    const s = store.get().layers;
    const prev = s.colorBounds?.[key];
    if (!prev) return;
    if (prev.min === bounds.min && prev.max === bounds.max) return;
    patchSlice('layers', {
      ...s,
      colorBounds: { ...s.colorBounds, [key]: { ...prev, ...bounds } },
    });
  },

  set_selected_feature: (feature) => {
    const s = store.get().feature;
    if (s.selected_feature === feature) return;
    if (sameFeature(s.selected_feature, feature)) return;
    patchSlice('feature', { ...s, selected_feature: feature });
  },
  set_s3_bucket: (newBucket) => {
    const s = store.get().s3;
    patchSlice('s3', samePrimitive(s.bucket, newBucket) ? s : { ...s, bucket: newBucket });
  },
  set_prefix: (newPrefix) => {
    const s = store.get().s3;
    patchSlice('s3', samePrimitive(s.prefix, newPrefix) ? s : { ...s, prefix: newPrefix });
  },
  set_models: (newModels) => {
    const s = store.get().s3;
    patchSlice('s3', sameOptionsByValue(s.models, newModels) ? s : { ...s, models: newModels });
  },
  set_dates: (newDates) => {
    const s = store.get().s3;
    patchSlice('s3', sameOptionsByValue(s.dates, newDates) ? s : { ...s, dates: newDates });
  },
  set_forecasts: (newForecasts) => {
    const s = store.get().s3;
    patchSlice(
      's3',
      sameOptionsByValue(s.forecasts, newForecasts) ? s : { ...s, forecasts: newForecasts }
    );
  },
  set_cycles: (newCycles) => {
    const s = store.get().s3;
    patchSlice('s3', sameOptionsByValue(s.cycles, newCycles) ? s : { ...s, cycles: newCycles });
  },
  set_ensembles: (newEnsembles) => {
    const s = store.get().s3;
    patchSlice(
      's3',
      sameOptionsByValue(s.ensembles, newEnsembles) ? s : { ...s, ensembles: newEnsembles }
    );
  },
  set_outputFiles: (newOutputFiles) => {
    const s = store.get().s3;
    patchSlice(
      's3',
      sameOptionsByValue(s.outputFiles, newOutputFiles) ? s : { ...s, outputFiles: newOutputFiles }
    );
  },
  /** Update only the S3 option fields that truly changed; ensembles default to [] unless given. */
  setInitialData: (next) => {
    const s = store.get().s3;
    const patch = { ...s };
    let changed = false;

    const nextBucket = next.bucket ?? DEFAULT_BUCKET;
    if (!samePrimitive(s.bucket, nextBucket)) {
      patch.bucket = nextBucket;
      changed = true;
    }
    if (next.models && !sameOptionsByValue(s.models, next.models)) {
      patch.models = next.models;
      changed = true;
    }
    if (next.dates && !sameOptionsByValue(s.dates, next.dates)) {
      patch.dates = next.dates;
      changed = true;
    }
    if (next.forecasts && !sameOptionsByValue(s.forecasts, next.forecasts)) {
      patch.forecasts = next.forecasts;
      changed = true;
    }
    if (next.cycles && !sameOptionsByValue(s.cycles, next.cycles)) {
      patch.cycles = next.cycles;
      changed = true;
    }
    const nextEnsembles = next.ensembles ?? [];
    if (!sameOptionsByValue(s.ensembles, nextEnsembles)) {
      patch.ensembles = nextEnsembles;
      changed = true;
    }
    if (next.outputFiles && !sameOptionsByValue(s.outputFiles, next.outputFiles)) {
      patch.outputFiles = next.outputFiles;
      changed = true;
    }
    if (typeof next.prefix === 'string' && !samePrimitive(s.prefix, next.prefix)) {
      patch.prefix = next.prefix;
      changed = true;
    }

    patchSlice('s3', changed ? patch : s);
  },
  reset_s3: () => {
    const s = store.get().s3;
    const alreadyDefault =
      s.bucket === DEFAULT_BUCKET &&
      s.prefix === '' &&
      s.models.length === 0 &&
      s.dates.length === 0 &&
      s.forecasts.length === 0 &&
      s.cycles.length === 0 &&
      s.ensembles.length === 0 &&
      s.outputFiles.length === 0;
    patchSlice(
      's3',
      alreadyDefault
        ? s
        : {
            bucket: DEFAULT_BUCKET,
            models: [],
            dates: [],
            forecasts: [],
            cycles: [],
            ensembles: [],
            outputFiles: [],
            prefix: '',
          }
    );
  },

  /** Set the preference explicitly (including a return to 'system'). */
  setPreference: (next) => {
    persistPreference(next);
    applyDocumentTheme(next);
    store.set({ theme: { ...store.get().theme, preference: next, theme: effectiveFor(next) } });
  },
  /** Choose the colour ramp the flowpath values are drawn with. */
  setRamp: (rampName) => {
    const s = store.get().theme;
    patchSlice('theme', s.rampName === rampName ? s : { ...s, rampName });
  },
  /** Flip between light and dark; either flip is a manual choice that beats the system. */
  toggle: () => {
    const next = store.get().theme.theme === 'dark' ? 'light' : 'dark';
    actions.setPreference(next);
  },
  /** Follow a system-preference change, but only while the reader has made no explicit choice. */
  syncSystem: () => {
    const s = store.get().theme;
    if (s.preference !== 'system') return;
    patchSlice('theme', { ...s, theme: effectiveFor('system') });
  },

  set_series: (nextSeries) => {
    const s = store.get().timeseries;
    const prev = s.series;
    if (prev === nextSeries) return;
    const prevEmpty = !prev || prev.length === 0;
    const nextEmpty = !nextSeries || nextSeries.length === 0;
    if (prevEmpty && nextEmpty) return;
    const maxIdx = Math.max(0, stepCount(nextSeries) - 1);
    if (s.currentTimeIndex > maxIdx) {
      patchSlice('timeseries', { ...s, series: nextSeries, currentTimeIndex: maxIdx });
      return;
    }
    patchSlice('timeseries', { ...s, series: nextSeries });
  },
  set_layout: (next) => {
    const s = store.get().timeseries;
    const prev = s.layout;
    if (prev?.title === next?.title && prev?.xaxis === next?.xaxis && prev?.yaxis === next?.yaxis) {
      return;
    }
    patchSlice('timeseries', { ...s, layout: next });
  },
  setCurrentTimeIndex: (idx) => {
    const s = store.get().timeseries;
    const maxIdx = Math.max(0, stepCount(s.series) - 1);
    const next = clamp(Number(idx) || 0, 0, maxIdx);
    if (next === s.currentTimeIndex) return;
    patchSlice('timeseries', { ...s, currentTimeIndex: next });
  },
  setPlaySpeed: (speed) => {
    const s = store.get().timeseries;
    const playSpeed = clamp(Number(speed) || 1, 1, 20);
    patchSlice('timeseries', { ...s, playSpeed });
  },
  toggleIsPlaying: () => {
    const s = store.get().timeseries;
    patchSlice('timeseries', { ...s, isPlaying: !s.isPlaying });
  },
  stepForward: () => {
    const s = store.get().timeseries;
    const maxIdx = stepCount(s.series) - 1;
    if (maxIdx < 0) return;
    patchSlice('timeseries', { ...s, currentTimeIndex: (s.currentTimeIndex + 1) % (maxIdx + 1) });
  },
  stepBackward: () => {
    const s = store.get().timeseries;
    const maxIdx = stepCount(s.series) - 1;
    if (maxIdx < 0) return;
    patchSlice('timeseries', {
      ...s,
      currentTimeIndex: s.currentTimeIndex === 0 ? maxIdx : s.currentTimeIndex - 1,
    });
  },
  getCurrentTimeLabel: () => {
    const { series, currentTimeIndex } = store.get().timeseries;
    const t0 = series?.[0]?.time;
    const t = series?.[currentTimeIndex]?.time;
    if (typeof t0 !== 'number' || typeof t !== 'number') return 'T+0h';
    const hours = Math.round((t - t0) / 3600000);
    return `T+${hours}h`;
  },
  set_loading: (isLoading) => {
    const s = store.get().timeseries;
    patchSlice('timeseries', { ...s, loading: isLoading });
  },
  set_loading_text: (newLoadingText) => {
    const s = store.get().timeseries;
    patchSlice('timeseries', { ...s, loadingText: newLoadingText });
  },
  set_chart_layout: (newLayout) => {
    const s = store.get().timeseries;
    patchSlice('timeseries', { ...s, chart_layout: newLayout });
  },
  set_variable: (newVariable) => {
    const s = store.get().timeseries;
    patchSlice('timeseries', { ...s, variable: newVariable });
  },
  reset_series: () => {
    const s = store.get().timeseries;
    const animating = store.get().vpu.times.length > 0;
    const clock = animating
      ? { currentTimeIndex: s.currentTimeIndex, isPlaying: s.isPlaying }
      : { currentTimeIndex: 0, isPlaying: false };
    if (
      s.series === EMPTY_SERIES &&
      s.currentTimeIndex === clock.currentTimeIndex &&
      s.isPlaying === clock.isPlaying &&
      s.last_loaded_key === null &&
      s.last_answered_key === null
    ) {
      return;
    }
    patchSlice('timeseries', {
      ...s,
      series: EMPTY_SERIES,
      ...clock,
      last_loaded_key: null,
      last_answered_key: null,
    });
  },
  reset_timeseries: () => {
    const s = store.get().timeseries;
    patchSlice('timeseries', {
      ...s,
      series: EMPTY_SERIES,
      pending: false,
      loadingText: '',
      feature_id: null,
      layout: DEFAULT_LAYOUT,
      last_loaded_key: null,
      last_answered_key: null,
      last_error: null,
    });
  },

  getVarData: (variable) => store.get().vpu.valuesByVar?.[variable],

  /** Choose how a value is reshaped before it is mapped onto the colour ramp. */
  setScale: (scale) => {
    const s = store.get().vpu;
    patchSlice('vpu', s.scale === scale ? s : { ...s, scale });
  },
  setFeatureIds: (featureIds) => {
    const s = store.get().vpu;
    patchSlice('vpu', sameArrayValues(s.featureIds, featureIds) ? s : { ...s, featureIds });
  },
  /** Set featureIds + times + featureIdToIndex, reusing objects that would be identical by value. */
  setAnimationIndex: (featureIds, times) => {
    const s = store.get().vpu;
    const sameIds = sameArrayValues(s.featureIds, featureIds);
    const sameTimes = sameArrayValues(s.times, times);
    if (sameIds && sameTimes) return;

    let nextMap = s.featureIdToIndex;
    if (!sameIds) {
      const built = buildFeatureIdToIndex(featureIds);
      nextMap = sameObjectValues(s.featureIdToIndex, built) ? s.featureIdToIndex : built;
    }

    patchSlice('vpu', {
      ...s,
      featureIds: sameIds ? s.featureIds : featureIds,
      times: sameTimes ? s.times : times,
      featureIdToIndex: nextMap,
    });
  },
  setVarData: (variable, flatValues) => {
    const s = store.get().vpu;
    const prev = s.valuesByVar?.[variable];
    let nextOrder = [...s.varDataOrder.filter((v) => v !== variable), variable];
    let nextValuesByVar =
      prev === flatValues ? s.valuesByVar : { ...s.valuesByVar, [variable]: flatValues };

    if (nextOrder.length > MAX_CACHED_VARS) {
      const evicted = nextOrder.slice(0, nextOrder.length - MAX_CACHED_VARS);
      nextOrder = nextOrder.slice(-MAX_CACHED_VARS);

      let copied = nextValuesByVar !== s.valuesByVar;
      for (const key of evicted) {
        if (!Object.prototype.hasOwnProperty.call(nextValuesByVar, key)) continue;
        if (!copied) {
          nextValuesByVar = { ...nextValuesByVar };
          copied = true;
        }
        delete nextValuesByVar[key];
      }
    }

    const sameOrder = sameArrayValues(s.varDataOrder, nextOrder);
    const sameValues =
      nextValuesByVar === s.valuesByVar || sameObjectValues(s.valuesByVar, nextValuesByVar);
    if (sameOrder && sameValues) return;

    patchSlice('vpu', { ...s, valuesByVar: nextValuesByVar, varDataOrder: nextOrder });
  },
  resetVPU: () => {
    const s = store.get().vpu;
    if (
      s.featureIds.length === 0 &&
      s.times.length === 0 &&
      Object.keys(s.featureIdToIndex).length === 0 &&
      Object.keys(s.valuesByVar).length === 0 &&
      s.varDataOrder.length === 0
    ) {
      return;
    }
    patchSlice('vpu', {
      ...s,
      featureIds: [],
      times: [],
      featureIdToIndex: {},
      valuesByVar: {},
      varDataOrder: [],
    });
  },
};

let prevTimes = store.get().vpu.times;
let prevFlowpathsVisible = store.get().layers.flowpaths.visible;
store.subscribe((s) => {
  const times = s.vpu.times;
  const flowpathsVisible = s.layers.flowpaths.visible;
  if (times === prevTimes && flowpathsVisible === prevFlowpathsVisible) return;
  prevTimes = times;
  prevFlowpathsVisible = flowpathsVisible;
  stopPlaybackWithNothingToPlay();
});

try {
  const mql = window.matchMedia?.(DARK_QUERY);
  mql?.addEventListener?.('change', () => actions.syncSystem());
} catch {
  /* empty */
}

export default store;
