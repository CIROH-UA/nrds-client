/**
 * The one test that mounts the app, and it had been contributing nothing.
 *
 * It failed to load rather than failing an assertion: App reaches DatastreamView, which reaches
 * deck.gl, which reaches @mapbox/tiny-sdf, which ships untransformed esm. Jest reported "0
 * tests" and the suite counted as failing, so the wiring most likely to break on an import --
 * the header's chain into the cache layer, which broke twice during this rework -- had no
 * coverage at all. Its four assertions were also inherited from the project template and named
 * a different app and pages that do not exist here.
 *
 * The map view is mocked rather than transformed. What is worth smoke-testing is that the shell
 * and its controls mount and that nothing in the chain into duckdb throws on import; rendering
 * maplibre in jsdom tests the mock, not the app, and letting deck.gl through would mean
 * transforming node_modules for every suite to serve this one.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('features/DataStream/views/DatastreamView', () => function DataStreamView() {
  return <div data-testid="datastream-view" />;
});
jest.mock('features/Tethys/services/api/app', () => ({ getArrowPerVpu: jest.fn() }));
// The shell is gated on these four; unmocked they are real xhr in jsdom and the app never
// leaves its loading animation, which is all the inherited test ever asserted.
jest.mock('features/Tethys/services/api/tethys', () => ({
  __esModule: true,
  default: {
    getAppData: jest.fn().mockResolvedValue({ title: 'NRDS', icon: '', color: '#123456' }),
    getUserData: jest.fn().mockResolvedValue({ username: 'tester' }),
    getJWTToken: jest.fn().mockResolvedValue('jwt'),
    getCSRF: jest.fn().mockResolvedValue('csrf'),
  },
}));
jest.mock('features/DataStream/lib/queryData', () => ({
  loadIndexData: jest.fn().mockResolvedValue(undefined),
  getFeatureProperties: jest.fn().mockResolvedValue([]),
  checkForTable: jest.fn().mockResolvedValue(true),
}));
jest.mock('features/DataStream/store/CacheTables', () => ({
  useCacheTablesStore: (selector) =>
    selector({ cacheTables: [], refresh: jest.fn().mockResolvedValue([]), clear: jest.fn() }),
}));

const tethysAPI = require('features/Tethys/services/api/tethys').default;
const queryData = require('features/DataStream/lib/queryData');
const App = require('App').default;

// At the route App actually registers. The inherited test entered at /apps/nrds/, which is the
// served path but not the router's: the basename that makes those equal comes from the
// environment and is not applied by MemoryRouter.
const renderApp = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>
  );

// resetMocks is on for this project, which strips the factory implementations above.
beforeEach(() => {
  tethysAPI.getAppData.mockResolvedValue({ title: 'NRDS', icon: '', color: '#123456' });
  tethysAPI.getUserData.mockResolvedValue({ username: 'tester' });
  tethysAPI.getJWTToken.mockResolvedValue('jwt');
  tethysAPI.getCSRF.mockResolvedValue('csrf');
  queryData.loadIndexData.mockResolvedValue(undefined);
  queryData.getFeatureProperties.mockResolvedValue([]);
  queryData.checkForTable.mockResolvedValue(true);
});

describe('the app shell', () => {
  it('mounts, which is what the import chain into the cache layer keeps breaking', async () => {
    renderApp();

    expect(await screen.findByTestId('datastream-view')).toBeInTheDocument();
  });

  it('names itself', async () => {
    renderApp();

    // Its own name: the inherited version of this test looked for a different app entirely.
    expect(await screen.findByText(/NRDS/i)).toBeInTheDocument();
  });

  it('puts the search and the cache control in the header', async () => {
    renderApp();

    await screen.findByTestId('datastream-view');
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /cached data/i })
    ).toBeInTheDocument();
  });
});
