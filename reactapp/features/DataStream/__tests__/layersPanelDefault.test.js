/**
 * The layer panel starts open.
 *
 * It is what says which layers exist and lets them be switched, and the catchments toggle inside
 * it governs the only layer a click acts on. Shut by default, a reader who had catchments off
 * saw a map that ignored every click with nothing on screen to explain it.
 *
 * It is 250px pinned to the right of the map, which is most of a phone, so small screens still
 * start closed.
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { LayersMenu } from 'features/DataStream/components/menus/LayersMenu';

const widthIs = (px) => {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: query.includes('min-width: 769px') ? px > 768 : px <= 768,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
};

const panel = () => document.getElementById('layer-options');

afterEach(() => { delete window.matchMedia; });

describe('on a screen with room for it', () => {
  it('is open before anyone clicks anything', () => {
    widthIs(1440);

    render(<LayersMenu />);

    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide layer options/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('can still be closed', () => {
    widthIs(1440);
    render(<LayersMenu />);

    fireEvent.click(screen.getByRole('button', { name: /hide layer options/i }));

    expect(panel()).not.toBeInTheDocument();
  });
});

describe('on a small screen', () => {
  it('stays closed, because the panel would cover the map', () => {
    widthIs(375);

    render(<LayersMenu />);

    expect(panel()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show layer options/i })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('when the browser will not say', () => {
  it('opens, rather than throwing or hiding the controls', () => {
    // jsdom has no matchMedia by default, and neither does a sufficiently old browser.
    delete window.matchMedia;

    render(<LayersMenu />);

    expect(panel()).toBeInTheDocument();
  });
});
