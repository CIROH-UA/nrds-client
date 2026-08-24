import PropTypes from 'prop-types';
import { Fragment, useCallback, useState } from 'react';
import { IoLayers, IoClose } from 'react-icons/io5';

import { LayerControl } from '../map/LayersControl';
import { LayersContainer, LayerButton } from '../styles/Styles';

/** Open unless the screen is too small to spare the room. */
const shouldStartOpen = () => {
  try {
    return window.matchMedia?.('(min-width: 769px)')?.matches ?? true;
  } catch {
    return true;
  }
};

/** The layer panel, and the control that reveals it. */
export const LayersMenu = ({ inline = false }) => {
  const [open, setIsOpen] = useState(shouldStartOpen);
  const toggle = useCallback(() => setIsOpen((o) => !o), []);
  const buttonStyle = inline
    ? { position: 'static', top: 'auto', right: 'auto', marginTop: 0 }
    : undefined;

  return (
    <Fragment>
      <LayerButton
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="layer-options"
        aria-label={open ? 'Hide layer options' : 'Show layer options'}
        title={open ? 'Hide layer options' : 'Show layer options'}
        style={buttonStyle}
        $bgColor={open ? 'transparent' : undefined}
      >
        {open ? <IoClose size={20} aria-hidden="true" /> : <IoLayers size={20} aria-hidden="true" />}
      </LayerButton>

      {open && (
        <LayersContainer id="layer-options">
          <LayerControl />
        </LayersContainer>
      )}
    </Fragment>
  );
};

LayersMenu.propTypes = {
  inline: PropTypes.bool,
};
