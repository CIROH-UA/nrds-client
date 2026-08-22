/**
 * The key for the animation.
 *
 * It draws the ramp it is handed rather than one it imports, which is the only way it cannot
 * disagree with the map. symbologyColors carries a docstring about the last time a legend kept
 * its own copy of the palette: it was always the light one, in both themes, for as long as it
 * existed.
 *
 * The gradient is asserted through rampGradient rather than through the rendered element.
 * jsdom's CSS parser drops linear-gradient, so the style attribute never appears and a DOM
 * assertion would find nothing and pass for the wrong reason.
 */
import { render, screen } from '@testing-library/react';

import { ValueLegend } from 'features/DataStream/components/map/ValueLegend';
import { DARK_RAMP, LIGHT_RAMP, rampGradient } from 'features/DataStream/lib/valueRamp';

const bounds = { min: 0, max: 100, curve: 1 };
const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;

describe('the gradient the bar is painted with', () => {
  it('runs through every stop of the ramp it is given', () => {
    const css = rampGradient(LIGHT_RAMP);

    LIGHT_RAMP.forEach((stop) => expect(css).toContain(rgb(stop)));
  });

  it('is a different gradient for the other theme', () => {
    // The assertion the old legend made impossible: it imported a constant.
    const css = rampGradient(DARK_RAMP);

    DARK_RAMP.forEach((stop) => expect(css).toContain(rgb(stop)));
    expect(css).not.toContain(rgb(LIGHT_RAMP[0]));
  });

  it('spans the full bar, first stop to last', () => {
    const css = rampGradient(LIGHT_RAMP);

    expect(css).toContain(`${rgb(LIGHT_RAMP[0])} 0.0%`);
    expect(css).toContain(`${rgb(LIGHT_RAMP[5])} 100.0%`);
  });

  it('is empty rather than malformed when there is no ramp', () => {
    // `linear-gradient(to right, )` is invalid CSS and paints an unpredictable box.
    expect(rampGradient(undefined)).toBe('');
    expect(rampGradient([])).toBe('');
  });
});

describe('the value legend', () => {
  it('names the variable it is describing', () => {
    render(<ValueLegend bounds={bounds} ramp={LIGHT_RAMP} variable="flow" visible />);

    expect(screen.getByLabelText(/colour scale for flow/i)).toBeInTheDocument();
  });

  it('labels the ramp position, not the range, since the ramp is logarithmic', () => {
    render(<ValueLegend bounds={bounds} ramp={LIGHT_RAMP} variable="flow" visible />);

    // The midpoint of a bent log ramp is nowhere near the middle of 0..100.
    expect(screen.getByText('9.0')).toBeInTheDocument();
  });

  it('renders nothing rather than an empty bar when there is no ramp yet', () => {
    const { container } = render(
      <ValueLegend bounds={bounds} ramp={undefined} variable="flow" visible />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no animation to describe', () => {
    const { container } = render(
      <ValueLegend bounds={bounds} ramp={LIGHT_RAMP} variable="flow" visible={false} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
