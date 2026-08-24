import { Fragment, useMemo, useCallback } from 'react';
import DataMenu from '../forecast/dataMenu';
import VariablesMenu from '../forecast/variablesMenu';
import { Content, Container } from '../styles/Styles';
import TimeSeriesCard from '../forecast/TimeseriesCard';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { ForecastHeader } from '../forecast/ForecastHeader';
import { useShallow } from 'zustand/react/shallow';

const ForecastMenu = () => {
  const { layout, reset, feature_id } = useTimeSeriesStore(
    useShallow((state) => ({
      feature_id: state.feature_id,
      layout: state.layout,
      reset: state.reset,
    }))
  );

  
  const { resetVPU } = useVPUStore(
    useShallow((state) => ({
      resetVPU: state.resetVPU,
    }))
  );

  const isopen = useMemo(() => feature_id != null, [feature_id]);

  const onReset = useCallback(() => {
    reset();
    resetVPU();
  }, [reset, resetVPU]);
  
  return (
    <Fragment>          
          <Container as="aside" aria-label="Selected feature" $isOpen={isopen}>
            <div>
                  {layout?.title && (
                    <ForecastHeader
                      title={layout.title}
                      subtitle={layout.subtitle}
                      onClick={onReset}
                    />
                  )}
            </div>
            
            <Content>
              <TimeSeriesCard />
              <VariablesMenu />
            </Content>

            <Content>
              <DataMenu />
            </Content>
          </Container>
    </Fragment>

  );
};

export default ForecastMenu;