import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { useVPUStore } from 'features/DataStream/store/Layers';

/**
 * How many steps the time cursor may take.
 *
 * The animation's clock rather than the chart's. currentTimeIndex drives both the map animation
 * and the chart cursor, but only the chart's series depends on a feature being selected -- with
 * nothing selected it is empty, and bounding the index by it meant every mutator here returned
 * early. The slider would then report the animation's full length and refuse to move a step.
 *
 * The series is the fallback for the case with no animation loaded, which is how the chart
 * behaved on its own before the map had one.
 */
const stepCount = (series) => useVPUStore.getState().times.length || series?.length || 0;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const EMPTY_SERIES = [];
const DEFAULT_LAYOUT = Object.freeze({
  yaxis: 'Streamflow',
  xaxis: 'Simulation Time Period (YYYY-MM-DD)',
  title: 'TimeSeries',
});

const useTimeSeriesStore = create(
  subscribeWithSelector((set, get ) => ({
      series: EMPTY_SERIES,
      feature_id: null,
      variable: '',
      layout: DEFAULT_LAYOUT,
      
      loading: false,
      loadingText: '' ,
      // Whose data `series` holds, as vpu|variable|feature; null means nothing is loaded.
      last_loaded_key: null,
      /**
       * The request a load last answered, whether or not it found anything.
       *
       * Separate from last_loaded_key, which means "this series is charted" and is what the
       * already-charted short circuit reads. The chart needs the other question: has an answer
       * arrived at all. One key answered both until an empty result stopped being recorded as
       * charted, and then the chart read as still loading for ever after a load that completed
       * and found nothing.
       */
      last_answered_key: null,
      // What went wrong last, as {kind, ...}, so failure is readable without parsing prose.
      last_error: null,
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

          // No fingerprint guard: two features can share endpoints and differ in between.

          // A shorter series can leave the playback index past the end.
          const maxIdx = Math.max(0, (nextSeries?.length || 0) - 1);
          if (s.currentTimeIndex > maxIdx) {
            return { series: nextSeries, currentTimeIndex: maxIdx };
          }
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
          const maxIdx = Math.max(0, stepCount(s.series) - 1);
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
        const maxIdx = stepCount(series) - 1;
        if (maxIdx < 0) return;
        set({ currentTimeIndex: (currentTimeIndex + 1) % (maxIdx + 1) });
      },

      stepBackward: () => {
        const { series, currentTimeIndex } = get();
        const maxIdx = stepCount(series) - 1;
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
      
      set_chart_layout: (newLayout) => set({ chart_layout: newLayout }),
      set_variable: (newVariable) => set({ variable: newVariable }),
      reset_series: () =>
        set((s) => {
          if (
            s.series === EMPTY_SERIES &&
            s.currentTimeIndex === 0 &&
            s.isPlaying === false &&
            s.last_loaded_key === null &&
            s.last_answered_key === null
          ) {
            return s;
          }
          return {
            series: EMPTY_SERIES,
            currentTimeIndex: 0,
            isPlaying: false,
            last_loaded_key: null,
            last_answered_key: null,
          };
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
          last_loaded_key: null,
          last_answered_key: null,
          last_error: null,
        })),
  }))
);
export default useTimeSeriesStore;