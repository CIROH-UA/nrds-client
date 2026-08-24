// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock `window.location` with Jest spies and extend expect
import "jest-location-mock";

// Make .env files accessible to tests (path relative to project root)
require('dotenv').config({ path: './reactapp/config/tests/test.env'});

// jsdom omits these two web globals. apache-arrow, reached through the duckdb helpers, uses
// them at import time, so without this any test that touches a module importing those helpers
// fails to load rather than failing an assertion.
const { TextEncoder, TextDecoder } = require('util');
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

// jsdom's Blob has slice but no arrayBuffer, which anything reading a file's bytes needs --
// the cache checks a parquet's PAR1 markers that way. FileReader is present, so this bridges it.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer() {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// Setup mocked Tethys API.
//
// Loaded defensively because ./mocks/server.js cannot currently be imported at all. It still
// uses msw v1's `rest` export, which v2 removed, and the installed msw v2 needs web globals
// this jest/jsdom does not provide -- TextEncoder, then BroadcastChannel, then WritableStream,
// and so on. That one import threw during setup, so every suite in the repo failed to load and
// no test ran. Repairing it means upgrading jest/jsdom and porting the handlers to the v2 API;
// until then this keeps the rest of the suite runnable, without HTTP mocking.
let server = null;
try {
  server = require('./mocks/server.js').server;
} catch (err) {
  console.warn('msw mock server unavailable, HTTP mocking is disabled:', err.message);
}

beforeAll(() => server?.listen());
// if you need to add a handler after calling setupServer for some specific test
// this will remove that handler for the rest of them
// (which is important for test isolation):
afterEach(() => server?.resetHandlers());
afterAll(() => server?.close());

// Mocks for tests involving plotly
window.URL.createObjectURL = jest.fn();
HTMLCanvasElement.prototype.getContext = jest.fn();

// jsdom has no ResizeObserver, which @visx/responsive's ParentSize constructs on mount, so any
// test rendering a chart through it dies with "LocalResizeObserver is not a constructor". The
// stub reports nothing: tests that care about chart size pass width and height directly.
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/** jsdom has no Worker, and duckdb-wasm reaches for one while its module is still being evaluated. That made every suite whose import graph touches the cache layer fail to load rather than fail an assertion, which is why App.test.js has been contributing zero tests: it imports App, which reaches SearchBar, which reaches queryData. A stub is enough, since no test drives a real duckdb worker. */
if (typeof global.Worker === 'undefined') {
  global.Worker = class Worker {
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
  };
}
