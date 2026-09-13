/**
 * The top navbar for the build-less NRDS client (migration unit U6), the vanilla port of the React
 * `Tethys/components/layout/Header`. It builds, left to right: the app brand (icon + name), the
 * standing Experimental badge, the feature-id search box mounted into its marked slot, the
 * load-status readout; and, on the right, the theme
 * toggle (moved here from the map control menu) and an info button that opens the general-info
 * dialog. `setBrand` fills the brand once the app data resolves. Returns a teardown.
 */
import { createThemeToggle } from './theme-toggle.js';
import { createLoadStatus } from './load-status.js';
import { createSearchBox } from './search-box.js';

const INFO_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

/**
 * Build the navbar into `container`, wired to `store`. `onInfo` opens the general-info dialog.
 * Returns { element, setBrand, destroy }; call setBrand({ title, icon, rootUrl }) after bootstrap.
 */
export function createNavbar(container, { store, onInfo } = {}) {
  const nav = document.createElement('header');
  nav.className = 'nrds-navbar';

  // --- Left group: brand, badge, search slot, load status ----------------------------------------
  const left = document.createElement('div');
  left.className = 'nrds-navbar__group nrds-navbar__group--start';

  const brand = document.createElement('a');
  brand.className = 'nrds-navbar__brand';
  brand.href = '#';
  const brandIcon = document.createElement('img');
  brandIcon.className = 'nrds-navbar__brand-icon';
  brandIcon.width = 30;
  brandIcon.height = 30;
  brandIcon.alt = '';
  brandIcon.hidden = true;
  const brandName = document.createElement('span');
  brandName.className = 'nrds-navbar__brand-name';
  brand.append(brandIcon, brandName);

  const badge = document.createElement('span');
  badge.className = 'nrds-navbar__badge';
  badge.title =
    'These streamflow predictions are preliminary and are not an operational forecast.';
  badge.innerHTML =
    '<span class="nrds-navbar__badge-full">Experimental</span>' +
    '<span class="nrds-navbar__badge-short" aria-hidden="true">Exp</span>' +
    '<span class="nrds-navbar__badge-assistive">Experimental</span>';

  // The feature-id search box (U5d) fills this marked slot.
  const searchSlot = document.createElement('div');
  searchSlot.className = 'nrds-navbar__search-slot';
  searchSlot.dataset.searchSlot = '';

  left.append(brand, badge, searchSlot);
  const teardownSearchBox = createSearchBox(searchSlot, store);
  const teardownLoadStatus = createLoadStatus(left, store);

  // --- Right group: theme toggle, info ------------------------------------------------------------
  const right = document.createElement('div');
  right.className = 'nrds-navbar__group nrds-navbar__group--end';

  const teardownThemeToggle = createThemeToggle(right, store);

  const infoBtn = document.createElement('button');
  infoBtn.type = 'button';
  infoBtn.className = 'nrds-navbar__info';
  infoBtn.setAttribute('aria-label', 'About the Research DataStream');
  infoBtn.title = 'About the Research DataStream';
  infoBtn.innerHTML = INFO_ICON;
  infoBtn.addEventListener('click', () => {
    if (typeof onInfo === 'function') onInfo(infoBtn);
  });
  right.append(infoBtn);

  nav.append(left, right);
  container.append(nav);

  /** Fill the brand from the resolved app data. */
  const setBrand = (app) => {
    const title = app?.title ?? app?.name ?? '';
    brandName.textContent = title;
    if (app?.icon) {
      brandIcon.src = app.icon;
      brandIcon.hidden = false;
    }
    if (app?.rootUrl) brand.href = app.rootUrl;
  };

  return {
    element: nav,
    setBrand,
    destroy() {
      teardownSearchBox();
      teardownLoadStatus();
      teardownThemeToggle();
      nav.remove();
    },
  };
}

export default createNavbar;
