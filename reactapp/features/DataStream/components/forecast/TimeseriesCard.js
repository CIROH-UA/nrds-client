import { Fragment, useMemo, useCallback } from 'react';
import { TimeSeriesContainer } from '../styles/Styles';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import ParentSize from '@visx/responsive/lib/components/ParentSize';
import LineChart from 'features/DataStream/components/forecast/Plot';
import { useShallow } from 'zustand/react/shallow';

const TimeSeriesCard = () => {
  const { series, variable, layout, featureId, loading, answered, failed } = useTimeSeriesStore(
    useShallow((state) => ({
      series: state.series,
      variable: state.variable,
      layout: state.layout,
      featureId: state.feature_id,
      loading: state.loading,
      answered: state.last_answered_key,
      failed: state.last_error,
    }))
  );

  /** What an empty chart says. */
  const waiting = featureId && (loading || (!series.length && !answered && !failed));
  const emptyMessage = waiting
    ? 'Loading the timeseries'
    : featureId
      ? `No data to chart for ${featureId} in this selection`
      : 'Select a catchment to see its timeseries';

  const chartData = useMemo(() => {
    return [
      {
        label: variable,
        data: series,
      },
    ];
  }, [series, variable]);

  const renderChart = useCallback(
    ({ width, height }) => (
      <LineChart
        width={width}
        height={height}
        data={chartData}
        layout={layout}
        emptyMessage={emptyMessage}
      />
    ),
    [chartData, layout, emptyMessage]
  );

  return (
    <Fragment>
          <TimeSeriesContainer>
            <ParentSize>
              {renderChart}
            </ParentSize>
          </TimeSeriesContainer>

    </Fragment>
  );
};

export default TimeSeriesCard;
