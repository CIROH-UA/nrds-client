import React, { Fragment, useMemo, useCallback } from 'react';
import DataMenu from '../forecast/dataMenu';
import VariablesMenu from '../forecast/variablesMenu';
import { Content, Container } from '../styles/Styles';
import TimeSeriesCard from '../forecast/TimeseriesCard';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useVPUStore, useFeatureStore } from 'features/DataStream/store/Layers';
import { ForecastHeader } from '../forecast/ForecastHeader';
import { FeatureInformation } from '../forecast/FeatureInformation';
import { TimeSlider } from '../forecast/TimeSlider';
import { useShallow } from 'zustand/react/shallow';

const ForecastMenu = () => {
  const { layout, reset } = useTimeSeriesStore(
    useShallow((state) => ({
      feature_id: state.feature_id,
      layout: state.layout,
      reset: state.reset,
    }))
  );
  const { feature_id } = useFeatureStore(
    useShallow((state) => ({
      feature_id: state.selected_feature ? state.selected_feature._id : null,
    }))
  );
  
  const { resetVPU } = useVPUStore(
    useShallow((state) => ({
      resetVPU: state.resetVPU,
    }))
  );

  const isopen = useMemo(() => {
      return feature_id != null;
  }, [feature_id]);

  const onReset = useCallback(() => {
    reset();
    resetVPU();
  }, [reset, resetVPU]);
  
  return (
    <Fragment>          
          <Container $isOpen={isopen}>
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
                <VariablesMenu />
                <TimeSlider />
            </Content>
            <Content>
              <FeatureInformation />
            </Content>            
          </Container>
    </Fragment>

  );
};

export default ForecastMenu;