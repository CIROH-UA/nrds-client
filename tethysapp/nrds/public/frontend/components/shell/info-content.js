/**
 * The explanatory prose for the shell's dialogs (migration unit U6), ported verbatim from the React
 * `DataStream/components/InfoContent`. Each export returns a DocumentFragment so the modal helper
 * can append it as a body. The markup is static and author-controlled; the outbound links keep the
 * `rel="noreferrer"` and `target="_blank"` the React copy used.
 */

/** Build a DocumentFragment from a trusted, author-written HTML string. */
function fromHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content;
}

const EXPERIMENTAL_CAVEAT_HTML = `
  <p>
    <strong>These results are experimental.</strong> They are preliminary research output, not an
    operational forecast, and must not be used for decisions about life or property. The operational
    service is the
    <a href="https://water.noaa.gov/" target="_blank" rel="noreferrer">National Water Prediction Service</a>.
  </p>
`;

/** The caveat, written once and shown both in the gate and at the top of the general-info dialog. */
export function experimentalCaveat() {
  return fromHTML(EXPERIMENTAL_CAVEAT_HTML);
}

const GENERAL_INFO_HTML = `
  ${EXPERIMENTAL_CAVEAT_HTML}
  <p>
    The NextGen Research DataStream is an array of daily
    <a href="https://github.com/NOAA-OWP/ngen" target="_blank" rel="noreferrer">NextGen</a>-based
    hydrologic simulations in the AWS cloud. Its NextGen configuration is
    <a href="https://datastream.ciroh.org/" target="_blank" rel="noreferrer">open-sourced</a> and
    <a href="https://github.com/CIROH-UA/ngen-datastream/blob/main/docs/nrds/CONTRIBUTE.md" target="_blank" rel="noreferrer">community editable</a>,
    so any member of the hydrologic community can contribute to improving streamflow predictions.
    Publishing the forcings, outputs and configuration makes it possible to bring regional expertise
    to bear and improve predictions incrementally.
  </p>
  <p>Related documentation:</p>
  <ul>
    <li>
      <strong>Daily output data:</strong>
      <a href="https://datastream.ciroh.org/index.html" target="_blank" rel="noreferrer">datastream.ciroh.org</a>
    </li>
    <li>
      <strong>Improve the NextGen configuration:</strong>
      <a href="https://github.com/CIROH-UA/ngen-datastream/blob/main/docs/nrds/CONTRIBUTE.md" target="_blank" rel="noreferrer">how to contribute</a>
    </li>
    <li>
      <strong>Current status and configuration:</strong>
      <a href="https://github.com/CIROH-UA/ngen-datastream/blob/main/docs/nrds/STATUS_AND_METADATA.md" target="_blank" rel="noreferrer">status and metadata</a>
    </li>
    <li>
      <strong>Infrastructure as code:</strong>
      <a href="https://github.com/CIROH-UA/ngen-datastream/blob/main/infra/aws/terraform/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">the NGIAB-NRDS AWS architecture</a>
    </li>
    <li>
      <strong>Open discussions:</strong>
      <a href="https://github.com/CIROH-UA/ngen-datastream/discussions" target="_blank" rel="noreferrer">join or start one</a>
    </li>
  </ul>
`;

/** The general-info dialog body: the caveat, what the DataStream is, and where to read more. */
export function generalInfoContent() {
  return fromHTML(GENERAL_INFO_HTML);
}
