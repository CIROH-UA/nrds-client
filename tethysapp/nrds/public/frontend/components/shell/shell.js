/**
 * The app shell for the build-less NRDS client (migration unit U6), the vanilla replacement for the
 * React `Tethys/components/layout/Layout` plus its Loader/error-boundary wrapper. It owns the page
 * around the map: the skip link, the top navbar, the map area the map mounts into, the info and
 * first-run dialogs, and the toast host. The composition root (map.js) drives it: `mountLoading`
 * while the four bootstrap calls run, then `mountShell` once they resolve (which hands back the map
 * area to mount the map into), or `mountError` if they throw.
 *
 * Layout: #root is a flex column; the navbar sits on top at --ts-header-height and the map area
 * fills the rest below it. Everything that floats over the map (control menu, time dock, popup) is a
 * child of the map area, so the header no longer overlaps it.
 */
import { createNavbar } from './navbar.js';
import { createGeneralInfoModal, createExperimentalNoticeModal, hasAcknowledgedExperimental } from './modals.js';
import { renderError } from './error-view.js';

/** Show the boot loading state in `root`; returns a handle whose `remove` clears it. */
export function mountLoading(root) {
  root.replaceChildren();
  const loader = document.createElement('div');
  loader.className = 'nrds-boot';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.innerHTML =
    '<span class="nrds-spinner nrds-spinner--lg" aria-hidden="true"></span>' +
    '<span class="nrds-boot__text">Loading</span>';
  root.append(loader);
  return {
    element: loader,
    remove() {
      loader.remove();
    },
  };
}

/**
 * Build the full shell into `root` and return { mapArea, destroy }. `mapArea` is the element the map
 * mounts into; it fills the viewport below the navbar. The navbar brand is filled from `tethysApp`,
 * the info control opens the general-info dialog, and the experimental-notice gate is shown once.
 */
export function mountShell(root, { store, tethysApp } = {}) {
  root.replaceChildren();

  const skipLink = document.createElement('a');
  skipLink.className = 'nrds-skip-link';
  skipLink.href = '#main-content';
  skipLink.textContent = 'Skip to the map';

  const generalInfo = createGeneralInfoModal();
  document.body.append(generalInfo.element);

  const navbar = createNavbar(root, {
    store,
    onInfo: (opener) => generalInfo.open(opener),
  });
  navbar.setBrand(tethysApp);

  const mapArea = document.createElement('main');
  mapArea.className = 'nrds-map-area';
  mapArea.id = 'main-content';
  mapArea.tabIndex = -1;

  root.prepend(skipLink);
  root.append(mapArea);

  let noticeModal = null;
  if (!hasAcknowledgedExperimental()) {
    noticeModal = createExperimentalNoticeModal();
    document.body.append(noticeModal.element);
    noticeModal.open();
  }

  return {
    mapArea,
    navbar,
    destroy() {
      navbar.destroy();
      generalInfo.destroy();
      if (noticeModal) noticeModal.destroy();
      skipLink.remove();
      mapArea.remove();
    },
  };
}

/** Render the top-level error view into `root` when bootstrap fails. */
export function mountError(root, { error } = {}) {
  return renderError(root, { error });
}

export default { mountLoading, mountShell, mountError };
