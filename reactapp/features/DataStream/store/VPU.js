import { create } from 'zustand';
import { sameArrayValues, sameObjectValues } from 'features/DataStream/lib/equality';
import { subscribeWithSelector } from 'zustand/middleware';

/** The animation's data: which features it covers, the clock it runs on, and the values per variable. */

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

export const useVPUStore = create(
  subscribeWithSelector((set, get) => ({
    featureIds: [],
    featureIdToIndex: {},
    times: [],
    valuesByVar: {},
    varDataOrder: [],

    getVarData: (variable) => get().valuesByVar?.[variable],
    setFeatureIds: (featureIds) =>
      set((s) => {
        if (sameArrayValues(s.featureIds, featureIds)) return s;
        return { featureIds };
      }),

    /** Sets featureIds + times + featureIdToIndex - avoids rebuilding objects if inputs are identical - avoids replacing featureIdToIndex if it would be identical by value */
    setAnimationIndex: (featureIds, times) =>
      set((s) => {
        const sameIds = sameArrayValues(s.featureIds, featureIds);
        const sameTimes = sameArrayValues(s.times, times);

        if (sameIds && sameTimes) return s;

        let nextMap = s.featureIdToIndex;
        if (!sameIds) {
          const built = buildFeatureIdToIndex(featureIds);
          nextMap = sameObjectValues(s.featureIdToIndex, built) ? s.featureIdToIndex : built;
        }

        return {
          featureIds: sameIds ? s.featureIds : featureIds,
          times: sameTimes ? s.times : times,
          featureIdToIndex: nextMap,
        };
      }),

    setVarData: (variable, flatValues) =>
      set((s) => {
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
        if (sameOrder && sameValues) return s;

        return { valuesByVar: nextValuesByVar, varDataOrder: nextOrder };
      }),

    resetVPU: () =>
      set((s) => {
        const emptyObj = {};
        if (
          s.featureIds.length === 0 &&
          s.times.length === 0 &&
          Object.keys(s.featureIdToIndex).length === 0 &&
          Object.keys(s.valuesByVar).length === 0 &&
          s.varDataOrder.length === 0
        ) {
          return s;
        }
        return {
          featureIds: [],
          times: [],
          featureIdToIndex: emptyObj,
          valuesByVar: emptyObj,
          varDataOrder: [],
        };
      }),
  }))
);
