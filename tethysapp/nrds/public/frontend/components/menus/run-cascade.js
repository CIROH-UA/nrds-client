/**
 * The run-selection cascade for the build-less NRDS client (migration unit U5c), the vanilla
 * replacement for the React `DataMenuControls`. `createRunCascade(container, store)` mounts the
 * model -> date -> forecast -> cycle -> ensemble -> output-file dependent selects and the Update
 * button into the control menu's "Model run" slot, and returns a teardown that unsubscribes,
 * destroys the shared selects, and removes its DOM.
 *
 * Each level reads its options from the s3 slice and its current value from the datastream slice.
 * Changing a level sets that level, then refetches the dependent lower levels from S3 through the
 * ported s3Utils (getOptionsFromURL / readableDatesNewestFirst) against the same prefixes the React
 * dataMenu built, and writes them back to the s3 slice. Every fetch chain claims a selection number
 * from selectionGeneration and checks it back after each await, so a rapid change cancels the stale
 * cascade (latest-wins) rather than letting an older listing overwrite a newer one.
 *
 * The Update button builds the cache key and prefix for the current selection, writes them to the
 * store, and calls loadVpu to load the chosen run -- recolouring the map and, when a feature is
 * selected, reloading its chart. It is disabled while a cascade is in flight or when the selection
 * has no output file. The "No output file for this selection" notice shows only once a real
 * selection has resolved with no output files (a vpu is set, nothing is loading), matching the way
 * the React menu gates it: hidden on the initial and empty states.
 *
 * This view is pure reflection of the store plus the local `selecting` flag: a single subscription
 * keeps every select's options/value, the row visibility, the notice, and the Update button in step,
 * and every control calls a store action rather than holding state of its own.
 */
import { getOptionsFromURL, readableDatesNewestFirst, makePrefix } from '../../lib/s3Utils.js';
import { getCacheKey } from '../../lib/utils.js';
import { actions } from '../../store/app-store.js';
import { loadVpu } from '../../actions/loadVpu.js';
import { beginSelection, isCurrentSelection } from '../../actions/selectionGeneration.js';
import { abandonSelectionWithNoOutput } from '../../actions/initDataStream.js';
import { createSelect } from '../select.js';

/** The forecast that fans out into an ensemble level; every other forecast has none. */
export const hasEnsembles = (forecast) => forecast === 'medium_range';

/** The S3 prefixes each level's option listing is read from, matching the React dataMenu chain. */
export const forecastListPrefix = (model, date) => `outputs/${model}/v2.2_hydrofabric/${date}/`;

export const cycleListPrefix = (model, date, forecast) =>
  `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/`;

export const ensembleListPrefix = (model, date, forecast, cycle) =>
  `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${cycle}/`;

export const outputFileListPrefix = (model, date, forecast, cycle, ensemble, vpu) => {
  const ensemblePath = ensemble ? `${ensemble}/` : '';
  return `outputs/${model}/v2.2_hydrofabric/${date}/${forecast}/${cycle}/${ensemblePath}${vpu}/ngen-run/outputs/troute/`;
};

/** The option to show for a level: the one matching the value, else the first, else null. */
export function selectedOption(options, value) {
  if (!Array.isArray(options) || options.length === 0) return null;
  return options.find((opt) => opt.value === value) ?? options[0] ?? null;
}

/**
 * Whether the "No output file for this selection" notice should show. It appears only once a real
 * selection has resolved (a vpu is set) with no output files and nothing is in flight, so it stays
 * hidden on the initial and empty states -- the same gate the React menu uses.
 */
export function shouldShowNoOutputNotice({ vpu, selecting, outputFilesLength }) {
  return Boolean(vpu) && !selecting && (outputFilesLength ?? 0) === 0;
}

/** The cache key and prefix for a datastream selection, in the order both builders expect. */
export function buildRunKeys(datastream) {
  const { model, date, forecast, cycle, ensemble, vpu, outputFile } = datastream;
  const args = [model, date, forecast, cycle, ensemble, vpu, outputFile];
  return { cacheKey: getCacheKey(...args), prefix: makePrefix(...args) };
}

/** The six levels, top to bottom: the s3 slice their options come from, the datastream field held. */
const LEVELS = [
  { key: 'model', label: 'Model', slice: 'models', field: 'model' },
  { key: 'date', label: 'Date', slice: 'dates', field: 'date' },
  { key: 'forecast', label: 'Forecast', slice: 'forecasts', field: 'forecast' },
  { key: 'cycle', label: 'Cycle', slice: 'cycles', field: 'cycle' },
  { key: 'ensemble', label: 'Ensembles', slice: 'ensembles', field: 'ensemble' },
  { key: 'outputFile', label: 'Output File', slice: 'outputFiles', field: 'outputFile' },
];

