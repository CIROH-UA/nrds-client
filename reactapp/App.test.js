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
 * The map view is mocked, because it reaches deck.gl and letting that through would mean
 * transforming node_modules for every suite to serve this one file. Nothing else is: the header's
 * chain into queryData, opfsCache and the cache store is imported for real, and only
 * duckdbClient is faked, since duckdb-wasm wants a Worker jsdom cannot give it. An earlier
 * version of this file mocked those modules wholesale and so never imported the chain it claimed
 * to cover, which a reviewer caught and which is worth stating plainly here.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('features/DataStream/views/DatastreamView', () => function DataStreamView() {
  return <div data-testid="datastream-view" />;
});
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
// Only the leaf that needs a real browser: duckdb-wasm wants a Worker it can instantiate.
// Everything between App and here imports for real -- queryData, opfsCache, CacheTables -- which
// is the chain this test exists to catch, and mocking those modules wholesale would have meant
// the test never loaded them at all.
jest.mock('features/DataStream/lib/duckdbClient', () => ({
  getDuckDB: jest.fn().mockRejectedValue(new Error('no duckdb in jsdom')),
  getConnection: jest.fn().mockRejectedValue(new Error('no duckdb in jsdom')),
  terminateDatabase: jest.fn().mockResolvedValue(undefined),
  resetDatabase: jest.fn().mockResolvedValue(undefined),
}));

const tethysAPI = require('features/Tethys/services/api/tethys').default;
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
  const duckdb = require('features/DataStream/lib/duckdbClient');
  duckdb.getConnection.mockRejectedValue(new Error('no duckdb in jsdom'));
  duckdb.getDuckDB.mockRejectedValue(new Error('no duckdb in jsdom'));
  duckdb.terminateDatabase.mockResolvedValue(undefined);
});

describe('the app shell', () => {
  it('mounts, which is what the import chain into the cache layer keeps breaking', async () => {
    renderApp();

    expect(await screen.findByTestId('datastream-view')).toBeInTheDocument();
  });

  it('names itself', async () => {
    renderApp();

    expect(await screen.findByRole('heading', { level: 1, name: /NRDS/i })).toBeInTheDocument();
  });

  /**
   * The app had no main landmark and no h1. Both existed only on the error page, so a screen
   * reader had nothing to jump to and the heading tree started at h2 with the feature panel.
   */
  it('has a main landmark to skip into', async () => {
    renderApp();
    await screen.findByTestId('datastream-view');

    const main = document.querySelector('main#main-content');
    expect(main).toBeInTheDocument();
    expect(main).toContainElement(screen.getByTestId('datastream-view'));
  });

  it('offers a skip link before anything else in the tab order', async () => {
    renderApp();

    const skip = await screen.findByRole('link', { name: /skip to the map/i });
    expect(skip).toHaveAttribute('href', '#main-content');
    const focusable = document.querySelectorAll('a[href], button, input, select, [tabindex]');
    expect(focusable[0]).toBe(skip);
  });

  it('starts its heading tree at level one', async () => {
    renderApp();
    await screen.findByTestId('datastream-view');

    const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .map((h) => Number(h.tagName[1]));
    expect(Math.min(...levels)).toBe(1);
  });

  it('has no cache control in the header, since there is no cache to clear', async () => {
    renderApp();

    await screen.findByTestId('datastream-view');
    expect(screen.queryByRole('button', { name: /cached data/i })).not.toBeInTheDocument();
  });

  it('runs the header chain far enough to reach duckdb and report it missing', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent(/search unavailable/i);
    consoleError.mockRestore();
  });
});
