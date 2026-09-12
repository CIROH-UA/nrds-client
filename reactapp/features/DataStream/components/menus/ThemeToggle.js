import PropTypes from 'prop-types';
import styled from 'styled-components';
import { IoMoon, IoSunny } from 'react-icons/io5';

import { useThemeStore } from 'features/DataStream/store/theme';

/**
 * The manual light/dark control.
 *
 * It writes the one effective-theme signal (store/theme), which sets `data-theme` on the document
 * root -- so the CSS chrome swaps -- and is the hook the map, ramp, symbology and legend read, so
 * they restyle with it rather than being stranded on the system `prefers-color-scheme` query.
 *
 * Mounted in the navbar header beside the About control; kept as a standalone, testable control
 * that owns only the toggle.
 *
 * Accessibility: a real <button>, so it is in the tab order and Space/Enter activate it for free;
 * `aria-pressed` reports whether dark is on; the accessible name states the action for the current
 * mode; the icon is decorative (`aria-hidden`); the target is at least --tap-min and the focus is
 * shown with --focus-ring.
 */
const ToggleButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--tap-min, 44px);
  min-height: var(--tap-min, 44px);
  padding: 5px;
  border: none;
  border-radius: 20px;
  background-color: transparent;
  color: var(--text-color);
  font-size: 1.5rem;
  line-height: 0;
  cursor: pointer;
  transition: background-color var(--dur, 180ms) ease, color var(--dur, 180ms) ease;

  &:hover {
    background-color: var(--button-primary-hover-bg);
    color: var(--text-color);
  }

  &:focus-visible {
    outline: var(--focus-ring, 2px solid var(--nav-pill-active-bg));
    outline-offset: 2px;
  }

  svg {
    display: block;
    width: 1em;
    height: 1em;
  }
`;

/** The manual theme toggle. Reflects and flips the effective theme. */
export const ThemeToggle = ({ className }) => {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = theme === 'dark';

  return (
    <ToggleButton
      type="button"
      className={className}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
    >
      {isDark ? <IoMoon aria-hidden="true" /> : <IoSunny aria-hidden="true" />}
    </ToggleButton>
  );
};

ThemeToggle.propTypes = {
  className: PropTypes.string,
};

export default ThemeToggle;
