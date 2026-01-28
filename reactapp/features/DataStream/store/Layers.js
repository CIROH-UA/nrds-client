import { create } from 'zustand';
import { subscribeWithSelector } from "zustand/middleware";

export const useLayersStore = create(
    subscribeWithSelector((set) => ({
        nexus: {
            visible: false,
        },
        catchments: {
            visible: true,
        },
        flowpaths: {
            visible: true
        },
        conus_gauges: {
            visible: false
        },
        colorBounds: {
            flow: { min: 0, max: 100 },
            velocity: { min: 0, max: 5 },
            depth: { min: 0, max: 3 },
        },
        hovered_enabled: false,
        set_hovered_enabled: (isEnabled) => set({ hovered_enabled: isEnabled }),
        get_nexus_visibility: () => get().nexus.visible,
        get_catchments_visibility: () => get().catchments.visible,
        set_nexus_visibility: (isVisible) => set((state) => ({
            nexus: {
                ...state.nexus,
                visible: isVisible,
            },
        })),
        set_catchments_visibility: (isVisible) => set((state) => ({
            catchments: {
                ...state.catchments,
                visible: isVisible,
            },
        })),
        set_flowpaths_visibility: (isVisible) => set((state) => ({
            flowpaths: {
                ...state.flowpaths,
                visible: isVisible
            }
        })),
        set_conus_gauges_visibility: (isVisible) => set((state) => ({
            conus_gauges: {
                ...state.conus_gauges,
                visible: isVisible
            }
        }))
    })));


export const useFeatureStore = create((set) => ({
    hovered_feature: null,
    selected_feature: null,
    
    set_selected_feature: (feature) =>
        set(() => ({
            selected_feature: feature,
        })),
    set_hovered_feature: (feature) =>
        set(() => ({
            hovered_feature: feature,
        })),
}));


// ---------- small helpers ----------
const sameArrayRefOrValues = (a, b) =>
  a === b ||
  (!!a &&
    !!b &&
    a.length === b.length &&
    a.every((v, i) => v === b[i]));

// shallow compare for plain objects: same keys + same values by ===
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

// build mapping (your original logic)
const buildFeatureIdToIndex = (featureIds) => {
  const m = {};
  for (let idx = 0; idx < featureIds.length; idx++) {
    const id = featureIds[idx];
    m[id] = idx;
    m[`wb-${id}`] = idx;
  }
  return m;
};

// ---------- store ----------
export const useVPUStore = create(
  subscribeWithSelector((set, get) => ({
    featureIds: [],
    featureIdToIndex: {},
    times: [],
    valuesByVar: {},

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

        // if same reference, no update (most important guard)
        if (prev === flatValues) return s;

        const nextValuesByVar = { ...s.valuesByVar, [variable]: flatValues };

        if (shallowEqualObj(s.valuesByVar, nextValuesByVar)) return s;

        return { valuesByVar: nextValuesByVar };
      }),

    resetVPU: () =>
      set((s) => {
        const emptyObj = {};
        if (
          s.featureIds.length === 0 &&
          s.times.length === 0 &&
          Object.keys(s.featureIdToIndex).length === 0 &&
          Object.keys(s.valuesByVar).length === 0
        ) {
          return s;
        }
        return { featureIds: [], times: [], featureIdToIndex: emptyObj, valuesByVar: emptyObj };
      }),
  }))
);