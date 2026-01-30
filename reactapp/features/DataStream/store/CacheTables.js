import {create} from 'zustand';
import { deleteFileFromCache, clearCache } from '../lib/opfsCache';
import { deleteTable, dropAllVpuDataTables } from '../lib/queryData';

const EMPTY_TABLE = []

export const useCacheTablesStore = create((set) => ({
    cacheTables: EMPTY_TABLE,
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
        set({ cacheTables: EMPTY_TABLE });
    },

   set_cacheTables: (newCacheTables) => set({ cacheTables: newCacheTables }),
}));