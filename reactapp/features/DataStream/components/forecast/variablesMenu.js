import React, { useMemo, Fragment } from 'react';
import { Row, IconLabel } from '../styles/Styles';
import SelectComponent from '../SelectComponent';
import { getTimeseries} from 'features/DataStream/lib/queryData';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { makeTitle } from 'features/DataStream/lib/utils';
import {
  VariableIcon,
} from 'features/DataStream/lib/layers';

export default function VariablesMenu() {
  const forecast = useDataStreamStore((state) => state.forecast);
  const variables = useDataStreamStore((state) => state.variables);
  const cacheKey = useDataStreamStore((state) => state.cache_key);
  const variable = useTimeSeriesStore((state) => state.variable);
  const set_series = useTimeSeriesStore((state) => state.set_series);
  const set_variable = useTimeSeriesStore((state) => state.set_variable);
  const set_layout = useTimeSeriesStore((state) => state.set_layout);
  const feature_id = useTimeSeriesStore((state) => state.feature_id);

  const handleChangeVariable = async (optionArray) => {
    const opt = optionArray?.[0];
    if (opt) set_variable(opt.value);
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

  };

  const availableVariablesList = useMemo(() => {
    return variables.map((v) => ({ value: v, label: v }));
  }, [variables]);

  const selectedVariableOption = useMemo(() => {
    const opts = availableVariablesList || [];
    return opts.find((opt) => opt.value === variable) ?? null;
  }
  , [variables, variable]);

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

