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

  /**
   * What an empty chart says.
   *
   * The message was fixed text asking the reader to select a catchment, which is wrong in the
   * case that matters: a catchment is selected, the panel is open because of it, and the chart
   * is empty because this selection has nothing to read. Being told to do the thing already
   * done reads as the app having lost track.
   *
   * An empty chart before an answer arrives is not an answer. Clicking a catchment after the
   * cache was cleared refetches the whole vpu, several seconds in which this flatly reported
   * that the catchment has nothing to show, and then charted it. The loading flag alone does not
   * cover it: the selection is recorded before the load begins, and the gap is long enough to
   * read when duckdb has to start again.
   *
   * So the question is whether an answer has arrived, which is last_answered_key: a completed
   * load sets it whether or not it found anything. last_loaded_key means something narrower --
   * this series is charted -- and reading that here made a load which completed and found
   * nothing read as still loading for ever. A load that broke sets last_error, so neither key
   * nor error, with nothing charted, means not yet.
   */
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
