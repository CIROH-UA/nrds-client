/**
 * A minimal toast helper for the build-less NRDS client (migration unit U6), the vanilla
 * replacement for react-toastify. `toast(message, options)` shows a dismissible, auto-expiring
 * notice in a shared polite live region and returns a handle that dismisses it early. The host is
 * created lazily on first use and appended to the document body, so any later unit can import and
 * call `toast` with no setup.
 */

const DEFAULT_DURATION = 5000;

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

let host = null;

/** The shared toast region, created and appended on first use. */
function ensureHost() {
  if (host && host.isConnected) return host;
  host = document.createElement('div');
  host.className = 'nrds-toast-host';
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('role', 'status');
  document.body.append(host);
  return host;
}

/**
 * Show a toast. `type` is 'info' | 'success' | 'error' (styling and severity); `duration` is the
 * milliseconds before it auto-dismisses, and 0 keeps it open until dismissed. Returns { dismiss }.
 */
export function toast(message, { type = 'info', duration = DEFAULT_DURATION } = {}) {
  if (typeof document === 'undefined') return { dismiss() {}, element: null };
  const region = ensureHost();

  const el = document.createElement('div');
  el.className = `nrds-toast nrds-toast--${type}`;
  if (type === 'error') el.setAttribute('role', 'alert');

  const text = document.createElement('span');
  text.className = 'nrds-toast__message';
  text.textContent = message;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'nrds-toast__close';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.innerHTML = CLOSE_ICON;

  let timer = null;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    el.remove();
  };

  close.addEventListener('click', dismiss);
  el.append(text, close);
  region.append(el);

  if (duration > 0) timer = setTimeout(dismiss, duration);
  return { dismiss, element: el };
}

export default toast;
