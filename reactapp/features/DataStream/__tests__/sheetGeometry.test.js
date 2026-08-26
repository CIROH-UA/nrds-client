/**
 * The arithmetic behind the sheet, separated from the DOM that supplies it.
 *
 * Three ways to strand a reader came from measuring a live rect on a container that scrolls,
 * transforms, and holds expandable content. A scrolled sheet produced a 22px peek with every
 * control below the fold; an open note produced a peek larger than the sheet, so minimising
 * enlarged it and on a 320px screen lifted it off the bottom edge; and a rect read while the
 * open transition had not started reported no coverage at all, so the map flew the catchment
 * under the panel describing it.
 *
 * jsdom computes no layout, so the rects can never be real here. Numbers can be.
 */
import { peekFor, coverFor, PEEK_FALLBACK_PX } from 'features/DataStream/lib/sheetGeometry';

describe('peekFor', () => {
  it('shows the row plus the sheet padding and a little air', () => {
    expect(peekFor({ rowHeight: 72, paddingTop: 12, sheetHeight: 489 })).toBe(92);
  });

  it('never returns less than the fallback, however the row was measured', () => {
    // A scrolled container reported 14px once, which collapsed to a sliver with no controls.
    expect(peekFor({ rowHeight: 0, paddingTop: 12, sheetHeight: 489 })).toBe(PEEK_FALLBACK_PX);
    expect(peekFor({ rowHeight: -70, paddingTop: 12, sheetHeight: 489 })).toBe(PEEK_FALLBACK_PX);
  });

  it('never returns more than the sheet it is subtracted from', () => {
    // An open note measured ~343px against a 329px sheet on a 320px screen. Unclamped that gave
    // translateY(329 - 351) = -22px, lifting the collapsed sheet off the bottom of the viewport.
    expect(peekFor({ rowHeight: 343, paddingTop: 12, sheetHeight: 329 })).toBe(329);
    expect(peekFor({ rowHeight: 900, paddingTop: 12, sheetHeight: 489 })).toBe(489);
  });

  it('leaves a measurement that fits alone', () => {
    expect(peekFor({ rowHeight: 303, paddingTop: 12, sheetHeight: 329 })).toBe(323);
  });

  it('is stable against a sheet smaller than the fallback', () => {
    expect(peekFor({ rowHeight: 72, paddingTop: 12, sheetHeight: 40 })).toBe(40);
  });
});

describe('coverFor', () => {
  it('reads the state, not the transform mid-animation', () => {
    // The rect said zero while the open transition had not started, so the fly-to lifted nothing.
    expect(coverFor({ state: 'expanded', sheetHeight: 489, peek: 92 })).toBe(489);
  });

  it('covers only the peek once minimised', () => {
    expect(coverFor({ state: 'collapsed', sheetHeight: 489, peek: 92 })).toBe(92);
  });

  it('covers nothing when there is no sheet', () => {
    expect(coverFor({ state: 'closed', sheetHeight: 489, peek: 92 })).toBe(0);
    expect(coverFor({ state: undefined, sheetHeight: 489, peek: 92 })).toBe(0);
  });

  it('never claims more of the map than the sheet occupies', () => {
    expect(coverFor({ state: 'collapsed', sheetHeight: 489, peek: 900 })).toBe(489);
  });
});

/**
 * The fallback exists twice, in two languages, and has to stay one number.
 *
 * PEEK_FALLBACK_PX is the floor inside peekFor and the value sheetCoverPx falls back to when the
 * property cannot be parsed; --sheet-peek is what the stylesheet paints before any measurement
 * lands. They are the same fact. The only assertion tying them together checked the SCSS value
 * was at least 80, which both 88 and a drifted 120 satisfy.
 */
describe('the peek fallback', () => {
  const fs = require('fs');
  const path = require('path');
  const scss = fs.readFileSync(path.join(__dirname, '../../../App.scss'), 'utf8');

  it('is the same number in the stylesheet as in the module', () => {
    const declared = Number(/--sheet-peek:\s*(\d+)px/.exec(scss)[1]);
    expect(declared).toBe(PEEK_FALLBACK_PX);
  });
});
