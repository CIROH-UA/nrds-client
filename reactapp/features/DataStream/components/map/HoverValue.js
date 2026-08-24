import PropTypes from 'prop-types';
import { NO_DATA_VALUE } from 'features/DataStream/lib/valueRamp';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { getValueAtTimeFlat } from 'features/DataStream/lib/layers';
import { getVariableUnits } from 'features/DataStream/lib/data';
import { formatMeasurement, numericPartOf, timeOffsetLabel } from 'features/DataStream/lib/utils';

/** The animated variable's value for the feature under the pointer. */
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
  const reading = value <= NO_DATA_VALUE ? 'no data' : formatMeasurement(value);
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
