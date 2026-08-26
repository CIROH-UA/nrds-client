/**
 * The app says it is experimental, permanently, and says it once per surface.
 *
 * This was a dismissible full-width strip between the header and the map. It spent a band of
 * vertical space above the map on a sentence that never changes, and being dismissible made it
 * transient when what it says is permanently true: a caveat you can close is not load-bearing.
 *
 * Three surfaces carry it now, each for a different reason. The gate dialog establishes it --
 * blocking, once per browser, acknowledged rather than dismissed. The badge is the standing
 * reminder and costs no layout. The About dialog repeats it because that is where someone goes
 * to ask what this is.
 *
 * The panel note does not. By the time a forecast is on screen the reader has acknowledged the
 * gate, and repeating the same forty-five words above every chart pushed the answer below the
 * fold on a phone without telling anyone anything new.
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { DataInfoContent, GeneralInfoContent, ExperimentalCaveat } from 'features/DataStream/components/InfoContent';

describe('the standing caveat', () => {
  it('is not repeated over every chart', () => {
    render(<DataInfoContent />);

    expect(screen.queryByText(/these results are experimental/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/life or property/i)).not.toBeInTheDocument();
  });

  it('still tells the panel note what it is for', () => {
    // Dropping the caveat must not leave the note empty: it still explains where the dates,
    // models and forecasts on screen come from.
    render(<DataInfoContent />);

    expect(screen.getByText(/read from the/i)).toBeInTheDocument();
  });

  it('warns against the use that would actually matter, where it is established', () => {
    // "preliminary" on its own is hedging. Naming the decision it must not be used for is not.
    render(<ExperimentalCaveat />);

    expect(screen.getByText(/life or property/i)).toBeInTheDocument();
    expect(screen.getByText(/not an operational forecast/i)).toBeInTheDocument();
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

/**
 * The info toggle is not a close button.
 *
 * It used to swap its glyph to MdClose when open, which put a second identical cross next to the
 * clear-selection control in the same header row: one hides a note, the other discards the
 * selection and its chart. The open state is carried by aria-expanded and a background tint now,
 * so the two are never the same shape.
 */
