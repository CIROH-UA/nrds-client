import { Fragment, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Spinner } from 'react-bootstrap';
import { TimeSeriesContainer } from '../styles/Styles';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import ParentSize from '@visx/responsive/lib/components/ParentSize';
import LineChart from 'features/DataStream/components/forecast/Plot';
import { useShallow } from 'zustand/react/shallow';

/**
 * The charted series, with its own loading, empty and error states so it can stand alone inside
 * the anchored popup as well as the sheet. Pass width/height to render at a fixed size (the popup,
 * where @visx ParentSize cannot measure a self-sizing surface); omit them to fill the parent.
 */
const TimeSeriesCard = ({ width, height } = {}) => {
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

  const clearError = useCallback(() => {
    useTimeSeriesStore.setState({ last_error: null, loadingText: '' });
  }, []);

  const hasData = series.length > 0;
  const waiting = Boolean(featureId) && (loading || (!hasData && !answered && !failed));
  const errored = Boolean(failed) && !hasData;

  /** What an empty chart says. */
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
    ({ width: w, height: h }) => (
      <LineChart
        width={w}
        height={h}
        data={chartData}
        layout={layout}
        emptyMessage={emptyMessage}
      />
    ),
    [chartData, layout, emptyMessage]
  );

  const fixed = Number.isFinite(width) && Number.isFinite(height);

  let body;
  if (errored) {
    body = (
      <div className="chart-state chart-state--error" role="alert">
        <p>Could not load the timeseries for {featureId}.</p>
        <button type="button" onClick={clearError}>
          Dismiss
        </button>
      </div>
    );
  } else if (waiting) {
    body = (
      <div className="chart-state chart-state--loading" role="status">
        <Spinner animation="border" size="sm" aria-hidden="true" />
        <span>{emptyMessage}</span>
      </div>
    );
  } else if (fixed) {
    body = renderChart({ width, height });
  } else {
    body = <ParentSize>{renderChart}</ParentSize>;
  }

  return (
    <Fragment>
      <TimeSeriesContainer $fixed={fixed} style={fixed ? { width, height } : undefined}>
        {body}
      </TimeSeriesContainer>
    </Fragment>
  );
};

TimeSeriesCard.propTypes = {
  width: PropTypes.number,
  height: PropTypes.number,
};

export default TimeSeriesCard;
