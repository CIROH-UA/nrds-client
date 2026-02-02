import { create } from 'zustand';
import { subscribeWithSelector } from "zustand/middleware";

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

const featureKey = (f) =>
  f?.id ?? f?.properties?.id ?? f?.properties?.feature_id ?? null;

const MAX_CACHED_VARS = 3;

export const useLayersStore = create(
  subscribeWithSelector((set, get) => ({
    nexus: { visible: false },
    catchments: { visible: true },
    flowpaths: { visible: true },
    conus_gauges: { visible: false },

    colorBounds: {
      flow: { min: 0, max: 100 },
      velocity: { min: 0, max: 5 },
      depth: { min: 0, max: 3 },
    },

    hovered_enabled: false,

    // ---- getters (fine to keep, but note: using get() doesn't subscribe) ----
    get_nexus_visibility: () => get().nexus.visible,
    get_catchments_visibility: () => get().catchments.visible,

    // ---- setters with guards ----
    set_hovered_enabled: (isEnabled) =>
      set((s) => (s.hovered_enabled === isEnabled ? s : { hovered_enabled: isEnabled })),

    set_nexus_visibility: (isVisible) =>
      set((s) => (s.nexus.visible === isVisible ? s : { nexus: { ...s.nexus, visible: isVisible } })),

    set_catchments_visibility: (isVisible) =>
      set((s) =>
        s.catchments.visible === isVisible ? s : { catchments: { ...s.catchments, visible: isVisible } }
      ),

    set_flowpaths_visibility: (isVisible) =>
      set((s) =>
        s.flowpaths.visible === isVisible ? s : { flowpaths: { ...s.flowpaths, visible: isVisible } }
      ),

    set_conus_gauges_visibility: (isVisible) =>
      set((s) =>
        s.conus_gauges.visible === isVisible
          ? s
          : { conus_gauges: { ...s.conus_gauges, visible: isVisible } }
      ),

    set_colorBounds: (key, bounds) =>
      set((s) => {
        const prev = s.colorBounds?.[key];
        if (!prev) return s;
        if (prev.min === bounds.min && prev.max === bounds.max) return s;
        return {
          colorBounds: {
            ...s.colorBounds,
            [key]: { ...prev, ...bounds },
          },
        };
      }),
  }))
);



export const useFeatureStore = create((set) => ({
  hovered_feature: null,
  selected_feature: null,

  set_selected_feature: (feature) =>
    set((s) => {
      // same reference OR same id => no update
      if (s.selected_feature === feature) return s;
      if (featureKey(s.selected_feature) === featureKey(feature)) return s;
      return { selected_feature: feature };
    }),

  set_hovered_feature: (feature) =>
    set((s) => {
      if (s.hovered_feature === feature) return s;
      if (featureKey(s.hovered_feature) === featureKey(feature)) return s;
      return { hovered_feature: feature };
    }),
}));


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
