import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// _id first: callers flatten a map feature into {_id, layerId, ...properties}, so the id they
// deliberately chose for the layer lives there and there is no .properties to fall back on. A
// layer whose tiles carry no `id` used to key every selection as null, which the guard below
// reads as unchanged -- so the selection was silently dropped.
const featureKey = (f) =>
  f?._id ?? f?.id ?? f?.properties?.id ?? f?.properties?.feature_id ?? null;

// A null key means we could not identify the feature, which is not the same as knowing it is the
// one already held. Reading the two as equal is what silently dropped every update for a layer
// whose tiles carry no id, so an unidentifiable feature is always treated as a change.
const sameFeature = (a, b) => {
  const keyA = featureKey(a);
  return keyA !== null && keyA === featureKey(b);
};

export const useLayersStore = create(
  subscribeWithSelector((set, get) => ({
    catchments: { visible: true },
    flowpaths: { visible: true },
    conus_gauges: { visible: false },
    // Drawn by the basemap style rather than by this app, so its switch reaches into the style
    // instead of rendering a Layer of our own. Listed here so the legend can describe it.
    vpu: { visible: true },

    colorBounds: {
      flow: { min: 0, max: 100 },
      velocity: { min: 0, max: 5 },
      depth: { min: 0, max: 3 },
    },

    hovered_enabled: false,

    // ---- getters (fine to keep, but note: using get() doesn't subscribe) ----
    get_catchments_visibility: () => get().catchments.visible,

    // ---- setters with guards ----
    set_hovered_enabled: (isEnabled) =>
      set((s) => (s.hovered_enabled === isEnabled ? s : { hovered_enabled: isEnabled })),

    set_catchments_visibility: (isVisible) =>
      set((s) =>
        s.catchments.visible === isVisible ? s : { catchments: { ...s.catchments, visible: isVisible } }
      ),

    set_flowpaths_visibility: (isVisible) =>
      set((s) =>
        s.flowpaths.visible === isVisible ? s : { flowpaths: { ...s.flowpaths, visible: isVisible } }
      ),

    set_vpu_visibility: (isVisible) =>
      set((s) => (s.vpu.visible === isVisible ? s : { vpu: { ...s.vpu, visible: isVisible } })),

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
      if (sameFeature(s.selected_feature, feature)) return s;
      return { selected_feature: feature };
    }),

  set_hovered_feature: (feature) =>
    set((s) => {
      if (s.hovered_feature === feature) return s;
      if (sameFeature(s.hovered_feature, feature)) return s;
      return { hovered_feature: feature };
    }),
}));
