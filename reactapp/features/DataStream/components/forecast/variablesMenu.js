import React, { useMemo, Fragment, useCallback, useRef } from 'react';
import { Row, IconLabel } from '../styles/Styles';
import SelectComponent from '../SelectComponent';
import { getVpuVariableFlat } from 'features/DataStream/lib/queryData';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { loadTimeseries } from 'features/DataStream/actions/loadTimeseries';
import useDataStreamStore from 'features/DataStream/store/Datastream';
import { useVPUStore } from 'features/DataStream/store/VPU';
import { useShallow } from 'zustand/react/shallow';
import { createSequence } from 'features/DataStream/lib/sequence';
import {
} from 'features/DataStream/lib/layers';

function VariablesMenu() {
  // No mounted flag: these writes all go to stores, so ordering alone is enough.
  const changes = useRef(createSequence()).current;

  const{ variables, cacheKey } = useDataStreamStore(
    useShallow((state) => ({
      variables: state.variables,
      cacheKey: state.cache_key,
    }))
  );
  
  const { variable, set_variable, feature_id } = useTimeSeriesStore(
    useShallow((state) => ({
      variable: state.variable,
      set_variable: state.set_variable,
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

  /**
   * Load a variable's map values and its chart series together.
   *
   * allSettled rather than all: with all, a rejected flat load reported the failure while the
   * series load was still in flight, and that load's success then wrote loadingText back to an
   * empty string and erased the message. Waiting for both means the complaint is written last.
   */
  const handleChangeVariable = useCallback(async (evt) => {
    const opt = evt || availableVariablesList?.[0];
    if (!opt || !feature_id) return;

    const ticket = changes.next();
    const requestCacheKey = cacheKey;

    try {
      // Reusing the vpu store's cached array skips a query measured at about 800 ms.
      const cached = useVPUStore.getState().getVarData(opt.value);

      // Both start together; the variable is set last so the layer never reads absent values.
      const [flatResult] = await Promise.allSettled([
        cached ?? getVpuVariableFlat(requestCacheKey, opt.value),
        loadTimeseries({ variable: opt.value }),
      ]);
      if (!changes.isCurrent(ticket)) return;
      // The vpu moved on, so these values describe a table that is no longer loaded.
      if (useDataStreamStore.getState().cache_key !== requestCacheKey) return;

      if (flatResult.status === 'rejected') {
        // Say so: the chart has already changed, and silence hid the disagreement.
        useTimeSeriesStore.setState({
          loadingText: `Failed to load ${opt.value} for the map`,
          last_error: { kind: 'variable', variable: opt.value },
        });
        console.error('Failed to change variable', flatResult.reason);
        return;
      }

      setVarData(opt.value, flatResult.value);
      set_variable(opt.value);
    } catch (err) {
      if (!changes.isCurrent(ticket)) return;
      useTimeSeriesStore.setState({
        loadingText: `Failed to load ${opt.value} for the map`,
        last_error: { kind: 'variable', variable: opt.value },
      });
      console.error('Failed to change variable', err);
    }
  }, [
    availableVariablesList,
    cacheKey,
    feature_id,
    setVarData,
    set_variable,
    changes,
  ]);

  return (
    <Fragment>
         { availableVariablesList.length > 0 && (
          <Row>
            <IconLabel as="label" htmlFor="select-variable">Variable</IconLabel>
            <SelectComponent
              inputId="select-variable"
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