const FILE_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
  '<path d="M14 3v5h5"/></svg>';

/** Mount the run cascade into `container`, wired to `store`; returns a teardown. */
export function createRunCascade(container, store) {
  let chains = 0;
  let selecting = false;

  /** Merge a patch into the timeseries slice without a dedicated action for each field. */
  const patchTimeseries = (patch) => {
    const s = store.get().timeseries;
    store.set({ timeseries: { ...s, ...patch } });
  };

  /** Run one selection chain: claim it, show the controls as working, hand it its number. */
  const runSelection = async (chain) => {
    const selection = beginSelection();
    chains += 1;
    selecting = true;
    render();
    try {
      await chain(selection);
    } finally {
      chains -= 1;
      if (chains === 0) selecting = false;
      render();
    }
  };

  /** Apply an output-file listing, and give up on the selection when it is empty. */
  const applyOutputFiles = (options) => {
    actions.set_outputFiles(options);
    actions.set_outputFile(options[0]?.value ?? '');
    if (options.length) return;
    abandonSelectionWithNoOutput();
  };

  /** Fetch the output-file listing for a resolved selection and apply it. */
  const resolveOutputFiles = async (selection, { model, date, forecast, cycle, ensemble }) => {
    const vpu = store.get().datastream.vpu;
    const options = await getOptionsFromURL(
      outputFileListPrefix(model, date, forecast, cycle, ensemble, vpu)
    );
    if (!isCurrentSelection(selection)) return;
    applyOutputFiles(options);
  };

  /** Resolve the ensemble level (only medium_range has one), then the output files below it. */
  const resolveEnsembleDown = async (selection, { model, date, forecast, cycle }) => {
    if (hasEnsembles(forecast)) {
      const options = await getOptionsFromURL(ensembleListPrefix(model, date, forecast, cycle));
      if (!isCurrentSelection(selection)) return;
      actions.set_ensembles(options);
      const nextEnsemble = options[0]?.value ?? '';
      actions.set_ensemble(nextEnsemble);
      await resolveOutputFiles(selection, { model, date, forecast, cycle, ensemble: nextEnsemble });
      return;
    }
    actions.set_ensembles([]);
    actions.set_ensemble('');
    await resolveOutputFiles(selection, { model, date, forecast, cycle, ensemble: '' });
  };

  /** Resolve the cycle level, then everything below it. */
  const resolveCycleDown = async (selection, { model, date, forecast }) => {
    const options = await getOptionsFromURL(cycleListPrefix(model, date, forecast));
    if (!isCurrentSelection(selection)) return;
    actions.set_cycles(options);
    const nextCycle = options[0]?.value ?? '';
    actions.set_cycle(nextCycle);
    await resolveEnsembleDown(selection, { model, date, forecast, cycle: nextCycle });
  };

  /** Resolve the forecast level, then everything below it. */
  const resolveForecastDown = async (selection, { model, date }) => {
    const options = await getOptionsFromURL(forecastListPrefix(model, date));
    if (!isCurrentSelection(selection)) return;
    actions.set_forecasts(options);
    const nextForecast = options[0]?.value ?? '';
    actions.set_forecast(nextForecast);
    await resolveCycleDown(selection, { model, date, forecast: nextForecast });
  };

  const onChangeModel = (opt) => {
    if (!opt) return;
    actions.set_model(opt.value);
    runSelection(async (selection) => {
      const datesOptions = await readableDatesNewestFirst(opt.value);
      if (!isCurrentSelection(selection)) return;
      const nextDate = datesOptions[0]?.value ?? '';
      actions.set_dates(datesOptions);
      actions.set_date(nextDate);
      await resolveForecastDown(selection, { model: opt.value, date: nextDate });
    });
  };

  const onChangeDate = (opt) => {
    if (!opt) return;
    actions.set_date(opt.value);
    const { model } = store.get().datastream;
    runSelection((selection) => resolveForecastDown(selection, { model, date: opt.value }));
  };

  const onChangeForecast = (opt) => {
    if (!opt) return;
    actions.set_forecast(opt.value);
    const { model, date } = store.get().datastream;
    runSelection((selection) => resolveCycleDown(selection, { model, date, forecast: opt.value }));
  };

  const onChangeCycle = (opt) => {
    if (!opt) return;
    actions.set_cycle(opt.value);
    const { model, date, forecast } = store.get().datastream;
    runSelection((selection) =>
      resolveEnsembleDown(selection, { model, date, forecast, cycle: opt.value })
    );
  };

  const onChangeEnsemble = (opt) => {
    if (!opt) return;
    actions.set_ensemble(opt.value);
    const { model, date, forecast, cycle } = store.get().datastream;
    runSelection((selection) =>
      resolveOutputFiles(selection, { model, date, forecast, cycle, ensemble: opt.value })
    );
  };

  const onChangeOutputFile = (opt) => {
    if (!opt) return;
    actions.set_outputFile(opt.value);
    render();
  };

  const CHANGE_HANDLERS = {
    model: onChangeModel,
    date: onChangeDate,
    forecast: onChangeForecast,
    cycle: onChangeCycle,
    ensemble: onChangeEnsemble,
    outputFile: onChangeOutputFile,
  };

  /** Load the chosen run: match the React handleVisulization guards, then call loadVpu. */
  const onUpdate = async () => {
    const ds = store.get().datastream;
    const selectedFeatureId = store.get().feature.selected_feature?._id ?? null;

    actions.set_loading_text('');
    if (!selectedFeatureId || !ds.vpu) {
      patchTimeseries({
        loadingText: 'Select a feature on the map first',
        last_error: { kind: 'no-selection' },
      });
      return;
    }
    if (!ds.outputFile) {
      patchTimeseries({
        loadingText: 'This model run has no output file to read',
        last_error: { kind: 'no-output-file' },
      });
      return;
    }
    if (store.get().timeseries.loading) {
      actions.set_loading_text('Data is already loading, please wait');
      return;
    }

    const { cacheKey, prefix } = buildRunKeys(ds);
    actions.set_cache_key(cacheKey);
    actions.set_prefix(prefix);

    await loadVpu();
  };

  const heading = document.createElement('h3');
  heading.className = 'nrds-control-menu__heading';
  heading.textContent = 'Change the run';
  container.append(heading);

  const controllers = LEVELS.map((level) => {
    const row = document.createElement('div');
    row.className = 'nrds-control-menu__row nrds-run-cascade__row';

    const label = document.createElement('span');
    label.className = 'nrds-control-menu__label nrds-run-cascade__label';
    label.id = `nrds-run-${level.key}-label`;
    label.textContent = level.label;

    const host = document.createElement('div');
    host.className = 'nrds-run-cascade__select';

    row.append(label, host);
    container.append(row);

    const select = createSelect({
      container: host,
      options: store.get().s3[level.slice],
      value: store.get().datastream[level.field],
      compact: true,
      id: `nrds-run-${level.key}`,
      label: level.label,
      onChange: (opt) => CHANGE_HANDLERS[level.key](opt),
    });

    return { ...level, row, select };
  });

  const notice = document.createElement('p');
  notice.className = 'nrds-run-cascade__notice';
  notice.setAttribute('role', 'alert');
  notice.hidden = true;
  const noticeIcon = document.createElement('span');
  noticeIcon.className = 'nrds-run-cascade__notice-icon';
  noticeIcon.innerHTML = FILE_ICON_SVG;
  const noticeText = document.createElement('span');
  noticeText.textContent = 'No output file for this selection';
  notice.append(noticeIcon, noticeText);
  container.append(notice);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'nrds-run-cascade__actions';
  const updateBtn = document.createElement('button');
  updateBtn.type = 'button';
  updateBtn.className = 'nrds-run-cascade__update';
  updateBtn.textContent = 'Update';
  updateBtn.addEventListener('click', onUpdate);
  actionsRow.append(updateBtn);
  container.append(actionsRow);

  function render() {
    const s = store.get();

    for (const controller of controllers) {
      const options = s.s3[controller.slice] || [];
      controller.select.setOptions(options);
      const chosen = selectedOption(options, s.datastream[controller.field]);
      controller.select.setValue(chosen ? chosen.value : null);
      controller.select.setDisabled(selecting && controller.key !== 'model');
      controller.row.hidden = options.length === 0;
    }

    notice.hidden = !shouldShowNoOutputNotice({
      vpu: s.datastream.vpu,
      selecting,
      outputFilesLength: (s.s3.outputFiles || []).length,
    });

    const noOutput = !s.datastream.outputFile;
    updateBtn.disabled = selecting || noOutput;
    updateBtn.title = selecting
      ? 'Still reading this selection'
      : noOutput
        ? 'No output file to load'
        : 'Load this selection';
  }

  const unsubscribe = store.subscribe(() => render());
  render();

  return () => {
    unsubscribe();
    updateBtn.removeEventListener('click', onUpdate);
    for (const controller of controllers) controller.select.destroy();
    heading.remove();
    for (const controller of controllers) controller.row.remove();
    notice.remove();
    actionsRow.remove();
  };
}

export default createRunCascade;
