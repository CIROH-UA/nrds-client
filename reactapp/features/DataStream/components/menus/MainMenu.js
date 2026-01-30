import React, { Fragment } from 'react';
import ForecastMenu from 'features/DataStream/components/menus/ForecastMenu';
import { LayersMenu } from './LayersMenu';
import { CacheMenu } from './CacheMenu';

const MainMenu = () => {
  return (
    <Fragment>
        <ForecastMenu />
        <LayersMenu />
        <CacheMenu />
    </Fragment>
  );
};

export default MainMenu;