/**
 * The variable picker for the anchored feature popup (migration unit U5a), the vanilla replacement
 * for the React VariablesMenu. `createVariablePicker(container, store)` mounts a compact shared
 * select above the popup's chart listing the run's variables (datastream.variables), and returns a
 * teardown that unsubscribes, destroys the select, and removes its DOM.
 *
 * Changing the variable loads two things at once, the way VariablesMenu did: the variable's flat
 * map values for the flowpath colouring (getVpuVariableFlat -> setVarData, reusing a cached array
 * when the VPU already holds it) and the feature's chart series (loadTimeseries). The colouring
 * driver recolours whenever the variable or its values change, and the chart redraws on the new
 * series, so one change recolours the map and reloads the chart. A local sequence discards a change
 * that a newer one has overtaken, and a change whose cache key has moved on is dropped, so stale
 * values never land.
 */
import { getVpuVariableFlat } from '../../lib/queryData.js';
import { createSequence } from '../../lib/sequence.js';
import { loadTimeseries } from '../../actions/loadTimeseries.js';
import { actions } from '../../store/app-store.js';
import { createSelect } from '../select.js';

/** Shape the run's variable names into the select's `{ value, label }` options. */
export function variablesToOptions(variables) {
  return Array.isArray(variables) ? variables.map((v) => ({ value: v, label: v })) : [];
}

/** Mount the variable picker into `container`, wired to `store`; returns a teardown. */
export function createVariablePicker(container, store) {
  const changes = createSequence();

  const row = document.createElement('div');
  row.className = 'nrds-variable-picker';

  const label = document.createElement('label');
  label.className = 'nrds-variable-picker__label';
  label.textContent = 'Variable';

  const selectHost = document.createElement('div');
  selectHost.className = 'nrds-variable-picker__select';

  row.append(label, selectHost);
  container.append(row);

  /** Load a variable's map values and chart series together (latest change wins). */
  const handleChange = async (opt) => {
    const feature_id = store.get().timeseries.feature_id;
    if (!opt || !feature_id) return;

    const ticket = changes.next();
    const requestCacheKey = store.get().datastream.cache_key;

    try {
      const cached = actions.getVarData(opt.value);
      const [flatResult] = await Promise.allSettled([
        cached ?? getVpuVariableFlat(requestCacheKey, opt.value),
        loadTimeseries({ variable: opt.value }),
      ]);
      if (!changes.isCurrent(ticket)) return;
      if (store.get().datastream.cache_key !== requestCacheKey) return;

      if (flatResult.status === 'rejected') {
        store.set({
          timeseries: {
            ...store.get().timeseries,
            loadingText: `Failed to load ${opt.value} for the map`,
            last_error: { kind: 'variable', variable: opt.value },
          },
        });
        console.error('Failed to change variable', flatResult.reason);
        return;
      }

      actions.setVarData(opt.value, flatResult.value);
      actions.set_variable(opt.value);
    } catch (err) {
      if (!changes.isCurrent(ticket)) return;
      store.set({
        timeseries: {
          ...store.get().timeseries,
          loadingText: `Failed to load ${opt.value} for the map`,
          last_error: { kind: 'variable', variable: opt.value },
        },
      });
      console.error('Failed to change variable', err);
    }
  };

  const select = createSelect({
    container: selectHost,
    options: variablesToOptions(store.get().datastream.variables),
    value: store.get().timeseries.variable,
    compact: true,
    label: 'Variable',
    id: 'nrds-select-variable',
    onChange: handleChange,
  });

  let prevVariables = store.get().datastream.variables;
  let prevVariable = store.get().timeseries.variable;

  const render = () => {
    const variables = store.get().datastream.variables;
    const variable = store.get().timeseries.variable;

    if (variables !== prevVariables) {
      prevVariables = variables;
      select.setOptions(variablesToOptions(variables));
      // setOptions may drop a value that is gone; keep the select showing the current variable.
      select.setValue(variable);
    }
    if (variable !== prevVariable) {
      prevVariable = variable;
      select.setValue(variable);
    }

    row.hidden = !variables || variables.length === 0;
  };

  const unsubscribe = store.subscribe(() => render());
  render();

  return () => {
    unsubscribe();
    select.destroy();
    row.remove();
  };
}

export default createVariablePicker;
