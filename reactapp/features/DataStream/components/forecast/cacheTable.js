import React, { Fragment, useCallback, useState } from 'react';
import { IoFolderOpenOutline, IoClose, IoSkullOutline } from "react-icons/io5";
import { IconLabel, Title, SButton } from '../styles/Styles';
import { useCacheTablesStore } from 'features/DataStream/store/CacheTables';

export const CacheTable = React.memo(({ tables }) => {
  const deleteCacheTable = useCacheTablesStore((state) => state.delete_cacheTable);
  const resetCacheTables = useCacheTablesStore((state) => state.reset);

  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingId, setDeletingId] = useState(null); // table id currently deleting

  const deleteSingleCache = useCallback(
    async (tableId) => {
      if (deletingAll || deletingId) return; // avoid concurrent deletes
       setDeletingId(tableId);
      try {
        await deleteCacheTable(tableId);
      } finally {
        setDeletingId(null);
      }
    },
    [deleteCacheTable, deletingAll, deletingId]
  );

  const deleteAllCache = useCallback(async () => {
    if (deletingAll || deletingId) return;
    setDeletingAll(true);
    try {
      await resetCacheTables();
    } finally {
      setDeletingAll(false);
    }
  }, [resetCacheTables, deletingAll, deletingId]);

  const disableAllButtons = deletingAll || deletingId != null;

  return (
    <Fragment>
      <IconLabel>
        <IoFolderOpenOutline />
        <Title>Files Loaded</Title>

        <SButton
          bsPrefix="btn2"
          onClick={deleteAllCache}
          disabled={disableAllButtons}
          aria-busy={deletingAll}
          title={deletingAll ? 'Deleting...' : 'Delete all cached tables'}
          style={{ opacity: disableAllButtons ? 0.6 : 1, cursor: disableAllButtons ? 'not-allowed' : 'pointer' }}
        >
          <IoSkullOutline size={15} />
        </SButton>

        {/* optional tiny status */}
        {deletingAll && (
          <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>
            Deleting...
          </span>
        )}
      </IconLabel>

      {tables && tables.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '3px', borderBottom: '1px solid #ddd' }}></th>
              <th style={{ textAlign: 'left', padding: '3px', borderBottom: '1px solid #ddd' }}>File</th>
              <th style={{ textAlign: 'left', padding: '3px', borderBottom: '1px solid #ddd' }}>Size</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((table, index) => {
              const isDeletingThis = deletingId === table.id || deletingAll;

              return (
                <tr key={index}>
                  <td
                    style={{
                      padding: '3px',
                      maxWidth: '20px',
                      borderBottom: '1px solid #eee',
                    }}
                  >
                    <SButton
                      bsPrefix="btn2"
                      onClick={() => deleteSingleCache(table.id)}
                      disabled={disableAllButtons}
                      aria-busy={isDeletingThis}
                      title={isDeletingThis ? 'Deleting...' : 'Delete table'}
                      style={{ opacity: disableAllButtons ? 0.6 : 1, cursor: disableAllButtons ? 'not-allowed' : 'pointer' }}
                    >
                      {/* optional: show X or text while deleting */}
                      {isDeletingThis ? (
                        <span style={{ fontSize: 10 }}>...</span>
                      ) : (
                        <IoClose size={15} />
                      )}
                    </SButton>
                  </td>

                  <td
                    title={table.name}
                    style={{
                      padding: '3px',
                      borderBottom: '1px solid #eee',
                      maxWidth: '100px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      cursor: 'help',
                    }}
                  >
                    {table.name || 'Unknown'}
                  </td>

                  <td
                    style={{
                      padding: '3px',
                      borderBottom: '1px solid #eee',
                      maxWidth: '70px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {table.size || 'N/A'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
          No cached tables available.
        </div>
      )}
    </Fragment>
  );
});
