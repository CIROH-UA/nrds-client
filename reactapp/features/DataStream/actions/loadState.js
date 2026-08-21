import useTimeSeriesStore from 'features/DataStream/store/Timeseries';

/**
 * Shared ownership of the loading state that both load actions write.
 *
 * Until this existed, loadVpu and loadTimeseries each kept a private request counter and could
 * only supersede themselves. Three defects followed from that. A click arriving during a vpu
 * load raced the rebuild of the very table it needed. Whichever action finished first cleared
 * the spinner, whether or not the other was still working. And a load orphaned by a vpu switch
 * could still write its results, since nothing told it the dataset underneath had changed.
 *
 * Two ideas fix all three. A vpu generation, bumped whenever a vpu load starts, which any
 * older work checks before writing. And a count of loads in flight rather than a boolean, so
 * the spinner goes out when the last one finishes instead of the first.
 *
 * The relationship between the two actions is deliberately asymmetric: a vpu load invalidates
 * series loads, because it replaces the table they read, but a series load never invalidates a
 * vpu load. It defers to it instead.
 *
 * Neither takes an AbortSignal, and unmounting cannot cancel work already in flight. That is
 * sound only because DataStreamView is mounted for the life of the page: it holds the duckdb
 * worker and tears it down on unmount, so there is no "unmounted but still running" state to
 * protect against. Anything that makes the view unmountable mid-session needs a real signal
 * threaded through both actions.
 *
 * The load count is structure rather than a fix for anything observable today: a vpu load does
 * nothing after the series load it finishes with, so a boolean would look identical from the
 * outside. It is here so that stops being true silently. No test pins it, deliberately -- the
 * deferral above is what closes the race a stray click used to open, and that is tested.
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

/**
 * Invalidate whatever vpu load is in flight without starting one.
 *
 * Clearing the cache used to leave a running load alone, and that load went on to write its
 * animation arrays and its table into the stores after the clear: the data came back on its own
 * a few seconds after the reader had thrown it away. Bumping the generation is all it takes,
 * since every step of loadVpu already checks it before writing. The count is untouched: the
 * load still runs to its finally, which is what balances the spinner.
 */
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
  if (loads === 0) useTimeSeriesStore.setState({ loading: false });
};

// Tests need the module's counters back at their starting values between cases.
export const resetLoadState = () => {
  vpuGeneration = 0;
  vpuLoads = 0;
  loads = 0;
};
