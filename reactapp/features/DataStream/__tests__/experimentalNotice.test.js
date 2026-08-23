/**
 * The app says it is experimental, permanently, and explains where it matters.
 *
 * This was a dismissible full-width strip between the header and the map. It spent a band of
 * vertical space above the map on a sentence that never changes, and being dismissible made it
 * transient when what it says is permanently true: a caveat you can close is not load-bearing.
 * It also printed over the feature panel's title, though that was a layout bug rather than the
 * reason it went.
 *
 * A badge cannot be dismissed and costs no layout. The sentence it stands for lives with the
 * results it qualifies.
 */
import { render, screen } from '@testing-library/react';

import { DataInfoContent, GeneralInfoContent } from 'features/DataStream/components/InfoContent';

describe('the standing caveat', () => {
  it('appears with the forecast it qualifies', () => {
    render(<DataInfoContent />);

    expect(screen.getByText(/these results are experimental/i)).toBeInTheDocument();
    expect(screen.getByText(/not an operational forecast/i)).toBeInTheDocument();
  });

  it('warns against the use that would actually matter', () => {
    // "preliminary" on its own is hedging. Naming the decision it must not be used for is not.
    render(<DataInfoContent />);

    expect(screen.getByText(/life or property/i)).toBeInTheDocument();
  });

  it('appears in the About dialog, and points at the operational service', () => {
    render(<GeneralInfoContent />);

    expect(screen.getByText(/experimental/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /national water prediction service/i }))
      .toHaveAttribute('href', 'https://water.noaa.gov/');
  });
});

describe('the badge', () => {
  const fs = require('fs');
  const path = require('path');
  const header = fs.readFileSync(
    path.join(__dirname, '../../Tethys/components/layout/Header.js'),
    'utf8'
  );
  const styles = fs.readFileSync(
    path.join(__dirname, '../components/styles/Styles.js'),
    'utf8'
  );

  it('sits beside the app name', () => {
    expect(header).toMatch(/<ExperimentalBadge/);
  });

  it('cannot be dismissed, because what it says does not stop being true', () => {
    expect(header).not.toMatch(/setBannerVisible|bannerVisible/);
  });

  it('is not a control, since the info button beside it does the explaining', () => {
    const i = styles.indexOf('export const ExperimentalBadge');
    const decl = styles.slice(i, styles.indexOf('\n`;', i));
    expect(decl).toMatch(/styled\.span/);
    expect(decl).not.toMatch(/cursor: pointer/);
  });

  it('leaves no trace of the strip it replaced', () => {
    const layout = fs.readFileSync(
      path.join(__dirname, '../../Tethys/components/layout/Layout.js'),
      'utf8'
    );
    const scss = fs.readFileSync(path.join(__dirname, '../../../App.scss'), 'utf8');

    expect(layout).not.toMatch(/experimental-banner/);
    expect(scss).not.toMatch(/\.experimental-banner/);
  });
});
