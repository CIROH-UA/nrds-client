import { Fragment, useCallback, useState } from 'react';
import { IoFolderOpenOutline, IoClose, IoSkullOutline } from "react-icons/io5";
import { MdInfoOutline } from "react-icons/md";
import { IconLabel, Title, SButton  } from '../styles/Styles';

import { LayerInfoModal } from '../Modals';
import { useCacheTablesStore } from 'features/DataStream/store/CacheTables';

export const CacheTable = ({tables}) => {
    const [modalLayerInfoShow, setModalLayerInfoShow] = useState(false);
    const deleteCacheTable = useCacheTablesStore((state) => state.delete_cacheTable);
    const resetCacheTables = useCacheTablesStore((state) => state.reset);
    
    const deleteSingleCache = useCallback(
        async (tableId) => {
            console.log("Delete cache table:", tableId);
            deleteCacheTable(tableId);
        },
        [deleteCacheTable]
    );
    
    const deleteAllCache = useCallback(async () => {
        console.log("Delete all cache tables");
        resetCacheTables();
    }, [resetCacheTables]);


  return (
    <Fragment>
      <IconLabel>
        <IoFolderOpenOutline />
        <Title>Files Loaded</Title>
        <SButton bsPrefix='btn2' onClick={() => setModalLayerInfoShow(true)}>
          <MdInfoOutline size={15} />
        </SButton>
         <SButton bsPrefix='btn2' onClick={() => deleteAllCache()} >
          <IoSkullOutline size={15} />
        </SButton>
        
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
            {tables.map((table, index) => (
              <tr key={index}>
                <td
                    style={{ 
                        padding: '3px',
                        maxWidth: '20px',
                        borderBottom: '1px solid #eee',
                    }}
                >
                    <SButton bsPrefix='btn2' onClick={() => {
                        deleteSingleCache(table.id);
                    }}>
                        <IoClose size={15} />
                    </SButton>
                </td>
                <td 
                  title={table.name } 
                  style={{ 
                    padding: '3px',   
                    borderBottom: '1px solid #eee',
                    maxWidth: '100px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    cursor: 'help'
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
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>No cached tables available.</div>
      )}
     <LayerInfoModal
        show={modalLayerInfoShow}
        onHide={() => setModalLayerInfoShow(false)}
      />
    </Fragment>
  );
};