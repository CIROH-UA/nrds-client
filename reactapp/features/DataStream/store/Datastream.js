import { create } from 'zustand';
import { getYesterdayDateString } from '../lib/utils';

const DEFAULTS = {
  bucket: "ciroh-community-ngen-datastream",
  nexus_pmtiles: "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/nexus.pmtiles",
  community_pmtiles: "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/merged.pmtiles",
  hydrofabric_index: "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/hydrofabric_index.parquet",
  cache_key: null,
  vpu: null,
  model: "cfe_nom",
  date: `ngen.${getYesterdayDateString()}`,
  forecast: "analysis_assim_extend",
  ensemble: null,
  cycle: "00",
  outputFile: null,
  variables: [],
};

const sameArrayValues = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const useDataStreamStore = create((set) => ({
    ...DEFAULTS,
    set_bucket: (bucket) => set((s) => (s.bucket === bucket ? s : { bucket })),
    set_cache_key: (cache_key) => set((s) => (s.cache_key === cache_key ? s : { cache_key })),
    set_vpu: (vpu) => set((s) => (s.vpu === vpu ? s : { vpu })),
    set_date: (date) => set((s) => (s.date === date ? s : { date })),
    set_forecast: (forecast) => set((s) => (s.forecast === forecast ? s : { forecast })),
    set_ensemble: (ensemble) => set((s) => (s.ensemble === ensemble ? s : { ensemble })),
    set_cycle: (cycle) => set((s) => (s.cycle === cycle ? s : { cycle })),
    set_model: (model) => set((s) => (s.model === model ? s : { model })),
    set_outputFile: (outputFile) =>
        set((s) => (s.outputFile === outputFile ? s : { outputFile })),
    set_nexus_pmtiles: (nexus_pmtiles) =>
        set((s) => (s.nexus_pmtiles === nexus_pmtiles ? s : { nexus_pmtiles })),
    set_community_pmtiles: (community_pmtiles) =>
        set((s) => (s.community_pmtiles === community_pmtiles ? s : { community_pmtiles })),
    set_hydrofabric_index: (hydrofabric_index) =>
        set((s) => (s.hydrofabric_index === hydrofabric_index ? s : { hydrofabric_index })),
    set_variables: (variables) =>
        set((s) => (sameArrayValues(s.variables, variables) ? s : { variables })),
    reset: () =>
        set((s) => {
            const already =
                s.bucket === DEFAULTS.bucket &&
                s.nexus_pmtiles === DEFAULTS.nexus_pmtiles &&
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