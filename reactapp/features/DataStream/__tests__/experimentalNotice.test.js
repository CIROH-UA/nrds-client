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
import { fireEvent, render, screen } from '@testing-library/react';

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

/**
 * The first-run gate.
 *
 * The banner this replaces had a dismiss button, which is how a disclaimer becomes something
 * people close without reading and then never see again. A gate is the opposite trade: it
 * interrupts, but exactly once per browser, and it is acknowledged rather than dismissed.
 */
describe('remembering the acknowledgement', () => {
  const load = () => {
    jest.resetModules();
    return require('features/DataStream/lib/firstRun');
  };

  let store;
  beforeEach(() => {
    store = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
      },
    });
  });

  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  afterEach(() => {
    // Restored, or a throwing stub leaks into jest's own teardown and fails the whole suite.
    if (original) Object.defineProperty(window, 'localStorage', original);
  });

  it('has not been acknowledged on a fresh browser', () => {
    expect(load().hasAcknowledgedExperimental()).toBe(false);
  });

  it('remembers once acknowledged', () => {
    const m = load();
    m.acknowledgeExperimental();

    expect(m.hasAcknowledgedExperimental()).toBe(true);
  });

  it('survives a reload, which is the whole point of storing it', () => {
    load().acknowledgeExperimental();

    expect(load().hasAcknowledgedExperimental()).toBe(true);
  });

  it('shows the notice again when storage cannot be read', () => {
    // Private windows and blocked-storage settings throw rather than returning null. A reader
    // seeing it twice is a far smaller problem than one who never sees it, so every failure path
    // answers "not yet".
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => {},
      },
    });

    expect(load().hasAcknowledgedExperimental()).toBe(false);
  });

  it('does not throw when storage cannot be written', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => { throw new Error('quota'); },
      },
    });

    expect(() => load().acknowledgeExperimental()).not.toThrow();
  });

  it('carries a version, so changed wording can ask again', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/firstRun.js'), 'utf8'
    );
    expect(src).toMatch(/nrds\.experimental-acknowledged\.v\d+/);
  });
});

describe('the gate itself', () => {
  const { ExperimentalNoticeModal } = require('features/DataStream/components/Modals');

  it('states the caveat and offers one way out', () => {
    render(<ExperimentalNoticeModal show onAcknowledge={() => {}} />);

    expect(screen.getByText(/life or property/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /i understand/i })).toBeInTheDocument();
  });

  it('has no close button, because dismissing is what the banner allowed', () => {
    render(<ExperimentalNoticeModal show onAcknowledge={() => {}} />);

    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('reports the acknowledgement', () => {
    const onAcknowledge = jest.fn();
    render(<ExperimentalNoticeModal show onAcknowledge={onAcknowledge} />);

    fireEvent.click(screen.getByRole('button', { name: /i understand/i }));

    expect(onAcknowledge).toHaveBeenCalled();
  });

  it('cannot be escaped or clicked away', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../components/Modals.js'), 'utf8'
    );
    const i = src.indexOf('export const ExperimentalNoticeModal');

    expect(src.slice(i)).toMatch(/backdrop="static"/);
    expect(src.slice(i)).toMatch(/keyboard=\{false\}/);
  });
});
