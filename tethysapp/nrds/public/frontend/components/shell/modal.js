/**
 * An accessible modal-dialog helper for the build-less NRDS client (migration unit U6), the vanilla
 * replacement for react-bootstrap's Modal. `createModal(options)` builds a role="dialog" surface
 * over a backdrop and returns { element, dialog, bodyEl, open, close, destroy, isOpen }. It traps
 * Tab focus within the dialog, moves focus in on open and restores it to the opener on close, closes
 * on Escape and on a backdrop click unless it is a gate (`dismissible: false`), and labels itself
 * from its title. The caller appends `element` (the backdrop) to the DOM and drives open/close.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

let idSeq = 0;
const nextId = () => `nrds-dialog-${++idSeq}`;

/**
 * Build a dialog. `body` and `footer` accept a Node or an HTML string; `dismissible` false makes it
 * a gate (no Escape, no backdrop close, no X control); `size` widens the surface ('md' | 'lg').
 */
export function createModal({
  titleText,
  body,
  footer = null,
  size = 'md',
  dismissible = true,
  className = '',
} = {}) {
  const titleId = nextId();

  const backdrop = document.createElement('div');
  backdrop.className = 'nrds-modal-backdrop';
  backdrop.hidden = true;

  const dialog = document.createElement('div');
  dialog.className = `nrds-modal nrds-modal--${size}${className ? ` ${className}` : ''}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.tabIndex = -1;

  const header = document.createElement('div');
  header.className = 'nrds-modal__header';
  const title = document.createElement('h2');
  title.className = 'nrds-modal__title';
  title.id = titleId;
  title.textContent = titleText;
  header.append(title);

  let closeBtn = null;
  if (dismissible) {
    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'nrds-modal__close';
    closeBtn.setAttribute('aria-label', `Close ${titleText}`);
    closeBtn.innerHTML = CLOSE_ICON;
    header.append(closeBtn);
  }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'nrds-modal__body';
  appendContent(bodyEl, body);

  dialog.append(header, bodyEl);

  if (footer) {
    const footerEl = document.createElement('div');
    footerEl.className = 'nrds-modal__footer';
    appendContent(footerEl, footer);
    dialog.append(footerEl);
  }

  backdrop.append(dialog);

  let lastFocused = null;
  let isOpen = false;

  const focusables = () =>
    Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((el) => !el.hidden);

  const onKeydown = (event) => {
    if (event.key === 'Escape' && dismissible) {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onBackdrop = (event) => {
    if (event.target === backdrop && dismissible) close();
  };

  function open(opener) {
    if (isOpen) return;
    isOpen = true;
    lastFocused =
      opener || (typeof document !== 'undefined' ? document.activeElement : null);
    backdrop.hidden = false;
    document.addEventListener('keydown', onKeydown, true);
    backdrop.addEventListener('mousedown', onBackdrop);
    const items = focusables();
    (items[0] || dialog).focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    backdrop.hidden = true;
    document.removeEventListener('keydown', onKeydown, true);
    backdrop.removeEventListener('mousedown', onBackdrop);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  function destroy() {
    close();
    backdrop.remove();
  }

  if (closeBtn) closeBtn.addEventListener('click', () => close());

  return { element: backdrop, dialog, bodyEl, open, close, destroy, isOpen: () => isOpen };
}

/** Put a Node or an HTML string into a container. */
function appendContent(container, content) {
  if (content == null) return;
  if (typeof content === 'string') container.innerHTML = content;
  else container.append(content);
}

export default createModal;
