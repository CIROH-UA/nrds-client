/**
 * The map-control panel starts open.
 *
 * The layer toggles used to live in the Tethys navbar behind their own reveal button; they now
 * live in the unified ControlMenu over the map (run + layers + theme), which keeps the same
 * reveal behavior: open by default where there is room, closed on a phone where the panel would
 * cover the map, and open when the browser will not say. The catchments toggle inside it still
 * governs the only layer a click acts on, so a reader who had catchments off must be able to see
 * why.
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { ControlMenu } from 'features/DataStream/components/menus/ControlMenu';

const widthIs = (px) => {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: query.includes('min-width: 769px') ? px > 768 : px <= 768,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
};

const panel = () => document.getElementById('control-options');

afterEach(() => { delete window.matchMedia; });

describe('on a screen with room for it', () => {
  it('is open before anyone clicks anything', () => {
    widthIs(1440);

    render(<ControlMenu />);

    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide map controls/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('can still be closed', () => {
    widthIs(1440);
    render(<ControlMenu />);

    fireEvent.click(screen.getByRole('button', { name: /hide map controls/i }));

    expect(panel()).not.toBeInTheDocument();
  });
});

describe('on a small screen', () => {
  it('stays closed, because the panel would cover the map', () => {
    widthIs(375);

    render(<ControlMenu />);

    expect(panel()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show map controls/i })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('when the browser will not say', () => {
  it('opens, rather than throwing or hiding the controls', () => {
    delete window.matchMedia;

    render(<ControlMenu />);

    expect(panel()).toBeInTheDocument();
  });
});
