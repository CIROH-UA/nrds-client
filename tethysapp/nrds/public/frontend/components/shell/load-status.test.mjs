import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadStatusView } from './load-status.js';

test('loadStatusView hides the strip when nothing is loading', () => {
  assert.equal(loadStatusView(), null);
  assert.equal(loadStatusView({ loading: false, loadingText: '', indexLoading: false }), null);
});

test('loadStatusView shows the index message only when nothing else is loading', () => {
  assert.deepEqual(loadStatusView({ indexLoading: true }), {
    text: 'Building the search index',
    spinner: true,
    failed: false,
    errorKind: null,
  });
});

test('loadStatusView lets a running load take over from the index message', () => {
  const view = loadStatusView({ indexLoading: true, loading: true, loadingText: 'Loading run' });
  assert.equal(view.text, 'Loading run');
  assert.equal(view.spinner, true);
  assert.equal(view.failed, false);
});

test('loadStatusView spins while loading or pending and not failed', () => {
  assert.equal(loadStatusView({ loading: true, loadingText: 'Loading' }).spinner, true);
  assert.equal(loadStatusView({ pending: true, loadingText: 'Queued' }).spinner, true);
});

test('loadStatusView keeps the message but drops the spinner on failure', () => {
  const view = loadStatusView({
    loading: true,
    loadingText: 'Load failed',
    failed: true,
    errorKind: 'network',
  });
  assert.equal(view.text, 'Load failed');
  assert.equal(view.spinner, false);
  assert.equal(view.failed, true);
  assert.equal(view.errorKind, 'network');
});

test('loadStatusView shows loading text even without an explicit loading flag', () => {
  const view = loadStatusView({ loadingText: 'Still working' });
  assert.equal(view.text, 'Still working');
  assert.equal(view.spinner, false);
  assert.equal(view.failed, false);
});
