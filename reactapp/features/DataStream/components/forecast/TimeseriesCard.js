import { Fragment, Suspense, useMemo, useCallback } from 'react';
import { TimeSeriesContainer } from '../styles/Styles';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import LoadingAnimation from 'features/Tethys/components/loader/LoadingAnimation';
import ParentSize from '@visx/responsive/lib/components/ParentSize';
import LineChart from 'features/DataStream/components/forecast/Plot';
import { useShallow } from 'zustand/react/shallow';


const TimeSeriesCard = () => {
  const { series, variable, layout } = useTimeSeriesStore(useShallow((state) => ({
      series: state.series,
      variable: state.variable,
      layout: state.layout,
  })));

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
      <LineChart width={width} height={height} data={chartData} layout={layout} />
    ),
    [chartData, layout]
  );


  return (
    <Fragment>
          { 
              <Suspense fallback={<LoadingAnimation />}>
                <TimeSeriesContainer>
                  <ParentSize>
                    {renderChart}
                  </ParentSize>
                </TimeSeriesContainer>
              </Suspense>
          }

    </Fragment>
  );
};

export default TimeSeriesCard;
