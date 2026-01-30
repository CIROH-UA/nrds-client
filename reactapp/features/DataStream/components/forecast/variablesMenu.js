import React, { useMemo, Fragment, useCallback } from 'react';
import { Row, IconLabel } from '../styles/Styles';
import SelectComponent from '../SelectComponent';
import { getTimeseries} from 'features/DataStream/lib/queryData';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useShallow } from 'zustand/react/shallow';
import { makeTitle } from 'features/DataStream/lib/utils';
import {
  VariableIcon,
} from 'features/DataStream/lib/layers';

function VariablesMenu() {

  const{ forecast, variables, cacheKey } = useDataStreamStore(
    useShallow((state) => ({
      forecast: state.forecast,
      variables: state.variables,
      cacheKey: state.cache_key,
    }))
  );
  
  const { variable, set_variable, set_series, set_layout, feature_id } = useTimeSeriesStore(
    useShallow((state) => ({
      variable: state.variable,
      set_variable: state.set_variable,
      set_series: state.set_series,
      set_layout: state.set_layout,
      feature_id: state.feature_id,
    }))
  );

  const availableVariablesList = useMemo(() => {
    return variables.map((v) => ({ value: v, label: v }));
  }, [variables]);

  const selectedVariableOption = useMemo(() => {
    const opts = availableVariablesList || [];
    return opts.find((opt) => opt.value === variable) ?? null;
  }
  , [variables, variable]);

  const handleChangeVariable = useCallback(async (evt) => {
    const opt = evt || availableVariablesList?.[0];
    if (opt) set_variable(opt.value);
    console.log(opt.value);
    const id = feature_id.split('-')[1]; 
    const series = await getTimeseries(id, cacheKey, opt.value);
    const xy = series.map((d) => ({
      x: new Date(d.time),
      y: d[opt.value],
      }));
    set_series(xy);
    set_layout({
      'yaxis': opt.value,
      'xaxis': "Time",
      'title': makeTitle(forecast, feature_id),
    });
  }, [availableVariablesList]);

  return (
    <Fragment>
         { availableVariablesList.length > 0 && (
          <Row>
            <IconLabel> <VariableIcon /> Variable</IconLabel>
            <SelectComponent
              optionsList={availableVariablesList}
              value={selectedVariableOption}
              onChangeHandler={handleChangeVariable}
            />
          </Row>
        )}
    </Fragment>
  );
}


export default React.memo(VariablesMenu);