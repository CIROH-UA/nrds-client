import { create } from 'zustand';
import { clearCache, getFilesFromCache } from '../lib/opfsCache';
import useTimeSeriesStore from './Timeseries';
import { useVPUStore, useFeatureStore } from './Layers';
import { dropAllVpuDataTables } from '../lib/queryData';
import { terminateDatabase } from '../lib/duckdbClient';

const EMPTY_TABLE = [];

/**
 * Forget everything derived from a table that no longer exists.
 *
 * The animation arrays, the charted series, and last_loaded_key were all built from a table
 * the clear just dropped. Leaving them meant the map kept animating values with no table
 * behind them, and last_loaded_key made a re-click of the same feature look like a duplicate
 * request and return early.
 *
 * The selection goes too. Resetting only the vpu took the flowpaths off the map but left the
 * panel sitting over a plot of numbers no longer on disk, since the panel is open whenever
 * feature_id is set, and left the catchment outlined, since that highlight comes from
 * selected_feature. Clearing the cache is a start-over, so it lands on the same state the
 * panel's own clear control does.
 */
const invalidateDerivedState = () => {
  useVPUStore.getState().resetVPU();
  useTimeSeriesStore.getState().reset();
  useFeatureStore.getState().set_selected_feature(null);
};

/**
 * What is on disk, and a way to throw it away.
 *
 * Reads the cache rather than tracking it. This store used to maintain its own list through
 * add and delete calls alongside the directory listing taken at mount, and the two disagreed:
 * the same file appeared once per load, each row with its own delete button. There is at most
 * one data file now, so the listing is cheap and it cannot drift from what OPFS actually holds.
 */
export const useCacheTablesStore = create((set) => ({
  cacheTables: EMPTY_TABLE,

  refresh: async () => {
    const files = await getFilesFromCache().catch((e) => {
      console.warn('[cacheTables] could not list the cache:', e);
      return null;
    });
    set({ cacheTables: files ?? EMPTY_TABLE });
    return files ?? EMPTY_TABLE;
  },

  clear: async () => {
    // Best effort in order: tables, then files, then the worker holding them open.
    await dropAllVpuDataTables().catch((e) => {
      console.warn('[cacheTables] dropAllVpuDataTables failed:', e);
    });

    await clearCache().catch((e) => {
      console.warn('[cacheTables] clearCache failed:', e);
    });

    await terminateDatabase().catch((e) => {
      console.warn('[cacheTables] terminateDatabase failed:', e);
    });

    set({ cacheTables: EMPTY_TABLE });
    invalidateDerivedState();
    return true;
  },
}));
