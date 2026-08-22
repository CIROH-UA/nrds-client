/**
 * The child directory names directly under a prefix, and the full prefixes they came from.
 *
 * Empty names are dropped. S3 answers some prefixes with a doubled slash, for instance
 * "outputs/routing_only/v2.2_hydrofabric/ngen.20251205//", which is an object filed under a
 * directory with no name. That became an option labelled "" which sorted ahead of the real
 * ones and was selected by default, so the Forecast control rendered blank, and every URL
 * built from it carried the doubled slash down to an empty output-file listing and a panel
 * reading "No Outputs Available".
 */
export async function listPublicS3Directories(prefix = "v2.2/", { signal } = {}) {
  const bucket = "ciroh-community-ngen-datastream";

  // Ensure trailing slash
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

  // S3 ListObjectsV2 with delimiter to get "folders"
  const url =
    `https://${bucket}.s3.us-east-1.amazonaws.com/` +
    `?list-type=2&prefix=${encodeURIComponent(normalizedPrefix)}` +
    `&delimiter=/`;

  const resp = await fetch(url, { signal });
  if (!resp.ok) {
    throw new Error(`S3 list error: ${resp.status} ${resp.statusText}`);
  }

  const xml = await resp.text();

  // Parse XML and extract CommonPrefixes/Prefix
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  const prefixNodes = [...doc.getElementsByTagName("CommonPrefixes")];

  // Full prefixes from S3, e.g. "v2.2/ngen.20251121/short_range/"
  const fullPrefixes = prefixNodes
    .map((node) => node.getElementsByTagName("Prefix")[0]?.textContent)
    .filter(Boolean);

  // Empty names are dropped; see the note above.
  const childNames = fullPrefixes
    .map((p) =>
      p
        .slice(normalizedPrefix.length) // remove base prefix
        .replace(/\/$/, "")            // trim trailing slash
    )
    .filter((name) => name !== "");

  return { fullPrefixes, childNames };
}

async function listPublicS3Files(prefix = "v2.2/", { signal } = {}) {
    const bucket = "ciroh-community-ngen-datastream";
    const url =
        `https://${bucket}.s3.us-east-1.amazonaws.com` +
        `/?list-type=2&prefix=${encodeURIComponent(prefix)}`;


    const resp = await fetch(url,{ signal });
    if (!resp.ok) {
        throw new Error(`S3 list error: ${resp.status} ${resp.statusText}`);
    }
    const xml = await resp.text();

    // parse XML -> extract <Key> elements
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    const contents = [...doc.getElementsByTagName("Contents")];
    return contents.map(node => node.getElementsByTagName("Key")[0].textContent);
}

const byValue = (a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0);

export async function getOptionsFromURL(url, { signal } = {}) {
  try{
    if (url.split('/').includes('troute')){
      const files = await listPublicS3Files(url, { signal });
      // Parquet only, which is the one place a NetCDF output can be kept out of the interface.
      // The pipeline moved to parquet around March 2026 and every model has published it since;
      // what is left under .nc is archived runs from before that, which duckdb cannot read. They
      // are filtered here rather than refused later, so nothing offers a choice that cannot work.
      // A selection whose directory holds only .nc lists nothing, which is the existing
      // "no output file" state rather than a new one.
      const readable = files.filter((f) => f.endsWith('.parquet'));
      const options = readable.map((d) => ({ value: d.split('/').pop(), label: d.split('/').pop() }));
      // byValue, because Array.sort() on objects compares "[object Object]" and orders nothing.
      return options.sort(byValue).reverse();
    }
    const { childNames } = await listPublicS3Directories(url, { signal });
    const options = childNames.map((d) => ({ value: d, label: d }));
    return options.sort(byValue);
  }catch(error){
    return [];
  }

}

/**
 * Hold an answer for the life of the page, unless it is the kind of answer that is more likely
 * a bad moment than a fact.
 *
 * The three things this wraps -- a model's runs, whether one run has parquet, and a model's
 * readable dates -- are all lookups of a bucket that does not change under a reader in the
 * course of a session, and all cost a paged S3 request or several. They were being asked more
 * than once: deciding which models to offer reads the newest run of each, and then building the
 * chosen model's date list read the same listing and probed the same date over again.
 *
 * The promise is stored rather than the value, so two callers asking at once share one round
 * trip. Failures and non-answers are dropped, because remembering one would make a single bad
 * moment last the rest of the session; a reload picks up whatever has been published since.
 */
