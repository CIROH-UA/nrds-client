import PropTypes from 'prop-types';
import { useState, useEffect } from 'react';

import tethysAPI from 'features/Tethys/services/api/tethys';
import LoadingAnimation from 'features/Tethys/components/loader/LoadingAnimation';
import { AppContext } from 'features/Tethys/context/context';

const APP_ID = process.env.TETHYS_APP_ID;
const LOADER_DELAY = process.env.TETHYS_LOADER_DELAY;
const LOADER_DELAY_MS = Number(LOADER_DELAY) || 0;

function Loader({children}) {
  const [error, setError] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [appContext, setAppContext] = useState(null);

  useEffect(() => {
    let active = true;
    const timeoutIds = [];
    const schedule = (callback) => {
      const timeoutId = setTimeout(() => {
        if (active) callback();
      }, LOADER_DELAY_MS);
      timeoutIds.push(timeoutId);
    };
    const handleError = (nextError) => {
      // Delay setting the error to avoid flashing the loading animation
      schedule(() => {
        setError(nextError);
      });
    };
    Promise.all([
        tethysAPI.getAppData(APP_ID), 
        tethysAPI.getUserData(),
        tethysAPI.getJWTToken(),
      ])
      .then(([tethysApp, user, jwt]) => {
        // Update app context
        if (!active) return;
        setAppContext({tethysApp, user, jwt});

        // Allow for minimum delay to display loader
        schedule(() => {
          setIsLoaded(true)
        });
      })
      .catch(handleError);
      
    return () => {
      active = false;
      timeoutIds.forEach((id) => clearTimeout(id));
    };
  }, []);

  if (error) {
    // Throw error so it will be caught by the ErrorBoundary
    throw error;
  } else if (!isLoaded) {
    return (
      <LoadingAnimation />
    );
  } else {
    return (
      <>
        <AppContext.Provider value={appContext}>
          {children}
        </AppContext.Provider>
      </>
    );
  }
}

Loader.propTypes = {
  children: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.element),
    PropTypes.element,
  ]),
};

export default Loader;
