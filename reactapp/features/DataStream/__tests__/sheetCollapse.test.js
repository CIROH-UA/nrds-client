/**
 * Minimising the sheet instead of closing it.
 *
 * On a phone the sheet takes most of the map, so the only way to watch the animation was to close
 * the panel -- which used to tear the animation down. Collapsing leaves the header row on screen
 * as the handle, keeps the chart mounted, and moves the map's own controls back down by the peek
 * rather than the full height.
 *
 * The chevron is separate from the clear control on purpose: minimising and discarding a
 * selection are different intentions, and losing the second would be worse than the first.
 */
import { render, screen, fireEvent } from '@testing-library/react';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';

jest.mock('features/DataStream/components/forecast/dataMenu', () => function DataMenu() { return <div />; });
jest.mock('features/DataStream/components/forecast/TimeseriesCard', () => function Card() { return <div />; });
jest.mock('features/DataStream/components/forecast/variablesMenu', () => function Variables() { return <div />; });

let matches = true;
beforeAll(() => {
  window.matchMedia = (query) => ({
    get matches() { return matches; },
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

const ForecastMenu = require('features/DataStream/components/menus/ForecastMenu').default;

const initial = useTimeSeriesStore.getState();
beforeEach(() => {
  useTimeSeriesStore.setState(initial, true);
  delete document.body.dataset.sheet;
  matches = true;
});

const selected = () =>
  useTimeSeriesStore.setState({ feature_id: 'wb-1', layout: { title: 'Cat 1', subtitle: '' } });

describe('on a phone', () => {
  it('offers a minimise control beside the clear control, not instead of it', () => {
    selected();

    render(<ForecastMenu />);

    expect(screen.getByRole('button', { name: /minimise the forecast panel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
  });

  it('reports the collapsed state so the map controls can follow it', () => {
    selected();
    render(<ForecastMenu />);
    expect(document.body.dataset.sheet).toBe('expanded');

    fireEvent.click(screen.getByRole('button', { name: /minimise the forecast panel/i }));

    expect(document.body.dataset.sheet).toBe('collapsed');
  });

  it('expands again, and says which state it is in', () => {
    selected();
    render(<ForecastMenu />);
    const toggle = () => screen.getByRole('button', { name: /the forecast panel/i });

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(document.body.dataset.sheet).toBe('expanded');
  });

  it('keeps the selection when minimised, unlike clearing it', () => {
    selected();
    render(<ForecastMenu />);

    fireEvent.click(screen.getByRole('button', { name: /minimise the forecast panel/i }));

    expect(useTimeSeriesStore.getState().feature_id).toBe('wb-1');
  });

  it('opens the next selection expanded rather than remembering the last minimise', () => {
    selected();
    const { rerender } = render(<ForecastMenu />);
    fireEvent.click(screen.getByRole('button', { name: /minimise the forecast panel/i }));

    useTimeSeriesStore.setState({ feature_id: null });
    rerender(<ForecastMenu />);
    useTimeSeriesStore.setState({ feature_id: 'wb-2', layout: { title: 'Cat 2', subtitle: '' } });
    rerender(<ForecastMenu />);

    expect(document.body.dataset.sheet).toBe('expanded');
  });
});

describe('on a wide screen', () => {
  it('offers no minimise control, since the panel does not cover the map', () => {
    matches = false;
    selected();

    render(<ForecastMenu />);

    expect(screen.queryByRole('button', { name: /the forecast panel/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
  });
});

/**
 * The peek has to be tall enough for the row it exposes.
 *
 * Only the top --sheet-peek of the sheet stays on screen when collapsed, and the chevron shares
 * the header row with the title. Row sets a min-height and no max, and the title wraps by
 * default, so a long catchment name grew the row past the peek and pushed the only control that
 * re-expands the sheet out of view.
 */
describe('the collapsed header', () => {
  const fs = require('fs');
  const path = require('path');
  const styles = fs.readFileSync(path.join(__dirname, '../components/styles/Styles.js'), 'utf8');
  const scss = fs.readFileSync(path.join(__dirname, '../../../App.scss'), 'utf8');

  it('keeps the title on one line so the row cannot outgrow the peek', () => {
    const container = styles.slice(styles.indexOf('export const Container'));
    const narrow = container.slice(container.indexOf('@media'), container.indexOf('\n`;'));
    expect(narrow).toMatch(/h2 \{[\s\S]{0,80}white-space:\s*nowrap/);
  });

  it('lifts the sheet by everything except the peek when collapsed', () => {
    const container = styles.slice(styles.indexOf('export const Container'));
    const narrow = container.slice(container.indexOf('@media'), container.indexOf('\n`;'));
    expect(narrow).toMatch(/translateY\([\s\S]{0,20}var\(--sheet-height\) - var\(--sheet-peek\)/);
  });

  /**
   * A peek measured against a taller sheet must not lift the shorter one off the bottom.
   *
   * The peek is measured once per open or collapse, but --sheet-height is dvh-based and moves
   * on rotation and on the mobile address bar hiding, with no re-render and no breakpoint
   * crossed. Below a 268px viewport the stale 92px peek exceeds the sheet and the difference
   * goes negative. max(0px, ...) is exactly what re-measuring would have produced at every
   * height, and unlike a measurement it cannot go stale.
   */
  it('never lets a stale peek lift the collapsed sheet off the bottom edge', () => {
    const container = styles.slice(styles.indexOf('export const Container'));
    const narrow = container.slice(container.indexOf('@media'), container.indexOf('\n`;'));
    expect(narrow).toMatch(/translateY\(max\(0px,\s*var\(--sheet-height\) - var\(--sheet-peek\)\)\)/);
  });

  it('keeps the map controls inside the sheet they are offset by', () => {
    const collapsed = scss.slice(scss.indexOf("body[data-sheet='collapsed']"));
    const block = collapsed.slice(0, collapsed.indexOf('}'));
    expect(block).toMatch(/--sheet-offset:\s*min\(var\(--sheet-peek\), var\(--sheet-height\)\)/);
    expect(block).toMatch(/--map-controls-offset:\s*calc\(min\(var\(--sheet-peek\), var\(--sheet-height\)\) \+ 96px\)/);
  });

  it('stops the collapsed sheet scrolling its hidden body into the peek', () => {
    const container = styles.slice(styles.indexOf('export const Container'));
    const narrow = container.slice(container.indexOf('@media'), container.indexOf('\n`;'));
    expect(narrow).toMatch(/overflow-y:[\s\S]{0,60}\$collapsed \? 'hidden' : 'auto'/);
  });

  it('clears the property it wrote, not just the attribute', () => {
    const src = fs.readFileSync(path.join(__dirname, '../components/menus/ForecastMenu.js'), 'utf8');
    expect(src).toMatch(/removeProperty\('--sheet-peek'\)/);
  });

  it('keeps a fallback tall enough for the first paint', () => {
    const peek = Number(/--sheet-peek:\s*(\d+)px/.exec(scss)[1]);
    expect(peek).toBeGreaterThanOrEqual(80);
  });
});

/**
 * A clipped control is still a reachable control.
 *
 * Collapsing only transforms the sheet and hides its overflow, so the chart and the two menus
 * stayed in the tab order below the fold: a keyboard user tabbed out of the visible header into
 * controls they could not see and activated them blind.
 */
describe('the collapsed body', () => {
  const body = () => screen.queryByRole('group', { name: /forecast details/i });

  it('is reachable while the sheet is open', () => {
    selected();

    render(<ForecastMenu />);

    expect(body()).toBeInTheDocument();
  });

  it('leaves the accessibility tree when the sheet is minimised', () => {
    selected();
    render(<ForecastMenu />);
    expect(body()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /minimise the forecast panel/i }));

    expect(body()).not.toBeInTheDocument();
  });

  it('names itself as what the chevron controls', () => {
    selected();

    render(<ForecastMenu />);

    expect(screen.getByRole('button', { name: /minimise the forecast panel/i }))
      .toHaveAttribute('aria-controls', 'sheet-body');
  });

  it('stays reachable on a desktop layout, which never collapses', () => {
    matches = false;
    selected();

    render(<ForecastMenu />);

    expect(body()).toBeInTheDocument();
  });
});

/**
 * What the effect actually writes, rather than what its source looks like.
 *
 * These assertions used to grep ForecastMenu.js for the call, which still matched with
 * paddingTop and sheetHeight transposed. Stubbing the two heights apart and reading the
 * property back is the only version that fails on a swap.
 */
describe('the measured peek', () => {
  const stubHeights = ({ row, sheet }) =>
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() { return this.tagName === 'ASIDE' ? sheet : row; },
    });

  afterEach(() => {
    delete HTMLElement.prototype.offsetHeight;
    document.body.style.removeProperty('--sheet-peek');
  });

  const peek = () => document.body.style.getPropertyValue('--sheet-peek');

  it('grows with the header row it has to expose', () => {
    stubHeights({ row: 120, sheet: 400 });
    selected();

    render(<ForecastMenu />);

    expect(peek()).toBe('148px');
  });

  it('never exceeds the sheet it is a slice of', () => {
    stubHeights({ row: 500, sheet: 300 });
    selected();

    render(<ForecastMenu />);

    expect(peek()).toBe('300px');
  });
});

/**
 * The closed sheet leaves the tab order, not just the viewport.
 *
 * layout defaults to DEFAULT_LAYOUT, whose title is truthy, so the panel and its header mount
 * with nothing selected. Closing only translated it off-screen, which hides it from sight and
 * from nobody else: a probe render with feature_id null found four focusable buttons, the
 * minimise chevron among them. CollapsibleRegion already paired aria-hidden with visibility
 * for the collapsed body; the outer sheet never got the same treatment.
 */
describe('the closed sheet', () => {
  it('is hidden from assistive technology when nothing is selected', () => {
    render(<ForecastMenu />);

    expect(screen.getByLabelText('Selected feature')).toHaveAttribute('aria-hidden', 'true');
  });

  it('offers none of its controls to a keyboard while closed', () => {
    render(<ForecastMenu />);

    expect(screen.queryByRole('button', { name: /minimise the forecast panel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear selection/i })).not.toBeInTheDocument();
  });

  it('hands them back once a feature is selected', () => {
    selected();

    render(<ForecastMenu />);

    expect(screen.getByLabelText('Selected feature')).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
  });
});

/**
 * A control whose target the collapse hides goes with it.
 *
 * The notes toggle sits in the row the peek keeps on screen, but the panel it opens renders
 * inside the region collapse hides, so minimising left a button that visibly did nothing.
 */
describe('the notes toggle', () => {
  const toggle = () => screen.queryByRole('button', { name: /notes on this data/i });

  it('is offered while the sheet is open', () => {
    selected();

    render(<ForecastMenu />);

    expect(toggle()).toBeInTheDocument();
  });

  it('goes away with the panel it opens', () => {
    selected();
    render(<ForecastMenu />);

    fireEvent.click(screen.getByRole('button', { name: /minimise the forecast panel/i }));

    expect(toggle()).not.toBeInTheDocument();
  });

  it('comes back when the sheet does', () => {
    selected();
    render(<ForecastMenu />);
    fireEvent.click(screen.getByRole('button', { name: /minimise the forecast panel/i }));

    fireEvent.click(screen.getByRole('button', { name: /expand the forecast panel/i }));

    expect(toggle()).toBeInTheDocument();
  });
});
