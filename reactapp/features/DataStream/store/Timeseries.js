import { create } from 'zustand';
// Define the store
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const useTimeSeriesStore = create((set, get ) => ({
    series: [],
    feature_id: null,
    variable: '',
    layout: {
        "yaxis": "Streamflow",
        "xaxis": "Simulation Time Period (YYYY-MM-DD)",
        "title": "TimeSeries",
    },
    loading: false,
    loadingText: '' ,
    currentTimeIndex: 0,

    // playback state
    isPlaying: false,
    playSpeed: 10,       
    baseFrameMs: 2500,   
    setCurrentTimeIndex: (idx) => {
      const { series } = get();
      const maxIdx = Math.max(0, series.length - 1);
      set({ currentTimeIndex: clamp(Number(idx) || 0, 0, maxIdx) });
    },

    setPlaySpeed: (speed) => {
      const s = clamp(Number(speed) || 1, 1, 20);
      set({ playSpeed: s });
    },

    toggleIsPlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),

    // --- stepping used by back/forward buttons + autoplay ---
    stepForward: () => {
      const { series, currentTimeIndex } = get();
      const maxIdx = series.length - 1;
      if (maxIdx < 0) return;
      set({ currentTimeIndex: (currentTimeIndex + 1) % (maxIdx + 1) });
    },

    stepBackward: () => {
      const { series, currentTimeIndex } = get();
      const maxIdx = series.length - 1;
      if (maxIdx < 0) return;
      set({ currentTimeIndex: currentTimeIndex === 0 ? maxIdx : currentTimeIndex - 1 });
    },

    // --- derived helper used by the slider label ---
    // returns "T+Nh" assuming 1-hour timesteps; falls back gracefully
    getCurrentTimeLabel: () => {
      const { series, currentTimeIndex } = get();
      const t0 = series?.[0]?.time;
      const t = series?.[currentTimeIndex]?.time;
      if (typeof t0 !== "number" || typeof t !== "number") return "T+0h";
      const hours = Math.round((t - t0) / 3600000); // ms -> hours
      return `T+${hours}h`;
    },
    set_loading: (isLoading) => set({ loading: isLoading }),
    set_loading_text: (newLoadingText) => set({ loadingText: newLoadingText }),
    set_feature_id: (newFeatureId) => set({ feature_id: newFeatureId }),
    set_series: (newSeries) => set({ series: newSeries }),
    set_chart_layout: (newLayout) => set({ chart_layout: newLayout }),
    set_variable: (newVariable) => set({ variable: newVariable }),
    set_layout: (newLayout) => set({layout: newLayout }),
    reset_series: () => set({ series: [], currentTimeIndex: 0, isPlaying: false }),
    reset: () => set({
        series: [],
        feature_id: null,
        variable: '',
        layout: {
            "yaxis": "Streamflow",
            "xaxis": "Simulation Time Period (YYYY-MM-DD)",
            "title": "TimeSeries",
        },
    }),
}));
export default useTimeSeriesStore;




