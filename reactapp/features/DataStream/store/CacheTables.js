import { create } from 'zustand';
import { deleteFileFromCache, clearCache } from '../lib/opfsCache';
import { deleteTable, dropAllVpuDataTables } from '../lib/queryData';

const EMPTY_TABLE = [];

export const useCacheTablesStore = create((set) => ({
  cacheTables: EMPTY_TABLE,

  add_cacheTable: (newCacheTable) =>
    set((state) => ({
      cacheTables: [...state.cacheTables, newCacheTable],
    })),

  delete_cacheTable: async (tableId) => {
    // best-effort: don't abort if one step fails
    await deleteFileFromCache(tableId).catch((e) => {
      console.warn('[cacheTables] deleteFileFromCache failed:', tableId, e);
    });

    await deleteTable(tableId).catch((e) => {
      console.warn('[cacheTables] deleteTable failed:', tableId, e);
    });

    set((state) => ({
      cacheTables: state.cacheTables.filter((table) => table.id !== tableId),
    }));

    return true;
  },

  reset: async () => {
    // best-effort: attempt both regardless of failures
    await dropAllVpuDataTables().catch((e) => {
      console.warn('[cacheTables] dropAllVpuDataTables failed:', e);
    });

    await clearCache().catch((e) => {
      console.warn('[cacheTables] clearCache failed:', e);
    });

    set({ cacheTables: EMPTY_TABLE });
    return true;
  },

  set_cacheTables: (newCacheTables) => set({ cacheTables: newCacheTables }),
}));
