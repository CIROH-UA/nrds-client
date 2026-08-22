import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * The animation's data: which features it covers, the clock it runs on, and the values per
 * variable.
 *
 * Split out of store/Layers.js, which still holds the visibility toggles and the hover/selection
 * that share none of this. The name mattered: store/Timeseries.js reaches in here for the clock,
 * and while this lived in a file called Layers.js nothing about that import said so. Anyone
 * adding a getter to the layers store, in the same file, could close a cycle without seeing it.
 * The direction is one way -- Timeseries reads VPU, VPU reads nothing -- and now the file names
 * say which way.
 */

const sameArrayRefOrValues = (a, b) =>
  a === b ||
  (!!a &&
    !!b &&
    a.length === b.length &&
    a.every((v, i) => v === b[i]));

const shallowEqualObj = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
};

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

    // Optional convenience getters
    getVarData: (variable) => get().valuesByVar?.[variable],
    set_feature_ids: (featureIds) =>
      set((s) => {
        if (sameArrayRefOrValues(s.featureIds, featureIds)) return s;
        return { featureIds };
      }),

    /**
     * Sets featureIds + times + featureIdToIndex
     * - avoids rebuilding objects if inputs are identical
     * - avoids replacing featureIdToIndex if it would be identical by value
     */
    setAnimationIndex: (featureIds, times) =>
      set((s) => {
        const sameIds = sameArrayRefOrValues(s.featureIds, featureIds);
        const sameTimes = sameArrayRefOrValues(s.times, times);

        // if both are same, do nothing
        if (sameIds && sameTimes) return s;

        // Only rebuild mapping if featureIds changed
        let nextMap = s.featureIdToIndex;
        if (!sameIds) {
          const built = buildFeatureIdToIndex(featureIds);
          nextMap = shallowEqualObj(s.featureIdToIndex, built) ? s.featureIdToIndex : built;
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

        const sameOrder = sameArrayRefOrValues(s.varDataOrder, nextOrder);
        const sameValues =
          nextValuesByVar === s.valuesByVar || shallowEqualObj(s.valuesByVar, nextValuesByVar);
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
