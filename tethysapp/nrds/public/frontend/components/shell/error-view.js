/**
 * The top-level error view for the build-less NRDS client shell (migration unit U6), the vanilla
 * stand-in for the React error boundary and Tethys error Styles. `renderError(container, options)`
 * clears the container and shows a friendly, token-driven panel with a short explanation and a
 * Reload control, the composition root's catch when bootstrap fails.
 */

/** Render the error panel into `container`, replacing its contents. Returns the panel element. */
export function renderError(container, { error, title = 'Something went wrong' } = {}) {
  container.replaceChildren();

  const overlay = document.createElement('div');
  overlay.className = 'nrds-error';
  overlay.setAttribute('role', 'alert');

  const box = document.createElement('div');
  box.className = 'nrds-error__box';

  const heading = document.createElement('h1');
  heading.className = 'nrds-error__title';
  heading.textContent = title;

  const message = document.createElement('p');
  message.className = 'nrds-error__message';
  message.textContent =
    'The application could not start. This is usually a temporary connection problem with the ' +
    'portal. Please try again in a moment.';

  const detail = document.createElement('p');
  detail.className = 'nrds-error__detail';
  detail.textContent = error?.message ? String(error.message) : '';
  detail.hidden = !detail.textContent;

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'nrds-error__action';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => {
    if (typeof window !== 'undefined' && window.location) window.location.reload();
  });

  box.append(heading, message, detail, reload);
  overlay.append(box);
  container.append(overlay);
  reload.focus();

  return overlay;
}

export default renderError;
