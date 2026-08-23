import Modal from 'react-bootstrap/Modal';
import PropTypes from 'prop-types';
import { useId } from 'react';
import { MdClose } from 'react-icons/md';

import { ThemedModal, ModalCloseButton, XButton } from './styles/Styles';
import { GeneralInfoContent, ExperimentalCaveat } from './InfoContent';

/**
 * The shell for the one dialog that is still a dialog.
 *
 * The three of them each carried their own copy of the header, the title row's inline flex
 * styles, and the close button, and all three hard-coded the same element id into
 * aria-labelledby, so two open at once would have pointed at each other's heading. useId gives
 * each instance its own.
 *
 * A backdrop, where there was none. Without it the dialog floated over a live map with nothing
 * separating them, it was unclear whether the map was still interactive, and there was no way
 * to dismiss by clicking away or pressing escape.
 */
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

/**
 * Shown once, before anything else, and acknowledged rather than dismissed.
 *
 * DESIGN.md says not to reach for a modal first, and it is right: the three info dialogs this
 * app had did not need to be modal. This one is a different kind of thing. It is not offering
 * information the reader can go and find, it is a gate that has to be passed once, and the
 * banner it replaces demonstrated the alternative -- a bar with an X, which people close without
 * reading and which then never returns.
 *
 * So it has no close button, no backdrop dismissal and no escape: one button, which is the
 * acknowledgement. That is a deliberate trap and the only thing that justifies it is that it
 * happens exactly once per browser. Focus lands on that button when it opens, so a keyboard
 * reader is already on the only thing there is to do.
 */
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
