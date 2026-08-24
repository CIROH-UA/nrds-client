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

/** What the colours on the animated flowpaths mean. */
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

/** The legend where the layer controls are. */
/** The colour key, reading the same bounds object the map layer uses rather than a second computation of the same numbers. */
export const ValueLegendPanel = () => {
  const variable = useTimeSeriesStore((s) => s.variable);
  const { times, values } = useVPUStore(
    useShallow((s) => ({ times: s.times, values: s.valuesByVar?.[variable] }))
  );
  const flowpathsVisible = useLayersStore((s) => s.flowpaths.visible);
  const { ramp } = useMapTheme();

  const bounds = boundsFor(values);

  if (!flowpathsVisible || !times.length) return null;

  return <ValueLegend bounds={bounds} ramp={ramp} variable={variable} />;
};

export default ValueLegend;
