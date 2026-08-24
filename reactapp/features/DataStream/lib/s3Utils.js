/** The child directory names directly under a prefix, and the full prefixes they came from. */
export async function listPublicS3Directories(prefix = "v2.2/", { signal } = {}) {
  const bucket = "ciroh-community-ngen-datastream";

  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

  const url =
    `https://${bucket}.s3.us-east-1.amazonaws.com/` +
    `?list-type=2&prefix=${encodeURIComponent(normalizedPrefix)}` +
    `&delimiter=/`;

  const resp = await fetch(url, { signal });
  if (!resp.ok) {
    throw new Error(`S3 list error: ${resp.status} ${resp.statusText}`);
  }

  const xml = await resp.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  const prefixNodes = [...doc.getElementsByTagName("CommonPrefixes")];

  const fullPrefixes = prefixNodes
    .map((node) => node.getElementsByTagName("Prefix")[0]?.textContent)
    .filter(Boolean);

  const childNames = fullPrefixes
    .map((p) =>
      p
        .slice(normalizedPrefix.length)
        .replace(/\/$/, "")
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

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    const contents = [...doc.getElementsByTagName("Contents")];
    return contents.map(node => node.getElementsByTagName("Key")[0].textContent);
}

/** Array.sort() on objects compares "[object Object]" and orders nothing, hence an explicit one. */
const byValue = (a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0);

/** The choices a prefix offers, as options a select can render. */
export async function getOptionsFromURL(url, { signal } = {}) {
  try{
    if (url.split('/').includes('troute')){
      const files = await listPublicS3Files(url, { signal });
      const readable = files.filter((f) => f.endsWith('.parquet'));
      const options = readable.map((d) => ({ value: d.split('/').pop(), label: d.split('/').pop() }));
      return options.sort(byValue).reverse();
    }
    const { childNames } = await listPublicS3Directories(url, { signal });
    const options = childNames.map((d) => ({ value: d, label: d }));
    return options.sort(byValue);
  }catch(error){
    return [];
  }

}

/** Hold an answer for the life of the page, unless it is the kind of answer that is more likely a bad moment than a fact. */
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

/** Whether a dated run published an output this app can read. */
const PROBE_PAGE_LIMIT = 6;

function dateHasParquet(model, date, { signal } = {}) {
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

/** A model's dated runs, newest first. */
const DATED_RUN = /^ngen\.\d{8}$/;

const datedRunsNewestFirst = (model, { signal } = {}) =>
  held(runsByModel, model, async () => {
    const url = `outputs/${model}/v2.2_hydrofabric/`;
    try {
      const { childNames } = await listPublicS3Directories(url, { signal });
      const runs = childNames.filter((name) => DATED_RUN.test(name))
        .map((name) => ({ value: name, label: name }))
        .sort(byValue)
        .reverse();
      return { runs, answered: true };
    } catch {
      return { runs: [], answered: false };
    }
  }, ({ answered }) => answered);

/** The models worth offering: the ones with at least one run this app can read. */
const RECENT_RUNS_CHECKED = 3;

async function modelsWithReadableOutputs(models, { signal } = {}) {
  const checked = await Promise.all(
    models.map(async (model) => {
      const { runs, answered } = await datedRunsNewestFirst(model.value, { signal });
      if (!answered) return model;
      if (runs.length === 0) return null;
      for (const run of runs.slice(0, RECENT_RUNS_CHECKED)) {
        if (await dateHasParquet(model.value, run.value, { signal }) !== false) return model;
      }
      return null;
    })
  );
  const kept = checked.filter(Boolean);
  return kept.length ? kept : models;
}

/** The dates worth offering: the ones whose outputs this app can actually read. */
async function datesWithReadableOutputs(model, dates, { signal } = {}) {
  if (dates.length === 0) return dates;

  const has = (i) => dateHasParquet(model, dates[i].value, { signal });

  const newest = await has(0);
  if (newest === null) return dates;

  const oldest = await has(dates.length - 1);
  if (oldest === null) return dates;
  if (oldest === true) return dates;
  if (newest === false) return [];

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

/** The dates to offer for a model: its dated runs, newest first, minus the ones with nothing readable in them. */
export function readableDatesNewestFirst(model, { signal } = {}) {
  return held(datesByModel, model, async () => {
    const { runs } = await datedRunsNewestFirst(model, { signal });
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

/** The model, date, forecast and cycle lists the controls open on. */
const loadBaseOptions = async ({ signal }) => {
  const _models = await getOptionsFromURL(`outputs`, { signal });
  if (_models.length === 0){
    return {models: [], dates: [], forecasts: [], cycles: []};
  }
  const models = await modelsWithReadableOutputs(
    _models.filter((m) => m.value !== 'test'), { signal }
  );
  if (models.length === 0){
    return {models: [], dates: [], forecasts: [], cycles: []};
  }
  const dates = await readableDatesNewestFirst(models[0]?.value, { signal });
  if (dates.length === 0){
    return {models, dates: [], forecasts: [], cycles: []};
  }
  const defaultDate = dates[0]?.value;
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
  const outputFiles = await getOptionsFromURL(`outputs/${models[0]?.value}/v2.2_hydrofabric/${dates[0]?.value}/${forecasts[0]?.value}/${cycles[0]?.value}/${vpu}/ngen-run/outputs/troute/`, { signal });
  return {models, dates, forecasts, cycles, ensembles:[], outputFiles};
}

