import React,{ useEffect} from 'react';
import { MapContainer, ViewContainer } from 'features/DataStream/components/styles/Styles';
import { ToastContainer } from 'react-toastify';
import MapComponent from 'features/DataStream/components/map/Mapg.js';
import MainMenu from 'features/DataStream/components/menus/MainMenu';
import { terminateDatabase } from 'features/DataStream/lib/duckdbClient';
import { InitialS3Loader } from 'features/DataStream/views/InitialS3Loader';
import 'maplibre-gl/dist/maplibre-gl.css';

const DataStreamView = () => {
  useEffect(() => {
    return () => {
      void terminateDatabase().catch((err) => {
        console.warn('Failed to terminate DuckDB worker on DataStreamView unmount:', err);
      });
    };
  }, []);

  return (
    <ViewContainer>
      <InitialS3Loader />
      <ToastContainer stacked  />
        <MapContainer>
          <MapComponent/>
        </MapContainer >
        <MainMenu/>
    </ViewContainer>
  );
};
export default DataStreamView;