const held = (store, key, compute, worthKeeping) => {
  const already = store.get(key);
  if (already) return already;

  const pending = compute();
  store.set(key, pending);
  pending.then(
    (value) => { if (!worthKeeping(value)) store.delete(key); },
    () => store.delete(key)
  );
  return pending;
};

const runsByModel = new Map();
const parquetByRun = new Map();
const datesByModel = new Map();

/**
 * Whether a dated run published an output this app can read.
 *
 * Pages the whole date prefix looking for the first key under an outputs/troute directory, and
 * answers on what it finds there. Deliberately makes no assumption about the path in between:
 * the layout is not uniform -- some runs carry an ensemble level between cycle and vpu, some
 * carry benchmark vpus with no routing output -- and every shape a fixed descent fails to
 * anticipate would come back as a confident "no parquet" for a date it never actually looked at.
 *
 * Almost every date answers on the first page. The cap exists for the few older runs whose
 * troute keys sort past several thousand other keys; hitting it returns null, because giving up
 * is not the same as looking and finding nothing.
 *
 * A run with no routing output at all answers false, which is the same as one holding only
 * NetCDF: there is nothing for this app to show either way.
 */
const PROBE_PAGE_LIMIT = 6;

function dateHasParquet(model, date, { signal } = {}) {
  // Not a definite yes or no is not an answer, so it is not worth keeping.
  return held(parquetByRun, `${model}/${date}`, () => probeForParquet(model, date, { signal }),
    (answer) => answer !== null);
}

