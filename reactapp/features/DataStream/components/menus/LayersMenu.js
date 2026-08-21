import PropTypes from 'prop-types';
import { Fragment, useCallback, useState } from 'react';
import { IoLayers, IoClose } from 'react-icons/io5';

import { LayerControl } from '../map/LayersControl';
import { LayersContainer, LayerButton } from '../styles/Styles';

/**
 * The layer panel, and the control that reveals it.
 *
 * A disclosure, declared as one: aria-expanded and aria-controls are what make it that rather
 * than a button that happens to change something. It was two icon-only buttons with no
 * accessible name at all, announcing themselves as "button", and they were how the layer panel
 * is reached. The panel also took an isOpen prop it never read, which styled-components
 * filtered out before it could reach the DOM, so it did nothing in either direction.
 *
 * ``inline`` drops the absolute positioning so the control can sit in the header rather than
 * floating over the map. The panel it opens stays absolutely positioned either way.
 */
export const LayersMenu = ({ inline = false }) => {
  const [open, setIsOpen] = useState(false);
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
