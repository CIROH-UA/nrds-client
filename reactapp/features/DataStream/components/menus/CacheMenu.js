import React, { Fragment, useState, useEffect } from 'react';
import { CacheTable } from '../forecast/cacheTable';
import { CacheTableContainer, CacheButton } from '../styles/Styles';
import { IoFolderOpenOutline, IoClose } from "react-icons/io5";
import { useCacheTablesStore } from 'features/DataStream/store/CacheTables';
import { getFilesFromCache } from 'features/DataStream/lib/opfsCache';

export const CacheMenu = () => {
  const [open, setIsOpen] = useState(false);
  const tables = useCacheTablesStore((state) => state.cacheTables);
  const set_cacheTables = useCacheTablesStore((state) => state.set_cacheTables);
  useEffect(() => {
    const fetchCacheTables = async () => {
        const files = await getFilesFromCache()
        console.log("Fetched cache tables:", files);
        set_cacheTables(files);
    };
    fetchCacheTables();
  }, []);
  
  return (
    <Fragment>
      {open ? (
        <>
          <CacheButton
            $bgColor="#ffffff00"
            onClick={() => setIsOpen(prev => !prev)}
          >
            <IoClose size={20} />
          </CacheButton>

          <CacheTableContainer isOpen={open}>
            <CacheTable tables={tables} />
          </CacheTableContainer>
        </>
      ) : (
        <CacheButton onClick={() => setIsOpen(prev => !prev)}>
          <IoFolderOpenOutline size={20} />
        </CacheButton>
      )}
    </Fragment>
  );
};

