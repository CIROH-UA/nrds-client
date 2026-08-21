import { create } from 'zustand';
import { getYesterdayDateString } from '../lib/utils';

/**
 * Stop playback and drop the animation arrays of the vpu being left behind.
 *
 * Required lazily: the layers store and the timeseries store both import nothing from here, and
 * a static import would close a cycle between the three.
 */
function stopAnimating() {
  // eslint-disable-next-line global-require
  const { useVPUStore } = require('features/DataStream/store/Layers');
  // eslint-disable-next-line global-require
  const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;
  useTimeSeriesStore.setState({ isPlaying: false });
  useVPUStore.getState().resetVPU();
}

const DEFAULTS = {
  bucket: "ciroh-community-ngen-datastream",
  nexus_pmtiles: "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/nexus.pmtiles",
  community_pmtiles: "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/merged.pmtiles",
  // Flowpaths come from their own archive because merged.pmtiles only carries them from zoom 7.
  flowpaths_pmtiles:
    "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/only_geometry/upstream_index/flowpaths.pmtiles",
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
  /**
   * Whether the id index is loading, ready, or gave up.
   *
   * Held here rather than in the search box, and not in loadingText. The box's own state said
   * "Building the id index" for the rest of the session after the load had failed, and the
   * failure message went into loadingText where the next vpu load overwrote it, so a permanent
   * condition was reported by a transient field and then lost.
   */
  index_status: 'loading',
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
    /**
     * Move to another vpu, and stop animating the one being left.
     *
     * The reset used to wait for loadVpu, which only gets there after the s3 listing chain
     * resolves: several seconds in which playback kept stepping the old vpu's arrays while the
     * controls, the title and the map had already moved on. Whoever changes the vpu is the one
     * who knows it changed, so it happens here rather than at the end of a load.
     */
    set_vpu: (vpu) =>
      set((s) => {
        if (s.vpu === vpu) return s;
        stopAnimating();
        return { vpu };
      }),
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
    set_index_status: (index_status) =>
      set((s) => (s.index_status === index_status ? s : { index_status })),

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