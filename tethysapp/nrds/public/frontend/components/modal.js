/**
 * A small accessible modal dialog for the build-less NRDS client. `createModal({ title, className })`
 * returns a handle that mounts a backdrop + dialog into `document.body` lazily, exposes a `content`
 * element for the caller to fill once, and opens/closes on demand. It closes on the backdrop, the
 * close button, and Escape, restores focus to the element that opened it, and traps Tab focus while
 * open. The caller owns the content lifecycle; `destroy()` removes everything.
 */
export function createModal({ title = '', className = '' } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'nrds-modal__backdrop';
  backdrop.hidden = true;

  const dialog = document.createElement('div');
  dialog.className = `nrds-modal${className ? ` ${className}` : ''}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  const header = document.createElement('div');
  header.className = 'nrds-modal__header';
  const heading = document.createElement('h2');
  heading.className = 'nrds-modal__title';
  heading.textContent = title;
  const titleId = `nrds-modal-title-${Math.random().toString(36).slice(2, 8)}`;
  heading.id = titleId;
  dialog.setAttribute('aria-labelledby', titleId);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'nrds-modal__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.title = 'Close';
  closeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  header.append(heading, closeBtn);

  const content = document.createElement('div');
  content.className = 'nrds-modal__content';

  dialog.append(header, content);
  backdrop.append(dialog);

  let opener = null;
  let mounted = false;

  const focusable = () =>
    Array.from(
      dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hidden && !el.disabled);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const isOpen = () => !backdrop.hidden;

  function open() {
    if (isOpen()) return;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!mounted) {
      document.body.append(backdrop);
      mounted = true;
    }
    backdrop.hidden = false;
    document.addEventListener('keydown', onKeyDown, true);
    (focusable()[0] ?? closeBtn).focus();
  }

  function close() {
    if (!isOpen()) return;
    backdrop.hidden = true;
    document.removeEventListener('keydown', onKeyDown, true);
    if (opener?.isConnected) opener.focus();
    opener = null;
  }

  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  closeBtn.addEventListener('click', close);

  return {
    content,
    open,
    close,
    isOpen,
    setTitle: (t) => {
      heading.textContent = t;
    },
    destroy: () => {
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
    },
  };
}

export default createModal;
