/**
 * Controls a thumb can actually hit.
 *
 * This project sets itself 44px, which is above WCAG 2.5.8's 24px minimum and is the number
 * DESIGN.md names. Three controls were under it, and the two that mattered were not the obvious
 * ones: the layer switches, which are the primary control in the panel, and the time slider,
 * whose visible bar was also its entire hit area.
 */
import fs from 'fs';
import path from 'path';

import { render, screen, fireEvent } from '@testing-library/react';

import { LayerControl } from 'features/DataStream/components/map/LayersControl';

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const styles = read('../components/styles/Styles.js');
const sliderCss = read('../components/forecast/TimeSlider.css');

const declOf = (name) => {
  const i = styles.indexOf(`export const ${name}`);
  return styles.slice(i, styles.indexOf('\n`;', i));
};

describe('the minimum target', () => {
  it.each(['GhostButton', 'MapHint', 'XButton', 'SButton', 'ModalCloseButton', 'Switch'])(
    '%s reserves 44px',
    (name) => {
      expect(declOf(name)).toMatch(/min-height:\s*44px/);
    }
  );
});

describe('the layer switches', () => {
  it('name themselves through a bound label, not a title attribute', () => {
    // The switch pill is 34 by 18 and should stay that shape. Binding the row's label to it
    // makes the layer's name part of the target, which is bigger than any pill, and gives the
    // control a real accessible name at the same time.
    render(<LayerControl />);

    ['Catchments', 'FlowPaths', 'Conus Gauges', 'VPU Boundaries', 'Enable Hovering'].forEach((layer) => {
      expect(screen.getByRole('checkbox', { name: layer })).toBeInTheDocument();
    });
  });

  it('leaves no switch relying on a title attribute for its name', () => {
    // A title is a fallback accessible name, not a label: it is not shown on touch, it is not
    // a click target, and DESIGN.md asks for a real htmlFor binding.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../components/map/LayersControl.js'), 'utf8'
    );
    const ids = [...src.matchAll(/id="([a-z-]+-switch)"/g)].map((m) => m[1]);
    const fors = [...src.matchAll(/htmlFor="([a-z-]+-switch)"/g)].map((m) => m[1]);

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !fors.includes(id))).toEqual([]);
  });

  it('toggles when the layer name is pressed, not only the pill', () => {
    render(<LayerControl />);
    const box = screen.getByRole('checkbox', { name: 'Conus Gauges' });
    const before = box.checked;

    fireEvent.click(screen.getByText('Conus Gauges'));

    expect(screen.getByRole('checkbox', { name: 'Conus Gauges' }).checked).toBe(!before);
  });
});

describe('the time slider', () => {
  it('is as tall as a finger', () => {
    // It was 6px: the track was the input's own background, so the visible bar was the entire
    // hit area. Fine with a mouse, not with a thumb.
    expect(sliderCss).toMatch(/input\[type='range'\] \{[^}]*height:\s*44px/s);
  });

  it('keeps the bar thin by drawing it as a track instead', () => {
    expect(sliderCss).toMatch(/::-webkit-slider-runnable-track \{[^}]*height:\s*6px/s);
    expect(sliderCss).toMatch(/::-moz-range-track \{[^}]*height:\s*6px/s);
  });

  it('does not paint the input itself, which is what made it the track', () => {
    const decl = sliderCss.slice(
      sliderCss.indexOf(".dock-row input[type='range'] {"),
      sliderCss.indexOf('}', sliderCss.indexOf(".dock-row input[type='range'] {"))
    );
    expect(decl).toMatch(/background:\s*transparent/);
  });
});
