import React, { Fragment, useMemo } from 'react';
import DataMenu from '../forecast/dataMenu';
import { Content, Container } from '../styles/Styles';
import TimeSeriesCard from '../forecast/TimeseriesCard';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { ForecastHeader } from '../forecast/ForecastHeader';
import { FeatureInformation } from '../forecast/FeatureInformation';
import { TimeSlider } from '../forecast/TimeSlider';
const ForecastMenu = () => {

  const series = useTimeSeriesStore((state) => state.series);
  const layout = useTimeSeriesStore((state) => state.layout);
  const reset_ts_store = useTimeSeriesStore((state) => state.reset);
  const feature_id = useTimeSeriesStore((state) => state.feature_id);
  // const isopen = useMemo(() => {
  //   return series.length > 0;
  //  }, [series]);
const isopen = useMemo(() => {
    console.log('feature_id in ForecastMenu:', feature_id);
    return feature_id != null;
}, [feature_id]);

  return (
    <Fragment>          
          <Container $isOpen={isopen}>
            <div>
                  {layout?.title && (
                    <ForecastHeader
                      title ={layout.title}
                      onClick={()=> {reset_ts_store()}} 
                    />
                  )}
            </div>
            
            <Content>
              <TimeSeriesCard />
              <DataMenu />
            </Content>
            <Content>
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