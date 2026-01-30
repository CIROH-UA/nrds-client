import React, { Fragment, useMemo, useCallback } from 'react';
import DataMenu from '../forecast/dataMenu';
import VariablesMenu from '../forecast/variablesMenu';
import { Content, Container } from '../styles/Styles';
import TimeSeriesCard from '../forecast/TimeseriesCard';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { ForecastHeader } from '../forecast/ForecastHeader';
import { FeatureInformation } from '../forecast/FeatureInformation';
import { TimeSlider } from '../forecast/TimeSlider';
import { useShallow } from 'zustand/react/shallow';

const ForecastMenu = () => {
  const { feature_id, layout, reset } = useTimeSeriesStore(
    useShallow((state) => ({
      feature_id: state.feature_id,
      layout: state.layout,
      reset: state.reset,
    }))
  );

  const isopen = useMemo(() => {
      return feature_id != null;
  }, [feature_id]);

  const onReset = useCallback(() => reset(), [reset]);
  
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

ForecastMenu.whyDidYouRender = true;
export default ForecastMenu;