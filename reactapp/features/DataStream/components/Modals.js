import Modal from 'react-bootstrap/Modal';

import { ThemedModal, XButton, SButton, Row } from './styles/Styles';
import { MdClose } from "react-icons/md";

export const LayerInfoModal = (props) => {
  return (
    <ThemedModal
      {...props}
      size="lg"
      aria-labelledby="contained-modal-title-vcenter"
      centered
      backdrop={false}
    >
      <Modal.Header>
        <Modal.Title id="contained-modal-title-vcenter" 
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          Layer Information
          <SButton onClick={props.onHide}>
            <MdClose />
          </SButton>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p>
          The community HydroFabric is a nationally consistent, high-resolution hydrologic fabric whose
          model inputs and outputs are being retrieved directly from the CIROH NextGen Datastream at{' '}
          <a
            href="https://datastream.ciroh.org/index.html#v2.2_resources/"
            target="_blank"
            rel="noreferrer"
          >
            https://datastream.ciroh.org/index.html#v2.2_resources/
          </a>.
        </p>
        <p>
          The corresponding map layers are served as PMTiles and index files at{' '}
          <a
            href="https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/nexus.pmtiles"
            target="_blank"
            rel="noreferrer"
          >
            nexus.pmtiles
          </a>
          ,{' '}
          <a
            href="https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/merged.pmtiles"
            target="_blank"
            rel="noreferrer"
          >
            merged.pmtiles
          </a>
          , and{' '}
          <a
            href="https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/hydrofabric_index.parquet"
            target="_blank"
            rel="noreferrer"
          >
            hydrofabric_index.parquet
          </a>.
        </p>
      </Modal.Body>
    </ThemedModal>
  );
};


export const DataInfoModel = (props) => {
  return (
    <ThemedModal
      {...props}

      size="lg"
      aria-labelledby="contained-modal-title-vcenter"
      centered
      backdrop={false}

    >
      <Modal.Header>
        <Modal.Title id="contained-modal-title-vcenter" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Data Information
        <SButton onClick={props.onHide}>
          <MdClose/>
        </SButton>
 
       </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div>
          <p>
            The following dates are retrieved from the bucket{' '}
            <a
              href="https://datastream.ciroh.org/index.html#v2.2/"
              target="_blank"
              rel="noopener noreferrer"
            >
              ciroh-community-ngen-datastream
            </a>{' '}
            and represent the dates, models, and forecast for which data are available. 
          </p>
          <p><strong>Note:</strong> Data are only available for certain dates based on the chosen model and forecast per individual VPU. Please verify a date’s availability before you proceed.</p>
        </div>
      </Modal.Body>

    </ThemedModal>
  );
};


export const GeneralInfoModal = (props) => {
  return (
    <ThemedModal
      {...props}

      size="lg"
      aria-labelledby="contained-modal-title-vcenter"
      centered
      backdrop={false}

    >
      <Modal.Header>
        <Modal.Title id="contained-modal-title-vcenter" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Ngen Research DataStream 
        <SButton onClick={props.onHide}>
          <MdClose/>
        </SButton>
 
       </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          The NextGen Research DataStream is an array of daily
          {' '}
          <a href="https://github.com/NOAA-OWP/ngen" target="_blank" rel="noreferrer">
            NextGen
          </a>
          {' '}
          -based hydrolgic simulations in the AWS cloud. An exciting aspect of the Research DataStream is the NextGen configuration is
          {' '}
          <a href="https://datastream.ciroh.org/" target="_blank" rel="noreferrer">
            open-sourced
          </a>
          {' '}
          and
          {' '}
          <a href="https://github.com/CIROH-UA/ngen-datastream/blob/main/docs/nrds/CONTRIBUTE.md" target="_blank" rel="noreferrer">
            community editable
          </a>,
          {' '}
          which allows any member of the hydrologic community to contribute to improving streamflow predictions. By making the NextGen forcings, outputs, and configuration publicly available, it is now possible to leverage regional expertise and incrementally improve streamflow predictions configured with the NextGen Framework.
        </p>

        <p>See the Research DataStream related documentation: </p>

        <ul>
          <li>
            <strong>Find daily output data at: </strong>
            {' '}
            <a href="https://datastream.ciroh.org/index.html" target="_blank" rel="noreferrer">
              https://datastream.ciroh.org/index.html
            </a>
          </li>
          <li>
            <strong>Make improvements to NextGen configuration: </strong>
            Find out how you can contribute
            {' '}
            <a href="https://github.com/CIROH-UA/ngen-datastream/blob/main/docs/nrds/CONTRIBUTE.md" target="_blank" rel="noreferrer">
              here
            </a>!
          </li>
          <li>
            <strong>Current status and configuration: </strong>
            Read
            {' '}
            <a href="https://github.com/CIROH-UA/ngen-datastream/blob/main/docs/nrds/STATUS_AND_METADATA.md" target="_blank" rel="noreferrer">
              here
            </a>!
          </li>
          <li>
            <strong>Infrastructure as Code: </strong>
            See the NRDS AWS architecture
            {' '}
            <a href="https://github.com/CIROH-UA/ngen-datastream/blob/main/infra/aws/terraform/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">
              here
            </a>.
          </li>
          <li>
            <strong>Open Discussions:</strong>
            Check out our discussions
            {' '}
            <a href="https://github.com/CIROH-UA/ngen-datastream/discussions" target="_blank" rel="noreferrer">
              here
            </a>! Feel free to start your own discussion, or participate in any that are ongoing.
          </li>
        </ul>

      </Modal.Body>

    </ThemedModal>
  );
};