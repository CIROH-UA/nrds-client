import { Fragment } from 'react';
import ForecastMenu from 'features/DataStream/components/menus/ForecastMenu';
import { ControlMenu } from 'features/DataStream/components/menus/ControlMenu';

/** What sits over the map. */
const MainMenu = () => {
  return (
    <Fragment>
      <ControlMenu />
      <ForecastMenu />
    </Fragment>
  );
};

export default MainMenu;
