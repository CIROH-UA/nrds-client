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