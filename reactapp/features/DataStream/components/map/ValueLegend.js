import PropTypes from 'prop-types';
import { useMemo } from 'react';

import { COLOR_SCALE, valueAtRampPosition } from 'features/DataStream/lib/layers';
import { getVariableUnits } from 'features/DataStream/lib/data';
import { formatMeasurement } from 'features/DataStream/lib/utils';
import { LegendBox, LegendBar, LegendScale, LegendTitle } from '../styles/Styles';

// Three ticks, not five: this sits over the map and is meant to be read at a glance.
const TICKS = [0, 0.5, 1];

/**
 * What the colours on the animated flowpaths mean.
 *
 * The bar is drawn as a gradient through the ramp's own colours, but the labels come from
 * valueAtRampPosition rather than from dividing the range up evenly. The ramp is logarithmic and
 * bent toward the median, so its midpoint is nowhere near the middle of the range: labelling it
 * linearly would describe a map that is not on screen.
 *
 * Renders nothing until there is an animation to describe.
 */
export const ValueLegend = ({ bounds, variable, visible }) => {
  const stops = useMemo(
    () => COLOR_SCALE.map(([r, g, b], i) =>
      `rgb(${r},${g},${b}) ${((i / (COLOR_SCALE.length - 1)) * 100).toFixed(1)}%`).join(', '),
    []
  );
  const ticks = useMemo(
    () => (bounds ? TICKS.map((t) => formatMeasurement(valueAtRampPosition(t, bounds))) : []),
    [bounds]
  );

  if (!visible || !bounds || !variable) return null;

  const units = getVariableUnits(variable);

  return (
    <LegendBox aria-label={`Colour scale for ${variable}`}>
      <LegendTitle>{units ? `${variable} (${units})` : variable}</LegendTitle>
      <LegendBar style={{ background: `linear-gradient(to right, ${stops})` }} />
      <LegendScale>
        {ticks.map((label, i) => (
          <span key={TICKS[i]}>{label}</span>
        ))}
      </LegendScale>
    </LegendBox>
  );
};

ValueLegend.propTypes = {
  bounds: PropTypes.shape({ min: PropTypes.number, max: PropTypes.number, curve: PropTypes.number }),
  variable: PropTypes.string,
  visible: PropTypes.bool,
};

export default ValueLegend;
