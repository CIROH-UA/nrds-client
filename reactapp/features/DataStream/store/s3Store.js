import { getOptionsFromURL } from '../lib/s3Utils';
import { create } from 'zustand';

const useS3DataStreamBucketStore = create((set) => ({
    bucket: 'ciroh-community-ngen-datastream',
    models: [],
    dates: [],
    forecasts: [],
    cycles: [],
    ensembles: [],
    outputFiles: [],
    prefix: '',
    set_bucket: (newBucket) => set({ bucket: newBucket }),
    set_models: (newModels) => set({ models: newModels }),
    set_dates: (newDates) => set({ dates: newDates }),
    set_forecasts: (newForecasts) => set({ forecasts: newForecasts }),
    set_cycles: (newCycles) => set({ cycles: newCycles }),
    set_ensembles: (newEnsembles) => set({ ensembles: newEnsembles }),
    set_outputFiles: (newOutputFiles) => set({ outputFiles: newOutputFiles}),
    set_prefix: (newPrefix) => set({ prefix: newPrefix }),
    reset: () => set({
        bucket: 'ciroh-community-ngen-datastream',
        models: [],
        dates: [],
        forecasts: [],
        cycles: [],
        ensembles: [],
        outputFiles: [],
        prefix: '',
    })
}));

export default useS3DataStreamBucketStore;