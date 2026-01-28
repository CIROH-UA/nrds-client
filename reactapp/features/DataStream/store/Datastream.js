import { create } from 'zustand';
import { getYesterdayDateString } from '../lib/utils';

const useDataStreamStore = create((set) => ({
    bucket: 'ciroh-community-ngen-datastream',
    nexus_pmtiles: 'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/nexus.pmtiles',
    community_pmtiles: 'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/merged.pmtiles',
    hydrofabric_index: 'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/hydrofabric_index.parquet',
    cache_key: null,
    vpu: null,
    model: 'cfe_nom',
    date: `ngen.${getYesterdayDateString()}`,
    forecast: 'analysis_assim_extend',
    ensemble: null,
    cycle: '00',
    outputFile: null,
    variables: [],

    set_bucket: (newBucket) => set({ bucket: newBucket }),
    set_cache_key: (newCacheKey) => set({ cache_key: newCacheKey }),
    set_vpu: (newVpu) => set({ vpu: newVpu }),
    set_date: (newDate) => set({ date: newDate }),
    set_forecast: (newForecast) => set({ forecast: newForecast }),
    set_ensemble: (newEnsemble) => set({ ensemble: newEnsemble }),
    set_cycle: (newCycle) => set({ cycle: newCycle }),
    set_model: (newModel) => set({ model: newModel }),
    set_nexus_pmtiles: (newNexusPmtiles) => set({ nexus_pmtiles: newNexusPmtiles }),
    set_community_pmtiles: (newCommunityPmtiles) => set({ community_pmtiles: newCommunityPmtiles }),
    set_hydrofabric_index: (newHydrofabricIndex) => set({ hydrofabric_index: newHydrofabricIndex }),
    set_variables: (newVariables) => set({ variables: newVariables }),
    set_outputFile: (newOutputFile) => set({ outputFile: newOutputFile }),

    setAllState: (newState) => set({ 
        bucket: 'ciroh-community-ngen-datastream',
        ...newState
    }),

    reset: () => set({
        bucket: 'ciroh-community-ngen-datastream',
        nexus_pmtiles: 'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/nexus.pmtiles',
        community_pmtiles: 'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/merged.pmtiles',
        hydrofabric_index: 'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/hydrofabric_index.parquet',
        model: 'cfe_nom',
        cache_key: null,
        vpu: null,
        date: 'ngen.20251125',
        forecast: 'short_range',
        ensemble: null,
        cycle: '00',
        variables: [],
        outputFile: null,
    }),
}));


export default useDataStreamStore;