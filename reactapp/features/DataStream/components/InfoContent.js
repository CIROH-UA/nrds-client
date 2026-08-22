/**
 * The explanatory prose, kept apart from whatever shows it.
 *
 * Two of these opened as dialogs and now open inline, one is still a dialog. Holding the copy
 * here means moving something between the two costs an import rather than a rewrite.
 */

export const LayerInfoContent = () => (
  <>
    <p>
      The community HydroFabric is a nationally consistent, high-resolution hydrologic fabric
      whose model inputs and outputs come directly from the{' '}
      <a
        href="https://datastream.ciroh.org/index.html#resources/v2.2_hydrofabric/geopackages/"
        target="_blank"
        rel="noreferrer"
      >
        CIROH NextGen Datastream
      </a>
      .
    </p>
    <p>The map layers are served as PMTiles and index files:</p>
    <ul>
      <li>
        <a
          href="https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/merged.pmtiles"
          target="_blank"
          rel="noreferrer"
        >
          merged.pmtiles
        </a>, for catchment divides, gauges and hydrolocations
      </li>
      <li>
        <a
          href="https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/only_geometry/upstream_index/flowpaths.pmtiles"
          target="_blank"
          rel="noreferrer"
        >
          flowpaths.pmtiles
        </a>, the flowpath geometry the animation is drawn from
      </li>
      <li>
        <a
          href="https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/hydrofabric_index.parquet"
          target="_blank"
          rel="noreferrer"
        >
          hydrofabric_index.parquet
        </a>, the id index the search box reads
      </li>
    </ul>
  </>
);

export const DataInfoContent = () => (
  <>
    <p>
      The dates, models and forecasts offered here are read from the{' '}
      <a href="https://datastream.ciroh.org/index.html#v2.2/" target="_blank" rel="noreferrer">
        ciroh-community-ngen-datastream
      </a>{' '}
      bucket, and represent what is actually available.
    </p>
    <p>
      <strong>Note:</strong> availability varies by date, model, forecast and VPU. A combination
      that exists for one VPU may have no output file for another.
    </p>
  </>
);

export const GeneralInfoContent = () => (
  <>
    <p>
      The NextGen Research DataStream is an array of daily{' '}
      <a href="https://github.com/NOAA-OWP/ngen" target="_blank" rel="noreferrer">
        NextGen
      </a>
      -based hydrologic simulations in the AWS cloud. Its NextGen configuration is{' '}
      <a href="https://datastream.ciroh.org/" target="_blank" rel="noreferrer">
        open-sourced
      </a>{' '}
      and{' '}
      <a
        href="https://github.com/CIROH-UA/ngen-datastream/blob/main/docs/nrds/CONTRIBUTE.md"
        target="_blank"
        rel="noreferrer"
      >
        community editable
      </a>
      , so any member of the hydrologic community can contribute to improving streamflow
      predictions. Publishing the forcings, outputs and configuration makes it possible to
      bring regional expertise to bear and improve predictions incrementally.
    </p>

    <p>Related documentation:</p>

    <ul>
      <li>
        <strong>Daily output data:</strong>{' '}
        <a href="https://datastream.ciroh.org/index.html" target="_blank" rel="noreferrer">
          datastream.ciroh.org
        </a>
      </li>
      <li>
        <strong>Improve the NextGen configuration:</strong>{' '}
        <a
          href="https://github.com/CIROH-UA/ngen-datastream/blob/main/docs/nrds/CONTRIBUTE.md"
          target="_blank"
          rel="noreferrer"
        >
          how to contribute
        </a>
      </li>
      <li>
        <strong>Current status and configuration:</strong>{' '}
        <a
          href="https://github.com/CIROH-UA/ngen-datastream/blob/main/docs/nrds/STATUS_AND_METADATA.md"
          target="_blank"
          rel="noreferrer"
        >
          status and metadata
        </a>
      </li>
      <li>
        <strong>Infrastructure as code:</strong>{' '}
        <a
          href="https://github.com/CIROH-UA/ngen-datastream/blob/main/infra/aws/terraform/docs/ARCHITECTURE.md"
          target="_blank"
          rel="noreferrer"
        >
          the NRDS AWS architecture
        </a>
      </li>
      <li>
        <strong>Open discussions:</strong>{' '}
        <a
          href="https://github.com/CIROH-UA/ngen-datastream/discussions"
          target="_blank"
          rel="noreferrer"
        >
          join or start one
        </a>
      </li>
    </ul>
  </>
);
