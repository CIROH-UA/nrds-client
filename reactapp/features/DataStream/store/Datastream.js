import { create } from 'zustand';
import { sameArrayValues } from 'features/DataStream/lib/equality';

import { cancelVpuLoads } from 'features/DataStream/actions/loadState';
import { cancelSelections } from 'features/DataStream/actions/selectionGeneration';
import { useVPUStore } from 'features/DataStream/store/VPU';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { getYesterdayDateString } from '../lib/utils';

/** Leave a vpu: stop playback, drop its animation arrays, and disown the load still fetching it. */
function leaveCurrentVpu() {
  cancelVpuLoads();
  cancelSelections();
  useTimeSeriesStore.setState({ isPlaying: false });
  useVPUStore.getState().resetVPU();
}

/** Where the app reads its data from, before anything is selected. */
const DEFAULTS = {
  bucket: "ciroh-community-ngen-datastream",
  community_pmtiles: "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/merged.pmtiles",
  flowpaths_pmtiles:
    "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/only_geometry/upstream_index/flowpaths.pmtiles",
  hydrofabric_index: "/static/nrds/data/hydrofabric_index_slim.parquet",
  hydrofabric_index_fallback:
    "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/hydrofabric_index.parquet",
  cache_key: null,
  vpu: null,
  model: "cfe_nom",
  date: `ngen.${getYesterdayDateString()}`,
  forecast: "analysis_assim_extend",
  ensemble: null,
  cycle: "00",
  outputFile: null,
  variables: [],
  /** Whether the id index is loading, ready, or gave up. */
  index_status: 'loading',
};

const useDataStreamStore = create((set) => ({
    ...DEFAULTS,
    set_bucket: (bucket) => set((s) => (s.bucket === bucket ? s : { bucket })),
    set_cache_key: (cache_key) => set((s) => (s.cache_key === cache_key ? s : { cache_key })),
    /** Move to another vpu, and stop animating the one being left. */
    set_vpu: (vpu) =>
      set((s) => {
        if (s.vpu === vpu) return s;
        leaveCurrentVpu();
        return { vpu };
      }),
    set_date: (date) => set((s) => (s.date === date ? s : { date })),
    set_forecast: (forecast) => set((s) => (s.forecast === forecast ? s : { forecast })),
    set_ensemble: (ensemble) => set((s) => (s.ensemble === ensemble ? s : { ensemble })),
    set_cycle: (cycle) => set((s) => (s.cycle === cycle ? s : { cycle })),
    set_model: (model) => set((s) => (s.model === model ? s : { model })),
    set_outputFile: (outputFile) =>
        set((s) => (s.outputFile === outputFile ? s : { outputFile })),
    set_community_pmtiles: (community_pmtiles) =>
        set((s) => (s.community_pmtiles === community_pmtiles ? s : { community_pmtiles })),
    set_hydrofabric_index: (hydrofabric_index) =>
        set((s) => (s.hydrofabric_index === hydrofabric_index ? s : { hydrofabric_index })),
    set_index_status: (index_status) =>
      set((s) => (s.index_status === index_status ? s : { index_status })),

    set_variables: (variables) =>
        set((s) => (sameArrayValues(s.variables, variables) ? s : { variables })),
    reset: () =>
        set((s) => {
            const already =
                s.bucket === DEFAULTS.bucket &&
                s.community_pmtiles === DEFAULTS.community_pmtiles &&
                s.hydrofabric_index === DEFAULTS.hydrofabric_index &&
                s.cache_key === DEFAULTS.cache_key &&
                s.vpu === DEFAULTS.vpu &&
                s.model === DEFAULTS.model &&
                s.date === DEFAULTS.date &&
                s.forecast === DEFAULTS.forecast &&
                s.ensemble === DEFAULTS.ensemble &&
                s.cycle === DEFAULTS.cycle &&
                s.outputFile === DEFAULTS.outputFile &&
                sameArrayValues(s.variables, DEFAULTS.variables);

            return already ? s : { ...DEFAULTS };
        }),
}));

export default useDataStreamStore;