describe('the info toggle', () => {
  const { InfoToggle } = require('features/DataStream/components/InfoDisclosure');

  it('keeps its glyph when open', () => {
    const { rerender } = render(
      <InfoToggle open={false} onToggle={() => {}} controls="x" label="notes" />
    );
    const shut = screen.getByRole('button', { name: /show notes/i }).innerHTML;

    rerender(<InfoToggle open onToggle={() => {}} controls="x" label="notes" />);

    expect(screen.getByRole('button', { name: /hide notes/i }).innerHTML).toBe(shut);
  });

  it('says which state it is in without changing shape', () => {
    render(<InfoToggle open onToggle={() => {}} controls="x" label="notes" />);

    const button = screen.getByRole('button', { name: /hide notes/i });
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});

/**
 * The note is part of the panel, not a card floating in it.
 *
 * InfoPanel was a bordered, rounded, background-filled box with its own max-height and scrollbar,
 * rendered inside panels that are already bordered and already scroll. That is a card in a card,
 * and the inner scroll clipped the note mid-sentence.
 */
describe('the info panel', () => {
  const fs = require('fs');
  const path = require('path');
  const styles = fs.readFileSync(
    path.join(__dirname, '../components/styles/Styles.js'), 'utf8'
  );
  const block = styles.slice(styles.indexOf('export const InfoPanel'));
  const body = block.slice(0, block.indexOf('\n`;'));

  it('is separated by a rule rather than boxed', () => {
    expect(body).toMatch(/border-top:\s*1px solid/);
    expect(body).not.toMatch(/border-radius/);
    expect(body).not.toMatch(/background-color/);
  });

  it('leaves the scrolling to the panel that contains it', () => {
    expect(body).not.toMatch(/max-height/);
    expect(body).not.toMatch(/overflow-y/);
  });
});

/**
 * The badge is the only caveat a returning reader sees.
 *
 * The gate dialog is once per browser profile, so a second visit, a shared tablet or a kiosk never
 * sees it. The About dialog is behind a deliberate tap. With the panel note gone, hiding the badge
 * on a phone left a streamflow forecast on screen with nothing qualifying it anywhere.
 */
describe('the badge below 560px', () => {
  const fs = require('fs');
  const path = require('path');
  const styles = fs.readFileSync(path.join(__dirname, '../components/styles/Styles.js'), 'utf8');
  const badge = styles.slice(styles.indexOf('export const ExperimentalBadge'));
  const body = badge.slice(0, badge.indexOf('\n`;'));

  it('stays visible, smaller rather than absent', () => {
    const narrow = body.slice(body.indexOf('@media (max-width: 560px)'));
    expect(narrow).not.toMatch(/display:\s*none/);
    expect(narrow).toMatch(/font-size/);
  });
});

/**
 * Keeping the badge cost the search box the room to say what it is for.
 *
 * The badge is ~86px of a row that has ~313px for it, the search and the load status, so the
 * search sat on its 190px floor. Inside that: 20px padding, a 16px decorative magnifier and a
 * ~66px Search button, leaving the input ~88px for a placeholder that needs ~110 -- it rendered
 * as "Search fo". Below 560px the decorative magnifier goes and the button becomes the only
 * magnifier, which is the actionable one, and the wrapper is allowed off its floor.
 */
describe('the search row below 560px', () => {
  const fs = require('fs');
  const path = require('path');
  const narrowQuery = '@media (max-width: ${NARROW_HEADER_PX}px)';
  const styles = fs.readFileSync(path.join(__dirname, '../components/styles/Styles.js'), 'utf8');
  const block = (name) => {
    // `export const ${name}` alone prefix-matches SearchButtonLabel when asked for SearchButton.
    const from = styles.slice(styles.indexOf(`export const ${name} = `));
    return from.slice(0, from.indexOf('\n`;'));
  };
  const narrowOf = (name) => {
    const b = block(name);
    const at = b.indexOf('@media (max-width: 560px)');
    return at === -1 ? '' : b.slice(at);
  };

  it('lowers the search box floor without removing it', () => {
    // min-width: 0 let the wrapper collapse instead of grow: at 320px it measured 66px, all of
    // it padding and button, leaving a 4px input. A lower floor, not no floor.
    const narrow = narrowOf('SearchBarWrapper');
    expect(narrow).toMatch(/min-width:\s*150px/);
    expect(narrow).not.toMatch(/min-width:\s*0\s*;/);
  });

  it('keeps the search on the header row rather than breaking onto its own', () => {
    // A wrapped second row was tried and read badly: the badge floated alone above a full-width
    // search. One row at every width, with the badge giving up the space instead.
    const wrapper = block('SearchBarWrapper');
    const veryNarrow = wrapper.slice(wrapper.indexOf(narrowQuery));
    expect(veryNarrow).not.toMatch(/flex-basis:\s*100%/);
    expect(veryNarrow).toMatch(/min-width:\s*96px/);
  });

  it('drops the decorative magnifier, leaving the one that submits', () => {
    expect(narrowOf('SearchIcon')).toMatch(/display:\s*none/);
  });

  it('shrinks the submit control to its icon rather than hiding it', () => {
    const narrow = narrowOf('SearchButton');
    expect(narrow).not.toMatch(/display:\s*none/);
    expect(narrow).toMatch(/min-width/);
  });

  it('keeps the button reachable by name once its text is gone', () => {
    const search = fs.readFileSync(path.join(__dirname, '../components/map/SearchBar.js'), 'utf8');
    const button = search.slice(search.indexOf('<SearchButton'), search.indexOf('</SearchButton>'));
    expect(button).toMatch(/aria-label=/);
  });
});

/**
 * The row the badge shares has to be able to grow, and to break.
 *
 * CustomDiv was flex: 0 1 auto, so it shrank but never grew: 16px of slack sat unused beside a
 * search box that had none. Growing lets the search take it, and wrapping below 430px lets the
 * search leave a row it cannot fit on.
 */
describe('the header row that holds the badge', () => {
  const fs = require('fs');
  const path = require('path');
  const styles = fs.readFileSync(
    path.join(__dirname, '../../Tethys/components/Styles.js'), 'utf8'
  );
  const from = styles.slice(styles.indexOf('export const CustomDiv = '));
  const body = from.slice(0, from.indexOf('\n`;'));

  it('grows into the space beside it rather than leaving it unused', () => {
    expect(body).toMatch(/flex:.*\$fixed.*'0 0 auto'\s*:\s*'1 1 auto'/s);
  });

  it('stays a single line at every width', () => {
    expect(body).not.toMatch(/flex-wrap:\s*wrap/);
  });
});

/**
 * The badge yields the width instead of the row breaking.
 *
 * At 320px the row has 272px, of which the two controls take 98 and the badge 83, leaving 81
 * for a search box that is 56px of padding and button before any input. Keeping one row means
 * the badge gets shorter on the narrowest phones; it keeps its full wording in the tooltip and
 * its accessible name, so nothing is lost but the letters.
 */
describe('the badge on the narrowest phones', () => {
  const fs = require('fs');
  const path = require('path');
  const narrowQuery = '@media \\(max-width: \\$\\{NARROW_HEADER_PX\\}px\\)';
  const styles = fs.readFileSync(path.join(__dirname, '../components/styles/Styles.js'), 'utf8');
  const header = fs.readFileSync(
    path.join(__dirname, '../../Tethys/components/layout/Header.js'), 'utf8'
  );
  const decl = (name) => {
    const from = styles.slice(styles.indexOf(`export const ${name} = `));
    return from.slice(0, from.indexOf('\n`;'));
  };

  it('shows the full word above 430px and the short form below it', () => {
    expect(decl('BadgeFull')).toMatch(new RegExp(`${narrowQuery}[\\s\\S]{0,40}display:\\s*none`));
    expect(decl('BadgeShort')).toMatch(new RegExp(`${narrowQuery}[\\s\\S]{0,40}display:\\s*inline`));
  });

  it('never disappears, whichever form is showing', () => {
    expect(header).toMatch(/<BadgeFull>Experimental<\/BadgeFull>/);
    expect(header).toMatch(/<BadgeShort[^>]*>Exp<\/BadgeShort>/);
  });

  it('keeps the full wording reachable when only the short form is drawn', () => {
    // aria-label on a plain span is ignored: role=generic cannot be named, and the a11y tree
    // read "Exp". The full word has to be real text, hidden visually rather than semantically.
    expect(header).toMatch(/<BadgeShort aria-hidden="true">Exp<\/BadgeShort>/);
    expect(header).toMatch(/<BadgeAssistive>Experimental<\/BadgeAssistive>/);
    const badge = header.slice(header.indexOf('<ExperimentalBadge'));
    expect(badge.slice(0, badge.indexOf('>'))).toMatch(/title="These streamflow predictions/);
  });
});

/**
 * The wrapped row is narrower than the viewport, so the prompt is sized to it.
 *
 * Giving the search flex-basis: 100% spans its own group, not the header: the button group
 * still sits beside that group at container level, so at 320px the search gets 158px rather
 * than 272. Restructuring the header to free the full width would move the search on every
 * screen, so the prompt is fitted to the width that is actually available.
 */
describe('the search prompt on the narrowest phones', () => {
  const fs = require('fs');
  const path = require('path');
  const styles = fs.readFileSync(path.join(__dirname, '../components/styles/Styles.js'), 'utf8');
  const from = styles.slice(styles.indexOf('export const SearchInput = '));
  const body = from.slice(0, from.indexOf('\n`;'));

  it('shrinks to fit rather than being cut off mid-word', () => {
    const veryNarrow = body.slice(body.indexOf('@media (max-width: ${NARROW_HEADER_PX}px)'));
    expect(veryNarrow).toMatch(/&::placeholder/);
    expect(veryNarrow).toMatch(/font-size/);
  });
});

/**
 * The prompt shortens where the row cannot spell it out.
 *
 * At 320px the input has ~54px against the 93px "Search for an id" needs, so the visible prompt
 * becomes "Search id". The accessible name stays the full sentence: a screen-reader user is not
 * on a narrow row and loses nothing.
 */
describe('the search prompt where the row is narrowest', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../components/map/SearchBar.js'), 'utf8'
  );

  it('swaps the visible prompt for a short one below the narrow breakpoint', () => {
    expect(src).toMatch(/placeholder=\{narrow \? shortPlaceholder : placeholder\}/);
  });

  it('keeps the full sentence as the accessible name', () => {
    expect(src).toMatch(/aria-label=\{placeholder\}/);
  });
});
