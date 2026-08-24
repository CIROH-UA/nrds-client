import React,{ useMemo } from 'react';
import { Popup } from 'react-map-gl/maplibre';
import { PopupContent } from '../styles/Styles';
import { hoverRows } from 'features/DataStream/actions/hoverFeature';
import PropTypes from 'prop-types';

import { formatLabel, formatPropertyValue } from 'features/DataStream/lib/utils';
import HoverValue from './HoverValue';

/**
 * The hover readout, positioned by the feature under the pointer.
 *
 * closeOnClick is off because the hover state owns when this is on screen and maplibre must not
 * also decide. Its Popup defaults to closeOnClick and registers map.on('click', _onClose) when
 * added. react-map-gl adds the popup once, in an effect with empty deps, and guards every later
 * update -- setLngLat included -- behind popup.isOpen(). One click therefore closed it for good:
 * never repositioned, never re-added, still rendering into a detached container.
 *
 * The only thing that recovered it was unmounting, which happens when hovered_feature goes null,
 * and above zoom 7 the divides fill covers every pixel so that never came.
 */
const CustomPopUp = React.memo(({ hovered_feature, enabledHovering }) => {
  // Drops hoverId, longitude and latitude: ours for placement, not the feature's to show.
  const rows = useMemo(() => hoverRows(hovered_feature), [hovered_feature]);

    if (!enabledHovering || !hovered_feature?.hoverId) return null;

  return (
    <Popup
      longitude={hovered_feature.longitude}
      latitude={hovered_feature.latitude}
      offset={[0, -10]}
      closeButton={false}
      // The hover state owns when this is on screen; see the docstring.
      closeOnClick={false}
    >
      <PopupContent>
        <div className="popup-title">Feature</div>
        <HoverValue hoverId={hovered_feature.hoverId} />
        {rows.map(([k, v]) => (
          <div className="popup-row" key={k}>
            <span className="popup-label">{formatLabel(k)}</span>
            <span className="popup-value">{formatPropertyValue(v)}</span>
          </div>
        ))}
      </PopupContent>
    </Popup>
  );
});

CustomPopUp.displayName = 'CustomPopUp';

CustomPopUp.propTypes = {
  hovered_feature: PropTypes.shape({
    hoverId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    longitude: PropTypes.number,
    latitude: PropTypes.number,
  }),
  enabledHovering: PropTypes.bool,
};

export default CustomPopUp;