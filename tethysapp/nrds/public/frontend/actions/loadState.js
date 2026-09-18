import { store } from '../store/app-store.js';

/**
 * Shared ownership of the loading state that the load actions write, ported from the React
 * DataStream loadState module (migration unit U3b). The vpu generation is the latest-wins guard:
 * every vpu load claims a number from startVpuLoad and treats itself as superseded once
 * currentVpuGeneration reports a higher one, so a newer selection's data never loses to a slower
 * older load. The plain loading counter drives the timeseries slice's `loading` flag, flipping it
 * off only when the last concurrent load finishes.
 */
let vpuGeneration = 0;
let vpuLoads = 0;
let loads = 0;

export const startVpuLoad = () => {
  vpuLoads += 1;
  vpuGeneration += 1;
  return vpuGeneration;
};

export const endVpuLoad = () => {
  vpuLoads = Math.max(0, vpuLoads - 1);
};

export const vpuLoadInFlight = () => vpuLoads > 0;

export const currentVpuGeneration = () => vpuGeneration;

/** Invalidate whatever vpu load is in flight without starting one. */
export const cancelVpuLoads = () => {
  vpuGeneration += 1;
  return vpuGeneration;
};

export const beginLoading = () => {
  loads += 1;
  const s = store.get().timeseries;
  if (!s.loading) store.set({ timeseries: { ...s, loading: true } });
};

export const endLoading = () => {
  loads = Math.max(0, loads - 1);
  if (loads !== 0) return;
  const s = store.get().timeseries;
  if (s.loading || s.pending) store.set({ timeseries: { ...s, loading: false, pending: false } });
};

/** Tests need the module's counters back at their starting values between cases. */
export const resetLoadState = () => {
  vpuGeneration = 0;
  vpuLoads = 0;
  loads = 0;
};
