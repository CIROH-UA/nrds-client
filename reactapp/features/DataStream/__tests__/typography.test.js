/**
 * The interface has a face of its own, and its numbers hold still.
 *
 * There was no font-family anywhere in the app except a monospace stack copied into three files,
 * so it ran on Bootstrap's system-ui and changed personality between macOS, Windows and Linux.
 *
 * Read from source: jsdom applies neither App.scss nor styled-components' output, so a rendered
 * assertion about a font would compare two empty strings and pass.
 */
import fs from 'fs';
import path from 'path';

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const scss = read('../../../App.scss');
const styles = read('../components/styles/Styles.js');
const sliderCss = read('../components/forecast/TimeSlider.css');

describe('the declared faces', () => {
  it('names a UI face and a monospace one', () => {
    expect(scss).toMatch(/--font-ui:\s*'Public Sans'/);
    expect(scss).toMatch(/--font-mono:/);
  });

  it('applies the UI face to the document rather than leaving it to Bootstrap', () => {
    expect(scss).toMatch(/html, body, #root \{[^}]*font-family: var\(--font-ui\)/s);
  });

  it('falls back to real faces, not to a generic that would render as a serif', () => {
    const stack = scss.match(/--font-ui:\s*([^;]+);/)[1];
    expect(stack).toContain('system-ui');
    expect(stack.trim().endsWith('sans-serif')).toBe(true);
  });

  it('ships every weight it asks for', () => {
    // There is no variable build in the distribution, so a weight with no @font-face is a weight
    // the browser will synthesise -- which looks like a different typeface.
    const faces = [...scss.matchAll(/@font-face\s*\{[^}]*font-weight:\s*(\d+)/gs)].map((m) => m[1]);
    const asked = [...new Set(
      [...scss.matchAll(/--weight-(?:normal|medium|strong):\s*(\d+)/g)].map((m) => m[1])
    )];

    expect(asked.sort()).toEqual(['400', '500', '600']);
    asked.forEach((w) => expect(faces).toContain(w));
  });

  it('does not ask for 650, which no face here has', () => {
    // It rounded to 700 on Windows and Linux and rendered true on macOS SF, so "strong" meant
    // two different things depending on the reader's machine.
    expect(scss).not.toMatch(/--weight-strong:\s*650/);
  });

  it('carries the licence beside the fonts', () => {
    // OFL-1.1 in practice: GSA's modifications are CC0 but the Libre Franklin base is not, and
    // the licence says the more restrictive terms govern the combined work.
    const dir = path.join(__dirname, '../../../assets/fonts');
    expect(fs.existsSync(path.join(dir, 'LICENSE.md'))).toBe(true);
    ['Regular', 'Medium', 'SemiBold'].forEach((w) => {
      expect(fs.existsSync(path.join(dir, `PublicSans-${w}.woff2`))).toBe(true);
    });
  });
});

describe('the monospace stack', () => {
  it('is written once and referenced everywhere else', () => {
    expect((scss.match(/SFMono-Regular/g) || [])).toHaveLength(1);
    expect(styles).not.toContain('SFMono-Regular');
    expect(sliderCss).not.toContain('SFMono-Regular');
  });

  it('is never spelled as the bare generic, which resolves to whatever the browser likes', () => {
    expect(styles).not.toMatch(/font-family:\s*monospace/);
  });
});

describe('numbers that change in place', () => {
  it('gives the time readout tabular figures instead of a second typeface', () => {
    expect(sliderCss).toMatch(/\.time-value\s*\{[^}]*font-variant-numeric:\s*tabular-nums/s);
  });

  it('gives the legend ticks the same', () => {
    const legendScale = styles.slice(styles.indexOf('export const LegendScale'));
    expect(legendScale.slice(0, legendScale.indexOf('\n`;')))
      .toContain('font-variant-numeric: tabular-nums');
  });
});
