/**
 * The navbar load-status readout for the build-less NRDS client (migration unit U6), the vanilla
 * port of the React `LoadStatus`. `loadStatusView` is the pure selector that turns the relevant
 * store fields into what the strip should show, and `createLoadStatus` mounts the strip and keeps it
 * in step with the store's timeseries and datastream slices.
 */

/**
 * Decide what the load-status strip shows for the given signals. Returns null when the strip should
 * be hidden, otherwise { text, spinner, failed, errorKind }. Mirrors the React LoadStatus order:
 * the index-building message takes over only when nothing else is loading, a bare idle state hides
 * the strip, and a failure drops the spinner while keeping the message.
 */
export function loadStatusView({
  indexLoading = false,
  loading = false,
  pending = false,
  loadingText = '',
  failed = false,
  errorKind = null,
} = {}) {
  if (indexLoading && !loading && !loadingText) {
    return { text: 'Building the search index', spinner: true, failed: false, errorKind: null };
  }
  if (!loading && !loadingText) return null;
  return {
    text: loadingText,
    spinner: (loading || pending) && !failed,
    failed,
    errorKind: errorKind || null,
  };
}

/** The store fields loadStatusView reads, pulled from the flat store. */
function selectSignals(state) {
  const ts = state.timeseries;
  return {
    indexLoading: state.datastream.index_status === 'loading',
    loading: ts.loading,
    pending: ts.pending,
    loadingText: ts.loadingText,
    failed: ts.last_error !== null,
    errorKind: ts.last_error?.kind ?? null,
  };
}

const SPINNER_HTML = '<span class="nrds-spinner" aria-hidden="true"></span>';

/** Mount the load-status strip into `container`, wired to `store`; returns a teardown. */
export function createLoadStatus(container, store) {
  const strip = document.createElement('div');
  strip.className = 'nrds-load-status';
  strip.setAttribute('role', 'status');
  strip.setAttribute('aria-live', 'polite');
  strip.hidden = true;

  const spinner = document.createElement('span');
  spinner.className = 'nrds-load-status__spinner';
  spinner.innerHTML = SPINNER_HTML;

  const text = document.createElement('span');
  text.className = 'nrds-load-status__text';

  strip.append(spinner, text);
  container.append(strip);

  const render = () => {
    const view = loadStatusView(selectSignals(store.get()));
    if (!view) {
      strip.hidden = true;
      return;
    }
    strip.hidden = false;
    strip.classList.toggle('nrds-load-status--failed', view.failed);
    if (view.errorKind) strip.dataset.errorKind = view.errorKind;
    else delete strip.dataset.errorKind;
    spinner.hidden = !view.spinner;
    text.textContent = view.text || '';
    text.hidden = !view.text;
  };

  const unsubscribe = store.subscribe(render);
  render();

  return () => {
    unsubscribe();
    strip.remove();
  };
}

export default createLoadStatus;
