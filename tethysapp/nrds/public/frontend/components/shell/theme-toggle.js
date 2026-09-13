/**
 * The navbar light/dark control for the build-less NRDS client (migration unit U6), the vanilla
 * port of the React `ThemeToggle`. It writes the one effective-theme signal (store theme slice via
 * actions.toggle), which sets `data-theme` on the document root so the CSS chrome swaps, and is the
 * hook the map, ramp and legend read. This is the control's new home: it was a stand-in in the map
 * control menu's Appearance section while the shell was a later unit, and moves here now.
 *
 * Accessibility: a real <button>, in the tab order with Space/Enter for free; `aria-pressed` reports
 * whether dark is on; the accessible name and title state the action for the current mode; the icon
 * is decorative; the target is at least --tap-min with a --focus-ring focus.
 */
import { actions } from '../../store/app-store.js';

const SUN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41' +
  'M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const MOON_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">' +
  '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

/** Mount the theme toggle into `container`, wired to `store`; returns a teardown. */
export function createThemeToggle(container, store) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nrds-theme-toggle';
  button.addEventListener('click', () => actions.toggle());
  container.append(button);

  let last = null;
  const render = () => {
    const isDark = store.get().theme.theme === 'dark';
    if (isDark === last) return;
    last = isDark;
    button.setAttribute('aria-pressed', String(isDark));
    const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = isDark ? MOON_ICON : SUN_ICON;
  };

  const unsubscribe = store.subscribe(render);
  render();

  return () => {
    unsubscribe();
    button.remove();
  };
}

export default createThemeToggle;
