import { useEffect } from 'react';
import { Route } from 'react-router-dom';

import ErrorBoundary from 'features/Tethys/components/error/ErrorBoundary';
import Layout from 'features/Tethys/components/layout/Layout';
import Loader from 'features/Tethys/components/loader/Loader';
import 'App.scss';


import DataStreamView from 'features/DataStream/views/DatastreamView';
import { reclaimLegacyOpfsCache } from 'features/DataStream/lib/reclaimOpfs';


function App() {
  const PATH_HOME = '/';

  useEffect(() => {
    void reclaimLegacyOpfsCache();
  }, []);

  return (
    <>
      <ErrorBoundary>
          <Loader>
            <Layout 

              routes={[
                <Route path={PATH_HOME} element={<DataStreamView />} key='route-home' />,
              ]}
            />
          </Loader>
      </ErrorBoundary>
    </>
  );
}

export default App;