import React, { useMemo, Fragment, useCallback, useEffect, useRef } from 'react';
import { Row, IconLabel } from '../styles/Styles';
import SelectComponent from '../SelectComponent';
import { getTimeseries, getVpuVariableFlat } from 'features/DataStream/lib/queryData';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useVPUStore } from 'features/DataStream/store/Layers';
import { useShallow } from 'zustand/react/shallow';
import { makeTitle } from 'features/DataStream/lib/utils';
import {
  VariableIcon,
} from 'features/DataStream/lib/layers';

function VariablesMenu() {
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  const { setVarData } = useVPUStore(
    useShallow((s) => ({
      setVarData: s.setVarData,
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
    if (!opt || !feature_id) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const id = feature_id.split('-')[1]; 

    try {
      const flat = await getVpuVariableFlat(cacheKey, opt.value);
      if (!isMountedRef.current || requestId !== requestIdRef.current) return;
      setVarData(opt.value, flat);

      set_variable(opt.value);
      const series = await getTimeseries(id, cacheKey, opt.value);
      if (!isMountedRef.current || requestId !== requestIdRef.current) return;

      const xy = series.map((d) => ({
        x: new Date(d.time),
        y: d[opt.value],
      }));
      set_series(xy);
      set_layout({
        yaxis: opt.value,
        xaxis: 'Time',
        title: makeTitle(forecast, feature_id),
      });
    } catch (err) {
      if (!isMountedRef.current || requestId !== requestIdRef.current) return;
      console.error('Failed to change variable', err);
    }
  }, [
    availableVariablesList,
    cacheKey,
    feature_id,
    forecast,
    setVarData,
    set_variable,
    set_series,
    set_layout,
  ]);

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
