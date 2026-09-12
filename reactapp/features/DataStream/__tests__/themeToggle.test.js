/**
 * The manual theme control.
 *
 * The store's behaviour is covered in themeSignal.test.js; this is the control's own contract: a
 * real button that flips the theme, reports its state, names the action for the current mode, is
 * reachable and operable from the keyboard, and keeps the icon out of the accessible name.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeToggle } from 'features/DataStream/components/menus/ThemeToggle';
import { useThemeStore } from 'features/DataStream/store/theme';

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* storage may be unavailable */
  }
  document.documentElement.removeAttribute('data-theme');
  // Reset to the system default (light in jsdom, which has no dark matchMedia) between tests.
  useThemeStore.getState().setPreference('system');
});

describe('the theme toggle', () => {
  it('is a button whose accessible name states the action for the current mode', () => {
    render(<ThemeToggle />);

    // Light is showing, so the offer is to switch to dark.
    expect(
      screen.getByRole('button', { name: /switch to dark theme/i })
    ).toBeInTheDocument();
  });

  it('reports whether dark is on through aria-pressed', () => {
    render(<ThemeToggle />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggling to dark sets data-theme="dark" and updates its name and state', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button'));

    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(
      screen.getByRole('button', { name: /switch to light theme/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('is reachable and operable from the keyboard', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(useThemeStore.getState().theme).toBe('dark');

    await user.keyboard(' ');
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('keeps the icon out of the accessible name', () => {
    const { container } = render(<ThemeToggle />);

    // The icon is decorative: hidden from assistive tech, so the button carries exactly one
    // accessible name (the label), not the icon as well. An aria-hidden node has no role, so it
    // is reached by attribute rather than by a Testing Library query.
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
    const icon = container.querySelector('svg[aria-hidden="true"]');
    expect(icon).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAccessibleName(/switch to (light|dark) theme/i);
  });
});
