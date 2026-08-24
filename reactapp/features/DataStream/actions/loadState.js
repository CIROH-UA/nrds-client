import useTimeSeriesStore from 'features/DataStream/store/Timeseries';

/** Shared ownership of the loading state that both load actions write. */
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
  useTimeSeriesStore.setState({ loading: true });
};

export const endLoading = () => {
  loads = Math.max(0, loads - 1);
  if (loads === 0) useTimeSeriesStore.setState({ loading: false, pending: false });
};

// Tests need the module's counters back at their starting values between cases.
export const resetLoadState = () => {
  vpuGeneration = 0;
  vpuLoads = 0;
  loads = 0;
};
