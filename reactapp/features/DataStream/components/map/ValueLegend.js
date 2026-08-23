import PropTypes from 'prop-types';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { boundsFor, valueAtRampPosition } from 'features/DataStream/lib/layers';
import { rampGradient } from 'features/DataStream/lib/valueRamp';
import { getVariableUnits } from 'features/DataStream/lib/data';
import { formatMeasurement } from 'features/DataStream/lib/utils';
import { useMapTheme } from 'features/DataStream/lib/mapTheme';
import { useLayersStore } from 'features/DataStream/store/Layers';
import { useVPUStore } from 'features/DataStream/store/VPU';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { LegendBar, LegendScale, LegendTitle } from '../styles/Styles';

// Three ticks, not five: this is a key, meant to be read at a glance.
const TICKS = [0, 0.5, 1];

/**
 * What the colours on the animated flowpaths mean.
 *
 * The bar is drawn as a gradient through the ramp's own colours, but the labels come from
 * valueAtRampPosition rather than from dividing the range up evenly. The ramp is logarithmic and
 * bent toward the median, so its midpoint is nowhere near the middle of the range: labelling it
 * linearly would describe a map that is not on screen.
 *
 * Presentational. It draws the ramp it is handed and nothing else, which is what keeps it from
 * disagreeing with the map -- symbologyColors carries a docstring about the last legend in this
 * app that kept its own copy of the palette and was wrong in dark mode for as long as it existed.
 */
export const ValueLegend = ({ bounds, ramp, variable }) => {
  const gradient = useMemo(() => rampGradient(ramp), [ramp]);
  const ticks = useMemo(
    () => (bounds ? TICKS.map((t) => formatMeasurement(valueAtRampPosition(t, bounds))) : []),
    [bounds]
  );

  if (!bounds || !variable || !ramp?.length) return null;

  const units = getVariableUnits(variable);

  return (
    <div aria-label={`Colour scale for ${variable}`}>
      <LegendTitle>{units ? `${variable} (${units})` : variable}</LegendTitle>
      <LegendBar style={{ background: gradient }} />
      <LegendScale>
        {ticks.map((label, i) => (
          <span key={TICKS[i]}>{label}</span>
        ))}
      </LegendScale>
    </div>
  );
};

ValueLegend.propTypes = {
  bounds: PropTypes.shape({ min: PropTypes.number, max: PropTypes.number, curve: PropTypes.number }),
  ramp: PropTypes.arrayOf(PropTypes.array),
  variable: PropTypes.string,
};

/**
 * The legend where the layer controls are.
 *
 * It used to float over the map at the bottom right. It sits with the switches that turn the
 * layer on and off instead, which is where a key belongs and where the reference design this
 * followed puts it.
 *
 * Not in the feature panel, which is the other panel this app has: that one is keyed on a
 * selected feature, and the animation runs whenever a vpu is loaded. The key would vanish while
 * the thing it describes kept moving -- the same defect the time slider had when it was docked
 * to the vpu rather than to the animation.
 *
 * It reads its own state rather than being handed it, because nothing between here and the map
 * has any business knowing about colour bounds.
 */
export const ValueLegendPanel = () => {
  const variable = useTimeSeriesStore((s) => s.variable);
  const { times, values } = useVPUStore(
    useShallow((s) => ({ times: s.times, values: s.valuesByVar?.[variable] }))
  );
  const flowpathsVisible = useLayersStore((s) => s.flowpaths.visible);
  const { ramp } = useMapTheme();

  // The same object the map layer uses, not a second computation of the same numbers.
  const bounds = boundsFor(values);

  if (!flowpathsVisible || !times.length) return null;

  return <ValueLegend bounds={bounds} ramp={ramp} variable={variable} />;
};

export default ValueLegend;