async function probeForParquet(model, date, { signal } = {}) {
  const bucket = "ciroh-community-ngen-datastream";
  const prefix = `outputs/${model}/v2.2_hydrofabric/${date}/`;
  let token = null;

  try {
    for (let page = 0; page < PROBE_PAGE_LIMIT; page += 1) {
      let url =
        `https://${bucket}.s3.us-east-1.amazonaws.com/` +
        `?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`;
      if (token) url += `&continuation-token=${encodeURIComponent(token)}`;

      const resp = await fetch(url, { signal });
      if (!resp.ok) return null;
      const doc = new DOMParser().parseFromString(await resp.text(), "application/xml");
      const keys = [...doc.getElementsByTagName("Contents")]
        .map((node) => node.getElementsByTagName("Key")[0]?.textContent ?? "");

      const troute = keys.filter((k) => k.includes("/outputs/troute/"));
      if (troute.length) return troute.some((k) => k.endsWith(".parquet"));

      const truncated =
        doc.getElementsByTagName("IsTruncated")[0]?.textContent === "true";
      if (!truncated) return false;
      token = doc.getElementsByTagName("NextContinuationToken")[0]?.textContent;
      if (!token) return false;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * A model's dated runs, newest first.
 *
 * Filtered to ngen.YYYYMMDD before anything else, because a model's directory can hold children
 * that are not runs at all -- routing_only carries test and retro-test -- and those sort after
 * every real date, which is exactly where the newest run is looked for. Unfiltered, the newest
 * run of routing_only is `test`, it holds no parquet, and the model is dropped from the control
 * on the strength of a directory nobody meant to publish.
 *
 * Reversed rather than sorted descending: S3 answers in lexicographic order, which for this
 * name shape is oldest first. filter returns a new array, so reversing it mutates nothing shared.
 */
const DATED_RUN = /^ngen\.\d{8}$/;

const datedRunsNewestFirst = (model, { signal } = {}) =>
  held(runsByModel, model, async () => {
    const listed = await getOptionsFromURL(`outputs/${model}/v2.2_hydrofabric/`, { signal });
    return listed.filter((d) => DATED_RUN.test(d.value)).reverse();
  }, (runs) => runs.length);

/**
 * The models worth offering: the ones with at least one run this app can read.
 *
 * A model switched output format once and never switched back, so an old model whose recent runs
 * are all unreadable has nothing readable anywhere -- that is lstm, which stopped publishing
 * before the pipeline moved to parquet. Leaving it in the control offers a whole branch of the
 * interface that dead-ends on an empty date list.
 *
 * Several recent runs rather than only the newest, because publishing is not atomic. A model's
 * ngen.<today> prefix appears in S3 as soon as its first key lands and its troute output arrives
 * later, so for part of every day the newest run of a perfectly healthy model reads as
 * unreadable. Judging on that one run alone would drop the model from the control each morning
 * and restore it each afternoon. One failed run at the troute step would do the same until the
 * next day. Looking a few runs back costs nothing for the models that are kept -- their first
 * probe answers -- and only the ones on their way out pay the extra two.
 *
 * A model that never published a dated run goes too. Unsure keeps it, on the same reasoning as
 * the dates: a model that turns out empty costs a click, one wrongly hidden is silent. If that
 * left nothing at all the list is returned untouched, since an empty model control is worse than
 * an imperfect one.
 */
const RECENT_RUNS_CHECKED = 3;

async function modelsWithReadableOutputs(models, { signal } = {}) {
  const checked = await Promise.all(
    models.map(async (model) => {
      const runs = await datedRunsNewestFirst(model.value, { signal });
      if (runs.length === 0) return null;
      for (const run of runs.slice(0, RECENT_RUNS_CHECKED)) {
        // Anything but a definite no keeps the model, so an unanswerable probe stops the search.
        if (await dateHasParquet(model.value, run.value, { signal }) !== false) return model;
      }
      return null;
    })
  );
  const kept = checked.filter(Boolean);
  return kept.length ? kept : models;
}

/**
 * The dates worth offering: the ones whose outputs this app can actually read.
 *
 * The pipeline moved from NetCDF to parquet once, per model, and never moved back -- checked
 * across the full range of cfe_nom, which steps cleanly from one format to the other with no
 * islands either side. So the answer is a boundary rather than a per-date fact, and a binary
 * search finds it in about nine probes instead of one per date, which for cfe_nom would be 386.
 *
 * Given newest-first input the shape is TTTT...FFFF and this returns the leading run of T. Every
 * way of being unsure returns the list untouched: an inconclusive probe at either end, or a
 * boundary that stops holding partway through. Offering a date that turns out empty costs one
 * click and lands in the existing no-output state; hiding one that would have worked is silent,
 * so the doubt is spent in that direction.
 *
 * A model with nothing readable at either end is the exception, and returns nothing. That is a
 * model like lstm, which stopped publishing before the format changed: every one of its dates
 * would open onto an empty output list, and inviting that click helps nobody.
 */
async function datesWithReadableOutputs(model, dates, { signal } = {}) {
  if (dates.length === 0) return dates;

  const has = (i) => dateHasParquet(model, dates[i].value, { signal });

  const newest = await has(0);
  if (newest === null) return dates;

  const oldest = await has(dates.length - 1);
  if (oldest === null) return dates;
  if (oldest === true) return dates;
  if (newest === false) return [];

  // Invariant: lo is readable, hi is not; the boundary lies between them.
  let lo = 0;
  let hi = dates.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const answer = await has(mid);
    if (answer === null) return dates;
    if (answer) lo = mid; else hi = mid;
  }
  return dates.slice(0, hi);
}

/**
 * The dates to offer for a model: its dated runs, newest first, minus the ones with nothing
 * readable in them.
 *
 * Exported because the date list is built twice -- once for the model chosen at load, and again
 * every time the model control changes -- and a rule applied to only one of those shows up as
 * the list changing shape when the user does nothing but switch models. That is what happened
 * to the ordering and the readability filter, so both now live behind this one call.
 */
export function readableDatesNewestFirst(model, { signal } = {}) {
  return held(datesByModel, model, async () => {
    const runs = await datedRunsNewestFirst(model, { signal });
    return datesWithReadableOutputs(model, runs, { signal });
  }, (dates) => dates.length);
}

export const makePrefix = (model, avail_date,ngen_forecast,ngen_cycle, ngen_ensemble, ngen_vpu, outputFile) => {
    let prefix_path = `outputs/${model}/v2.2_hydrofabric/${avail_date}/${ngen_forecast}/${ngen_cycle}`
    let ensemble_path = ngen_ensemble ? `${ngen_ensemble}/` : '';
    prefix_path = `${prefix_path}/${ensemble_path}${ngen_vpu}/ngen-run/outputs/troute/${outputFile}`;
    return prefix_path;
}

const DATASTREAM_BUCKET = 'https://ciroh-community-ngen-datastream.s3.us-east-1.amazonaws.com';

/** The https url for an output key, which is what the browser fetches directly. */
export const makeOutputUrl = (prefix) =>
  /^https?:\/\//i.test(prefix) ? prefix : `${DATASTREAM_BUCKET}/${prefix}`;

// Only the outputFiles listing depends on the vpu, but the effect calling initialS3Data
// re-runs whenever the vpu changes, so all five listings were refetched every time. This
// holds the four vpu-independent ones for the life of the page, making a vpu change cost one
// request instead of five. Cached only when the chain completed, so an empty or failed
// listing is retried rather than remembered. A reload picks up newly published dates.
let cachedBaseOptions = null;

const loadBaseOptions = async ({ signal }) => {
  const _models = await getOptionsFromURL(`outputs`, { signal });
  if (_models.length === 0){
    return {models: [], dates: [], forecasts: [], cycles: []};
  }
  // Only the models with something readable in them. Without this a model that stopped
  // publishing before the format changed stays in the control and dead-ends on an empty date
  // list, which reads as a broken app rather than as an archived model.
  const models = await modelsWithReadableOutputs(
    _models.filter((m) => m.value !== 'test'), { signal }
  );
  if (models.length === 0){
    return {models: [], dates: [], forecasts: [], cycles: []};
  }
  // Shared with the model-change path so both build an identically shaped list.
  const dates = await readableDatesNewestFirst(models[0]?.value, { signal });
  if (dates.length === 0){
    return {models, dates: [], forecasts: [], cycles: []};
  }
  // Falling back to dates[0], because the readability filter can return a single date -- the day
  // a model crossed from NetCDF to parquet is exactly that -- and dates[1] would then put the
  // string "undefined" in the URL and empty every control below this one.
  const defaultDate = (dates[1] ?? dates[0])?.value;
  const forecasts = (await getOptionsFromURL(`outputs/${models[0]?.value}/v2.2_hydrofabric/${defaultDate}/`, { signal })).reverse();
  if (forecasts.length === 0){
    return {models, dates, forecasts: [], cycles: []};
  }
  const cycles = await getOptionsFromURL(`outputs/${models[0]?.value}/v2.2_hydrofabric/${defaultDate}/${forecasts[0]?.value}/`, { signal });
  return {models, dates, forecasts, cycles};
}

export const initialS3Data = async(vpu, { signal } = {}) => {
  const base = cachedBaseOptions ?? await loadBaseOptions({ signal });
  const {models, dates, forecasts, cycles} = base;
  if (models.length === 0){
    return {models: [], dates: [], forecasts: [], cycles: [], ensembles: [], outputFiles: []};
  }
  if (dates.length === 0){
    return {models, dates: [], forecasts: [], cycles: [], ensembles:[], outputFiles: []};
  }
  if (forecasts.length === 0){
    return {models, dates, forecasts: [], cycles: [], ensembles:[], outputFiles: []};
  }
  if (cycles.length === 0){
    return {models, dates, forecasts, cycles: [], ensembles:[], outputFiles: []};
  }
  cachedBaseOptions = base;
  if (!vpu) {
    return {models, dates, forecasts, cycles, ensembles:[], outputFiles: []};
  }
  const outputFiles = await getOptionsFromURL(`outputs/${models[0]?.value}/v2.2_hydrofabric/${(dates[1] ?? dates[0])?.value}/${forecasts[0]?.value}/${cycles[0]?.value}/${vpu}/ngen-run/outputs/troute/`, { signal });
  return {models, dates, forecasts, cycles, ensembles:[], outputFiles};
}

