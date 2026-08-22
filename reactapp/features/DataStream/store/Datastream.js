import { create } from 'zustand';

import { cancelVpuLoads } from 'features/DataStream/actions/loadState';
import { cancelSelections } from 'features/DataStream/actions/selectionGeneration';
import { useVPUStore } from 'features/DataStream/store/VPU';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { getYesterdayDateString } from '../lib/utils';

/**
 * Leave a vpu: stop playback, drop its animation arrays, and disown the load still fetching it.
 *
 * Clearing the arrays is not enough on its own. A loadVpu already in flight for the vpu being
 * left is not superseded by the vpu field changing, so it reaches its next checkpoint, finds the
 * generation unchanged, and writes its animation arrays and variables in after the switch: the
 * data of the vpu just left, under the name of the one now selected. Bumping the generation is
 * how a cache clear disowns a running load, and leaving a vpu is the same act.
 *
 * An earlier version of this reached for the two stores with require() at call time, claiming a
 * static import would close a cycle. There is no cycle: neither store imports anything from
 * this project.
 */
function leaveCurrentVpu() {
  cancelVpuLoads();
  cancelSelections();
  useTimeSeriesStore.setState({ isPlaying: false });
  useVPUStore.getState().resetVPU();
}

const DEFAULTS = {
  bucket: "ciroh-community-ngen-datastream",
  community_pmtiles: "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/merged.pmtiles",
  // Flowpaths come from their own archive because merged.pmtiles only carries them from zoom 7.
  flowpaths_pmtiles:
    "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/only_geometry/upstream_index/flowpaths.pmtiles",
  // Served from this app's own static files, generated at image build time from the upstream
  // 103 MB index. Ten columns instead of 37, which is every column the app reads: four to
  // resolve and position a search, six the Feature Information panel labels.
  hydrofabric_index: "/static/nrds/data/hydrofabric_index_slim.parquet",
  // The upstream file, kept as a fallback rather than a default. A portal whose static was
  // collected before this artifact existed answers 404 for the path above, and a slow search is
  // a great deal better than none while that is sorted out.
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