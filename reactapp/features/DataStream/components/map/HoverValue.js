import PropTypes from 'prop-types';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { getValueAtTimeFlat } from 'features/DataStream/lib/layers';
import { getVariableUnits } from 'features/DataStream/lib/data';
import { formatMeasurement, numericPartOf, timeOffsetLabel } from 'features/DataStream/lib/utils';

const MISSING = -9998;

/**
 * The animated variable's value for the feature under the pointer.
 *
 * Its own component, subscribed to the time index, rather than a field on the hovered feature.
 * The hovered feature is written once on mousemove, so a value stored there would freeze at
 * whichever step the pointer stopped on and only catch up when the mouse moved again. Reading it
 * here means the number follows playback, and follows the slider when playback is paused: those
 * are the same code path, since paused only means the index is not changing.
 *
 * Renders nothing when there is nothing true to say. The flowpath layer covers the whole country
 * while only one vpu has values loaded, so a feature with no row in the value array must show no
 * number rather than a wrong one.
 */
export const HoverValue = ({ hoverId }) => {
  const { variable, currentTimeIndex } = useTimeSeriesStore(
    useShallow((s) => ({ variable: s.variable, currentTimeIndex: s.currentTimeIndex }))
  );

  const { varData, times, featureIdToIndex } = useVPUStore(
    useShallow((s) => ({
      varData: s.valuesByVar?.[variable],
      times: s.times,
      featureIdToIndex: s.featureIdToIndex,
    }))
  );

  // The index registers the bare number and the wb- form, so a catchment's cat- id has to be
  // reduced to its number before it can be looked up.
  const featureIndex = useMemo(() => {
    if (hoverId === null || hoverId === undefined) return undefined;
    const direct = featureIdToIndex?.[String(hoverId)];
    if (direct !== undefined) return direct;
    const numeric = numericPartOf(hoverId);
    return numeric ? featureIdToIndex?.[numeric] : undefined;
  }, [hoverId, featureIdToIndex]);

  if (featureIndex === undefined || !varData || !times?.length) return null;

  const value = getValueAtTimeFlat(varData, times.length, featureIndex, currentTimeIndex);
  if (value === null || value === undefined) return null;

  const label = `${variable}${getVariableUnits(variable) ? ` (${getVariableUnits(variable)})` : ''}`;
  const at = timeOffsetLabel(times, currentTimeIndex);
  const reading = value <= MISSING ? 'no data' : formatMeasurement(value);
  if (reading === null) return null;

  return (
    <div className="popup-row popup-measure">
      <span className="popup-label">
        {label}
        {at ? <em>{at}</em> : null}
      </span>
      <span className="popup-value">{reading}</span>
    </div>
  );
};

HoverValue.propTypes = {
  hoverId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

export default HoverValue;
