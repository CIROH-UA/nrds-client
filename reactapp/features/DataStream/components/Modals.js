import Modal from 'react-bootstrap/Modal';
import PropTypes from 'prop-types';
import { useId } from 'react';
import { MdClose } from 'react-icons/md';

import { ThemedModal, ModalCloseButton, XButton } from './styles/Styles';
import { GeneralInfoContent, ExperimentalCaveat } from './InfoContent';

/** The shell for the one dialog that is still a dialog. */
const InfoModal = ({ title, children, onHide, ...props }) => {
  const titleId = useId();

  return (
    <ThemedModal
      {...props}
      onHide={onHide}
      size="lg"
      centered
      scrollable
      aria-labelledby={titleId}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={titleId}>
          {title}
        </Modal.Title>
        <ModalCloseButton type="button" onClick={onHide} aria-label={`Close ${title}`}>
          <MdClose size={20} aria-hidden="true" />
        </ModalCloseButton>
      </Modal.Header>

      <Modal.Body>{children}</Modal.Body>
    </ThemedModal>
  );
};

InfoModal.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  onHide: PropTypes.func,
};

export const GeneralInfoModal = (props) => (
  <InfoModal {...props} title="Ngen Research DataStream">
    <GeneralInfoContent />
  </InfoModal>
);

/** Shown once, before anything else, and acknowledged rather than dismissed. */
export const ExperimentalNoticeModal = ({ show, onAcknowledge }) => {
  const titleId = useId();

  return (
    <ThemedModal
      show={show}
      onHide={onAcknowledge}
      backdrop="static"
      keyboard={false}
      centered
      aria-labelledby={titleId}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={titleId}>
          Before you start
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <ExperimentalCaveat />
      </Modal.Body>

      <Modal.Footer>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the only control in a gate dialog */}
        <XButton type="button" onClick={onAcknowledge} autoFocus>
          I understand
        </XButton>
      </Modal.Footer>
    </ThemedModal>
  );
};

ExperimentalNoticeModal.propTypes = {
  show: PropTypes.bool,
  onAcknowledge: PropTypes.func.isRequired,
};
