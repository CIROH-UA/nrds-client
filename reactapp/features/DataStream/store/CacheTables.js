import {create} from 'zustand';
import { deleteFileFromCache, clearCache } from '../lib/opfsCache';
import { deleteTable, dropAllVpuDataTables } from '../lib/queryData';
export const useCacheTablesStore = create((set) => ({
    cacheTables: [],
    add_cacheTable: (newCacheTable) => set((state) => ({
        cacheTables: [...state.cacheTables, newCacheTable],
    })),
    delete_cacheTable: async (tableId) => 
    {   
        await deleteFileFromCache(tableId);
        await deleteTable(tableId);
        set(
            (state) => ({
                cacheTables: state.cacheTables.filter(
                    (table) => table.id !== tableId
                ),
            })
        ) 
    },
    reset: async () => {
        await dropAllVpuDataTables();
        await clearCache();
        set({ cacheTables: [] })
    },

   set_cacheTables: (newCacheTables) => set({ cacheTables: newCacheTables }),
}));