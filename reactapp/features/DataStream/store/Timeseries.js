import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const EMPTY_SERIES = [];
const DEFAULT_LAYOUT = Object.freeze({
  yaxis: 'Streamflow',
  xaxis: 'Simulation Time Period (YYYY-MM-DD)',
  title: 'TimeSeries',
});

function seriesFingerprint(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 'empty';
  const first = arr[0];
  const last = arr[arr.length - 1];
  const fx = first?.x instanceof Date ? first.x.getTime() : first?.x;
  const lx = last?.x instanceof Date ? last.x.getTime() : last?.x;
  return `${arr.length}|${fx}|${first?.y}|${lx}|${last?.y}`;
}

const useTimeSeriesStore = create(
  subscribeWithSelector((set, get ) => ({
      series: EMPTY_SERIES,
      feature_id: null,
      variable: '',
      layout: DEFAULT_LAYOUT,
      
      loading: false,
      loadingText: '' ,
      currentTimeIndex: 0,

      isPlaying: false,
      playSpeed: 10,       
      baseFrameMs: 2500,   
      set_series: (nextSeries) => {
        set((s) => {
          const prev = s.series;

          // same ref => no update
          if (prev === nextSeries) return s;

          // both empty => no update (this is the one your screenshot screams about)
          const prevEmpty = !prev || prev.length === 0;
          const nextEmpty = !nextSeries || nextSeries.length === 0;
          if (prevEmpty && nextEmpty) return s;

          // "equal by value" guard (cheap)
          if (seriesFingerprint(prev) === seriesFingerprint(nextSeries)) return s;

          return { series: nextSeries };
        });
      },
      set_layout: (next) =>
        set((s) => {
          const prev = s.layout;
          if (
            prev?.title === next?.title &&
            prev?.xaxis === next?.xaxis &&
            prev?.yaxis === next?.yaxis
          ) {
            return s;
          }
          return { layout: next };
        }),    
      setCurrentTimeIndex: (idx) => {
        set((s) => {
          const maxIdx = Math.max(0, (s.series?.length || 0) - 1);
          const next = clamp(Number(idx) || 0, 0, maxIdx);
          if (next === s.currentTimeIndex) return s;   // IMPORTANT
          return { currentTimeIndex: next };
        });
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

      // returns "T+Nh" assuming 1-hour timesteps;
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
      
      set_chart_layout: (newLayout) => set({ chart_layout: newLayout }),
      set_variable: (newVariable) => set({ variable: newVariable }),
      reset_series: () =>
        set((s) => {
          if (s.series === EMPTY_SERIES && s.currentTimeIndex === 0 && s.isPlaying === false) return s;
          return { series: EMPTY_SERIES, currentTimeIndex: 0, isPlaying: false};
        }),

      reset: () =>
        set((s) => ({
          ...s,
          series: EMPTY_SERIES,
          feature_id: null,
          variable: '',
          layout: DEFAULT_LAYOUT,
          currentTimeIndex: 0,
          isPlaying: false,
        })),
  }))
);
export default useTimeSeriesStore;