import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import useDataStreamStore from 'features/DataStream/store/Datastream';
import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';
import { initialS3Data, makePrefix } from 'features/DataStream/lib/s3Utils';
import { getCacheKey } from 'features/DataStream/lib/utils';
import { loadVpu } from 'features/DataStream/actions/loadVpu';
import { abandonSelectionWithNoOutput } from 'features/DataStream/actions/noOutputFile';

/**
 * Exported for its own sake: the first load of a vpu decides what the app opens on, and until
 * this was reachable by name the only way to exercise it was to mount the whole view.
 */
export function InitialS3Loader() {
  const { vpu } = useDataStreamStore(
    useShallow((s) => ({
      vpu: s.vpu,
      ensemble: s.ensemble,
    }))
  );

  const { set_model, set_forecast, set_cycle, set_outputFile, set_date, set_ensemble, set_cache_key } = useDataStreamStore(
    useShallow((s) => ({
      set_model: s.set_model,
      set_forecast: s.set_forecast,
      set_cycle: s.set_cycle,
      set_outputFile: s.set_outputFile,
      set_date: s.set_date,
      set_ensemble: s.set_ensemble,
      set_cache_key: s.set_cache_key,
    }))
  );
  const { setInitialData } = useS3DataStreamBucketStore(
    useShallow((s) => ({ setInitialData: s.setInitialData }))
  );

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    async function fetchInitialData() {
      if (!vpu) return;
      try {
        const { models, dates, forecasts, cycles, ensembles, outputFiles } =
          await initialS3Data(vpu, { signal: controller.signal });

        if (!alive) return; // <- prevents any setState after unmount/dep change

        const _models = models.filter(m => m.value !== 'test');

        // Nothing to read, so nothing to key. Without this the key was built from an undefined
        // output file, which names a table that cannot exist, and the previous vpu's chart and
        // animation stayed on screen as though they belonged to this one. The manual path
        // through applyOutputFiles already refuses on the same condition.
        if (!outputFiles.length) {
          // The controls still describe this vpu: the lists it can offer, and the first of each
          // that exists. Leaving them at the previous vpu's values meant every later dropdown
          // built its s3 url from path segments belonging to somewhere else.
          setInitialData({
            models: _models, dates, forecasts, cycles, outputFiles, prefix: '',
          });
          set_model(_models[0]?.value);
          set_forecast(forecasts[0]?.value);
          set_cycle(cycles[0]?.value);
          set_date(dates[1]?.value);
          set_ensemble(ensembles[0]?.value || null);
          abandonSelectionWithNoOutput();
          return;
        }

        const cacheKey = getCacheKey(
          _models[0]?.value,
          dates[1]?.value,
          forecasts[0]?.value,
          cycles[0]?.value,
          ensembles[0]?.value || null,
          vpu,
          outputFiles[0]?.value
        );

        set_model(_models[0]?.value);
        set_forecast(forecasts[0]?.value);
        set_cycle(cycles[0]?.value);
        set_outputFile(outputFiles[0]?.value);
        set_date(dates[1]?.value);
        set_ensemble(ensembles[0]?.value || null);
        set_cache_key(cacheKey);

        const _prefix = makePrefix(
          _models[0]?.value,
          dates[1]?.value,
          forecasts[0]?.value,
          cycles[0]?.value,
          ensembles[0]?.value || null,
          vpu,
          outputFiles[0]?.value
        );

        setInitialData({
          models: _models,
          dates: dates,
          forecasts: forecasts,
          cycles: cycles,
          outputFiles: outputFiles,
          prefix: _prefix,
        });

        // Explicit, so the vpu load is no longer a second effect reacting to cache_key.
        await loadVpu();

      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('Error fetching initial S3 data:', error);
      }
    }
    
    fetchInitialData();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [vpu]);

  return null;
}
