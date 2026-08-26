import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { useLayersStore } from 'features/DataStream/store/Layers';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { animationIsOnMap } from 'features/DataStream/lib/flowpaths';

/** How many steps the time cursor may take. */
const stepCount = (series) => useVPUStore.getState().times.length || series?.length || 0;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const EMPTY_SERIES = [];
const DEFAULT_LAYOUT = Object.freeze({
  yaxis: 'Streamflow',
  xaxis: 'Simulation Time Period (YYYY-MM-DD)',
  title: 'TimeSeries',
});

/** The charted series and the clock the animation runs on. */
const useTimeSeriesStore = create(
  subscribeWithSelector((set, get ) => ({
      series: EMPTY_SERIES,
      feature_id: null,
      variable: '',
      layout: DEFAULT_LAYOUT,
      
      loading: false,
      /** Work promised but not yet begun. */
      pending: false,
      loadingText: '' ,
      last_loaded_key: null,
      last_answered_key: null,
      last_error: null,
      currentTimeIndex: 0,

      isPlaying: false,
      playSpeed: 10,       
      baseFrameMs: 2500,   
      set_series: (nextSeries) => {
        set((s) => {
          const prev = s.series;

          if (prev === nextSeries) return s;

          const prevEmpty = !prev || prev.length === 0;
          const nextEmpty = !nextSeries || nextSeries.length === 0;
          if (prevEmpty && nextEmpty) return s;

          const maxIdx = Math.max(0, stepCount(nextSeries) - 1);
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
          if (next === s.currentTimeIndex) return s;
          return { currentTimeIndex: next };
        });
      },

      setPlaySpeed: (speed) => {
        const s = clamp(Number(speed) || 1, 1, 20);
        set({ playSpeed: s });
      },

      toggleIsPlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),

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

      getCurrentTimeLabel: () => {
        const { series, currentTimeIndex } = get();
        const t0 = series?.[0]?.time;
        const t = series?.[currentTimeIndex]?.time;
        if (typeof t0 !== "number" || typeof t !== "number") return "T+0h";
        const hours = Math.round((t - t0) / 3600000);
        return `T+${hours}h`;
      },
      set_loading: (isLoading) => set({ loading: isLoading }),
      set_loading_text: (newLoadingText) => set({ loadingText: newLoadingText }),
      
      set_chart_layout: (newLayout) => set({ chart_layout: newLayout }),
      set_variable: (newVariable) => set({ variable: newVariable }),
      reset_series: () =>
        set((s) => {
          const animating = useVPUStore.getState().times.length > 0;
          const clock = animating
            ? { currentTimeIndex: s.currentTimeIndex, isPlaying: s.isPlaying }
            : { currentTimeIndex: 0, isPlaying: false };
          if (
            s.series === EMPTY_SERIES &&
            s.currentTimeIndex === clock.currentTimeIndex &&
            s.isPlaying === clock.isPlaying &&
            s.last_loaded_key === null &&
            s.last_answered_key === null
          ) {
            return s;
          }
          return {
            series: EMPTY_SERIES,
            ...clock,
            last_loaded_key: null,
            last_answered_key: null,
          };
        }),

      reset: () =>
        set((s) => ({
          ...s,
          series: EMPTY_SERIES,
          pending: false,
          loadingText: '',
          feature_id: null,
          layout: DEFAULT_LAYOUT,
          last_loaded_key: null,
          last_answered_key: null,
          last_error: null,
        })),
  }))
);
/** Playback stops when there is nothing left to play. */
const stopPlaybackWithNothingToPlay = () => {
  if (!useTimeSeriesStore.getState().isPlaying) return;
  const onMap = animationIsOnMap({
    times: useVPUStore.getState().times,
    flowpathsVisible: useLayersStore.getState().flowpaths.visible,
  });
  if (!onMap) useTimeSeriesStore.setState({ isPlaying: false });
};

useVPUStore.subscribe((s) => s.times, stopPlaybackWithNothingToPlay);
useLayersStore.subscribe((s) => s.flowpaths.visible, stopPlaybackWithNothingToPlay);

export default useTimeSeriesStore;
