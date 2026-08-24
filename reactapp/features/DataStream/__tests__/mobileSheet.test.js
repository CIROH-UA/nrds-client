/**
 * The narrow-viewport layout.
 *
 * Two controls used to render past the right edge of a phone screen: the About button and the
 * layer toggle, which is the only way into the layer panel and so the only way to switch the
 * catchments layer a map click acts on. Nothing scrolled to reach them.
 *
 * The panel became a bottom sheet at the same breakpoint. A full-width panel on a map hides the
 * catchment the chart describes, and the time slider floated over the sheet's own controls until
 * it was told how far to move up.
 *
 * Read from the stylesheet and the component source rather than by measuring a layout: jsdom
 * resolves no media queries and gives every element a zero-sized box, so a rendered assertion
 * here would pass whatever the CSS said.
 */
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const scss = read('../../../App.scss');
const styles = read('../components/styles/Styles.js');
const tethysStyles = read('../../Tethys/components/Styles.js');
const header = read('../../Tethys/components/layout/Header.js');
const forecastMenu = read('../components/menus/ForecastMenu.js');

const block = (source, name) => {
  const i = source.indexOf(name);
  if (i === -1) throw new Error(`${name} not found`);
  return source.slice(i, source.indexOf('\n`;', i));
};

describe('the header can shrink', () => {
  it('lets the flex row narrow past its content', () => {
    // min-width defaults to auto on a flex item, which is what pinned the row at 438px on a
    // 390px screen and pushed the second group to x=462.
    expect(block(tethysStyles, 'export const CustomDiv')).toMatch(/min-width:\s*0/);
  });

  it('scales the gap instead of spending 32px three times over', () => {
    expect(block(tethysStyles, 'export const CustomDiv')).toMatch(/gap:\s*clamp\(/);
  });

  it('holds the control group at its natural size so it is never the part that goes', () => {
    expect(block(tethysStyles, 'export const CustomDiv')).toMatch(/\$fixed \? '0 0 auto'/);
    expect(header).toMatch(/<CustomDiv \$fixed>/);
  });
});

describe('the feature panel on a phone', () => {
  const container = block(styles, 'export const Container');

  it('sits at the bottom rather than covering the map', () => {
    expect(container).toMatch(/inset:\s*auto 0 0 0/);
    expect(container).toMatch(/translateY\(100%\)/);
  });

  it('leaves the map visible above it', () => {
    expect(container).toMatch(/height:\s*var\(--sheet-height\)/);
    // dvh, not vh: vh does not track the mobile URL bar, and the min() keeps the dock on screen
    // on a landscape phone where 58% of the large viewport plus the dock exceeds what is visible.
    expect(scss).toMatch(/--sheet-height:\s*min\(58dvh, calc\(100dvh/);
  });
});

describe('the time slider clears the sheet', () => {
  it('offsets itself by whatever the sheet is occupying', () => {
    expect(block(styles, 'export const TimeSliderDock')).toMatch(
      /bottom:\s*calc\(28px \+ var\(--sheet-offset, 0px\)\)/
    );
  });

  it('is offset only while a sheet is actually open, and only at that breakpoint', () => {
    expect(scss).toMatch(/--sheet-offset:\s*0px/);
    expect(scss).toMatch(/body\[data-sheet-open='true'\][\s\S]{0,80}--sheet-offset:\s*var\(--sheet-height\)/);
  });

  it('is driven by the panel, whose siblings the map controls are', () => {
    expect(forecastMenu).toMatch(/document\.body\.dataset\.sheetOpen/);
  });
});

describe('touch targets', () => {
  /**
   * The row is the target, not the glyph.
   *
   * Padding the input to 44px looked right in a measurement and wrong on screen: bootstrap draws
   * the switch as a border and a background-image knob on the input's own box, so content-box
   * padding stretched the border into a tall pill with a small switch floating inside it. The
   * label already spans the row and already activates the input, so the row carries the height.
   */
  it('leaves the switch glyph alone', () => {
    const rule = scss.slice(scss.indexOf('.form-switch .form-check-input'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).not.toMatch(/padding:/);
    expect(body).not.toMatch(/background-clip/);
    expect(body).not.toMatch(/box-sizing/);
  });

  it('makes the row a 44px target instead', () => {
    expect(block(styles, 'export const Row =')).toMatch(/min-height:\s*44px/);
  });

  it('gives the two header controls a 44px box', () => {
    expect(block(tethysStyles, 'export const StyledButton')).toMatch(/min-height:\s*44px/);
    expect(block(styles, 'export const LayerButton')).toMatch(/min-height:\s*44px/);
  });

  it("gives maplibre's 29px zoom buttons a real target", () => {
    expect(scss).toMatch(/\.maplibregl-ctrl-group button[\s\S]{0,60}width:\s*44px/);
  });
});

describe('the layer panel', () => {
  it('is inset from both edges instead of 100% wide beside a right offset', () => {
    const layers = block(styles, 'export const LayersContainer');
    const narrow = layers.slice(layers.indexOf('@media'));
    expect(narrow).toMatch(/left:\s*8px/);
    expect(narrow).toMatch(/right:\s*8px/);
    expect(narrow).toMatch(/width:\s*auto/);
    // The old rule: width:100% while still offset from the right, which put its left edge at -10px.
    expect(narrow).not.toMatch(/width:\s*100%/);
  });
});

/**
 * The popup the sheet makes redundant.
 *
 * Moving the time slider up to clear the sheet put it in the half of the map the sheet leaves
 * visible, which is exactly where a selected feature's popup anchors. The popup names the same
 * feature the sheet's header does and lists the same fields the sheet's Feature Information
 * section does, so on a phone it is the third copy and the one in the way.
 */
describe('the visually hidden rules', () => {
  it('are shared rather than copied beside the ones VisuallyHidden already had', () => {
    const styleSrc = read('../components/styles/Styles.js');
    expect(styleSrc).toMatch(/const visuallyHiddenRules = css`/);
    expect((styleSrc.match(/clip-path: inset\(50%\)/g) || []).length).toBe(1);
  });
});

describe('the navbar row', () => {
  it('adds only the gap bootstrap does not already set', () => {
    // .navbar > .container-fluid already carries display/align-items/justify-content at higher
    // specificity, so redeclaring them here never applied.
    const nav = block(tethysStyles, 'export const CustomNavBar');
    const rule = nav.slice(nav.indexOf('> *'), nav.indexOf('}', nav.indexOf('> *')));
    expect(rule).toMatch(/gap:\s*16px/);
    expect(rule).not.toMatch(/display:\s*flex/);
    expect(rule).not.toMatch(/justify-content/);
  });
});

describe('the sheet attribute effect', () => {
  it('does not delete and rewrite on every toggle', () => {
    const src = read('../components/menus/ForecastMenu.js');
    const keyed = src.slice(src.indexOf('dataset.sheetOpen'));
    expect(keyed.slice(0, keyed.indexOf('}, [isopen])'))).not.toMatch(/delete/);
    expect(src).toMatch(/useEffect\(\(\) => \(\) => \{ delete document\.body\.dataset\.sheetOpen; \}, \[\]\)/);
  });
});

describe('the map controls under the sheet', () => {
  it('lift clear of it, attribution above the time slider', () => {
    // The sheet covers the bottom 58vh, which is where maplibre puts its zoom, scale and
    // attribution. Attribution has to clear the dock as well, which is nearly full width.
    // Attribution shares the bottom-right corner with zoom and scale, and the dock is nearly
    // full width, so both corners clear the sheet and the dock together.
    expect(scss).toMatch(/bottom-right,\s*\n\s*\.maplibregl-ctrl-bottom-left[\s\S]{0,120}var\(--map-controls-offset/);
    expect(scss).toMatch(/--map-controls-offset:\s*calc\(var\(--sheet-height\) \+ 96px\)/);
  });
});
