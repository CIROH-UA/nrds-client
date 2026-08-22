import React, { Fragment, useMemo, useCallback } from 'react';
import DataMenu from '../forecast/dataMenu';
import VariablesMenu from '../forecast/variablesMenu';
import { Content, Container } from '../styles/Styles';
import TimeSeriesCard from '../forecast/TimeseriesCard';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { ForecastHeader } from '../forecast/ForecastHeader';
import { FeatureInformation } from '../forecast/FeatureInformation';
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
                      title ={layout.title}
                      onClick={onReset}
                    />
                  )}
            </div>
            
            <Content>
              <TimeSeriesCard />
              <DataMenu />
            </Content>
            <Content>
                {/* The time slider used to sit here. It drives the animation, so it moved onto
                    the map beside it; this block is the variables menu on its own now. */}
                <VariablesMenu />
            </Content>
            <Content>
              <FeatureInformation />
            </Content>            
          </Container>
    </Fragment>

  );
};

export default ForecastMenu;