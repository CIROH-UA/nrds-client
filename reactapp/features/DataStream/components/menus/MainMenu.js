import { Fragment } from 'react';
import ForecastMenu from 'features/DataStream/components/menus/ForecastMenu';

/**
 * What sits over the map.
 *
 * Only the forecast panel now. The layer control moved into the header, and the cached-files
 * panel was replaced by a single header button once the cache started holding one file.
 */
const MainMenu = () => {
  return (
    <Fragment>
      <ForecastMenu />
    </Fragment>
  );
};

export default MainMenu;
