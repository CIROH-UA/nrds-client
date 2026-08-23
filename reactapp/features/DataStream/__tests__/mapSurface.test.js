/**
 * The things that float over the map are one surface, not three lookalikes.
 *
 * The legend, the zoom hint and the time slider each declared their own border, background,
 * radius and box-shadow. Three copies of one card is why they read as interchangeable, and why
 * one wrong shadow -- pure black at 25%, invisible on the dark panel and heavy on the light one
 * -- was wrong in all three places at once.
 *
 * Asserted against the source rather than the rendered DOM: styled-components emits hashed class
 * names and jsdom does not resolve custom properties, so a rendered assertion here would compare
 * two empty strings and pass.
 */
import fs from 'fs';
import path from 'path';

const styles = fs.readFileSync(
  path.join(__dirname, '../components/styles/Styles.js'),
  'utf8'
);

// The legend used to be one of these, and so did the recentre button. The legend moved into the
// layer panel beside the switch that turns the animation on; the button moved into the feature
// panel beside the chart it relates to. What floats over the map now is what belongs to the map.
const OVERLAYS = ['MapHint', 'TimeSliderDock'];

const declarationOf = (name) => {
  const i = styles.indexOf(`export const ${name} = styled`);
  return i === -1 ? null : styles.slice(i, styles.indexOf('\n`;', i));
};

describe('the map overlays', () => {
  it.each(OVERLAYS)('%s is built on the shared surface', (name) => {
    expect(declarationOf(name)).toMatch(/styled\(MapSurface\)/);
  });

  it.each(OVERLAYS)('%s does not redeclare what the surface owns', (name) => {
    const decl = declarationOf(name);
    expect(decl).not.toMatch(/^\s*box-shadow:/m);
    expect(decl).not.toMatch(/^\s*background-color:\s*var\(--map-panel-bg\)/m);
    expect(decl).not.toMatch(/^\s*border:\s*1px solid var\(--panel-border-color\)/m);
  });

  it('never uses the untuned black shadow the overlays used to share', () => {
    OVERLAYS.forEach((name) => {
      expect(declarationOf(name)).not.toContain('rgba(0, 0, 0, 0.25)');
    });
  });
});

describe('elevation', () => {
  it('separates the control the reader operates from the readouts', () => {
    // The slider is driven; the legend and the hint only report. Flat elevation made a passive
    // caption look as important as the transport controls.
    expect(declarationOf('TimeSliderDock')).toMatch(/\$control:\s*true/);
    expect(declarationOf('MapHint')).not.toMatch(/\$control/);
  });

  it('offers two levels, not one', () => {
    expect(styles).toContain('--elevation-map-control');
    expect(styles).toContain('--elevation-map-readout');
  });
});

describe('the elevation tokens', () => {
  const scss = fs.readFileSync(path.join(__dirname, '../../../App.scss'), 'utf8');
  const light = scss.slice(0, scss.indexOf('/* Dark theme override */'));
  const dark = scss.slice(scss.indexOf('/* Dark theme override */'));

  it.each(['--elevation-map-readout', '--elevation-map-control'])(
    '%s is defined for both themes rather than shared',
    (token) => {
      // A shadow that works on white is invisible on a dark map: it reads there by darkening the
      // basemap, not by adding a halo, so the alpha has to differ.
      expect(light).toContain(`${token}:`);
      expect(dark).toContain(`${token}:`);
    }
  );

  it('is tinted with the family hue rather than pure black', () => {
    const shadows = scss.match(/--elevation-map-[a-z]+:[^;]+;/g) || [];
    expect(shadows).toHaveLength(4);
    shadows.forEach((decl) => {
      expect(decl).toContain('oklch(');
      expect(decl).not.toMatch(/rgba\(0,\s*0,\s*0/);
    });
  });

  it('is stronger on the dark theme, where a shadow has less to work with', () => {
    const alphaOf = (block, token) => {
      const decl = block.match(new RegExp(`${token}:[^;]+;`))[0];
      return Math.max(...[...decl.matchAll(/\/\s*([\d.]+)\)/g)].map((m) => Number(m[1])));
    };
    expect(alphaOf(dark, '--elevation-map-control'))
      .toBeGreaterThan(alphaOf(light, '--elevation-map-control'));
  });
});

describe('the legend title', () => {
  it('is a label rather than a shouted micro-heading', () => {
    // uppercase + letter-spacing + weight 650 is the house style of every generated dashboard.
    const decl = declarationOf('LegendTitle');
    expect(decl).not.toContain('text-transform: uppercase');
    expect(decl).not.toContain('letter-spacing');
    expect(decl).not.toContain('var(--weight-strong)');
  });
});

/**
 * The Flat Shell Rule, as an assertion.
 *
 * DESIGN.md: surfaces are flat at rest, depth is tonal, and a shadow is only justified when the
 * surface underneath is not ours to control -- which in this app means the basemap and nothing
 * else. Four shadows had drifted past that: the modal, the chart tooltip, the Update button and
 * the hover popup, all of them pure black at 25% in both themes, which is invisible against a
 * dark panel and heavy against a light one.
 */
describe('the Flat Shell Rule', () => {
  const plot = fs.readFileSync(
    path.join(__dirname, '../components/forecast/Plot.js'),
    'utf8'
  );

  it('leaves no untinted black shadow anywhere in the components', () => {
    [styles, plot].forEach((src) => {
      const shadows = src.match(/box-?[Ss]hadow[^;,\n]*rgba\(0,\s*0,\s*0/g) || [];
      expect(shadows).toEqual([]);
    });
  });

  it('keeps a shadow only on what floats over the basemap', () => {
    // The hover popup does. It reads a per-theme elevation token rather than a literal.
    const i = styles.indexOf('export const PopupContent');
    expect(styles.slice(i, styles.indexOf('\n`;', i)))
      .toContain('box-shadow: var(--elevation-map-readout)');
  });

  it.each(['ThemedModal', 'XButton'])('%s is flat, because the app is underneath it', (name) => {
    const i = styles.indexOf(`export const ${name}`);
    expect(styles.slice(i, styles.indexOf('\n`;', i))).toContain('box-shadow: none');
  });
});
