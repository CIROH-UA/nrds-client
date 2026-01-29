import { create } from "zustand";

const DEFAULT_BUCKET = "ciroh-community-ngen-datastream";

/**
 * Compare arrays of option objects by value.
 * Assumes items look like: { value: string, label?: string, ... }
 * If your arrays are big, this is still O(n) but avoids lots of re-renders.
 */
function sameOptionsByValue(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    // stable “identity” for options
    if (ai?.value !== bi?.value) return false;
    // optionally also compare label if you want
  }
  return true;
}

/**
 * Compare primitive/strings safely.
 */
function samePrimitive(a, b) {
  return a === b;
}

const useS3DataStreamBucketStore = create((set, get) => ({
  bucket: DEFAULT_BUCKET,
  models: [],
  dates: [],
  forecasts: [],
  cycles: [],
  ensembles: [],
  outputFiles: [],
  prefix: "",

  set_bucket: (newBucket) =>
    set((s) => (samePrimitive(s.bucket, newBucket) ? s : { bucket: newBucket })),

  set_prefix: (newPrefix) =>
    set((s) => (samePrimitive(s.prefix, newPrefix) ? s : { prefix: newPrefix })),

  set_models: (newModels) =>
    set((s) => (sameOptionsByValue(s.models, newModels) ? s : { models: newModels })),

  set_dates: (newDates) =>
    set((s) => (sameOptionsByValue(s.dates, newDates) ? s : { dates: newDates })),

  set_forecasts: (newForecasts) =>
    set((s) =>
      sameOptionsByValue(s.forecasts, newForecasts) ? s : { forecasts: newForecasts }
    ),

  set_cycles: (newCycles) =>
    set((s) => (sameOptionsByValue(s.cycles, newCycles) ? s : { cycles: newCycles })),

  set_ensembles: (newEnsembles) =>
    set((s) =>
      sameOptionsByValue(s.ensembles, newEnsembles) ? s : { ensembles: newEnsembles }
    ),

  set_outputFiles: (newOutputFiles) =>
    set((s) =>
      sameOptionsByValue(s.outputFiles, newOutputFiles) ? s : { outputFiles: newOutputFiles }
    ),

  /**
   * Only update fields that truly changed.
   * Also keeps your "ensembles: []" default behavior unless explicitly provided.
   */
  setInitialData: (next) =>
    set((s) => {
      const patch = {};
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

      // Your original behavior: default ensembles to [] unless given.
      const nextEnsembles = next.ensembles ?? [];
      if (!sameOptionsByValue(s.ensembles, nextEnsembles)) {
        patch.ensembles = nextEnsembles;
        changed = true;
      }

      if (next.outputFiles && !sameOptionsByValue(s.outputFiles, next.outputFiles)) {
        patch.outputFiles = next.outputFiles;
        changed = true;
      }

      if (typeof next.prefix === "string" && !samePrimitive(s.prefix, next.prefix)) {
        patch.prefix = next.prefix;
        changed = true;
      }

      return changed ? patch : s;
    }),

  reset: () =>
    set((s) => {
      const alreadyDefault =
        s.bucket === DEFAULT_BUCKET &&
        s.prefix === "" &&
        s.models.length === 0 &&
        s.dates.length === 0 &&
        s.forecasts.length === 0 &&
        s.cycles.length === 0 &&
        s.ensembles.length === 0 &&
        s.outputFiles.length === 0;

      return alreadyDefault
        ? s
        : {
            bucket: DEFAULT_BUCKET,
            models: [],
            dates: [],
            forecasts: [],
            cycles: [],
            ensembles: [],
            outputFiles: [],
            prefix: "",
          };
    }),
}));

export default useS3DataStreamBucketStore;
