import PropTypes from 'prop-types';
import { MdClose, MdInfoOutline } from 'react-icons/md';

import { SButton } from './styles/Styles';

/** The control that opens an inline note. */
export const InfoToggle = ({ open, onToggle, controls, label, size = 15 }) => (
  <SButton
    bsPrefix="btn2"
    type="button"
    onClick={() => onToggle(!open)}
    aria-expanded={open}
    aria-controls={controls}
    aria-label={open ? `Hide ${label}` : `Show ${label}`}
    title={open ? `Hide ${label}` : `Show ${label}`}
  >
    {open ? <MdClose size={size} aria-hidden="true" /> : <MdInfoOutline size={size} aria-hidden="true" />}
  </SButton>
);

InfoToggle.propTypes = {
  open: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  controls: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  size: PropTypes.number,
};

export default InfoToggle;
