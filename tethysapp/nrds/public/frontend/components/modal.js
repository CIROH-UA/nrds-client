/**
 * A small accessible modal dialog for the build-less NRDS client. `createModal({ title, className })`
 * returns a handle that mounts a backdrop + dialog into `document.body` lazily, exposes a `content`
 * element for the caller to fill once, and opens/closes on demand. It closes on the backdrop, the
 * close button, and Escape, restores focus to the element that opened it, traps Tab focus while open,
 * and marks the rest of the page `inert` so a screen reader cannot wander behind it. The caller owns
 * the content lifecycle; `destroy()` removes everything. Its classes are namespaced `nrds-dialog` so
 * they never collide with the shell `nrds-modal` used by the first-run notice and info panels.
 */
export function createModal({ title = '', className = '' } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'nrds-dialog__backdrop';
  backdrop.hidden = true;

  const dialog = document.createElement('div');
  dialog.className = `nrds-dialog${className ? ` ${className}` : ''}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  const header = document.createElement('div');
  header.className = 'nrds-dialog__header';
  const heading = document.createElement('h2');
  heading.className = 'nrds-dialog__title';
  heading.textContent = title;
  const titleId = `nrds-dialog-title-${Math.random().toString(36).slice(2, 8)}`;
  heading.id = titleId;
  dialog.setAttribute('aria-labelledby', titleId);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'nrds-dialog__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.title = 'Close';
  closeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  header.append(heading, closeBtn);

  const content = document.createElement('div');
  content.className = 'nrds-dialog__content';

  dialog.append(header, content);
  backdrop.append(dialog);

  let opener = null;
  let mounted = false;
  let inerted = [];

  const focusable = () =>
    Array.from(
      dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hidden && !el.disabled);

  /** Mark every other top-level element inert while open, restoring only those we set, on close. */
  const setBackgroundInert = (on) => {
    if (on) {
      inerted = [];
      for (const el of document.body.children) {
        if (el === backdrop || el.inert) continue;
        el.inert = true;
        inerted.push(el);
      }
    } else {
      for (const el of inerted) el.inert = false;
      inerted = [];
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      // Let an open inner control (e.g. a select's listbox) consume Escape first; only close the
      // dialog when nothing inside is expanded, so one press does not dismiss the whole dialog.
      const active = document.activeElement;
      if (active?.getAttribute?.('aria-expanded') === 'true') return;
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
    setBackgroundInert(true);
    document.addEventListener('keydown', onKeyDown, true);
    (focusable()[0] ?? closeBtn).focus();
  }

  function close() {
    if (!isOpen()) return;
    backdrop.hidden = true;
    setBackgroundInert(false);
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
      setBackgroundInert(false);
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
    },
  };
}

export default createModal;
