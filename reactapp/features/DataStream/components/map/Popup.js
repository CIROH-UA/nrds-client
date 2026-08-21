import React,{ useMemo } from 'react';
import { Popup } from 'react-map-gl/maplibre';
import { PopupContent } from '../styles/Styles';
import { hoverRows } from 'features/DataStream/actions/hoverFeature';
import PropTypes from 'prop-types';

import { formatLabel, formatPropertyValue } from 'features/DataStream/lib/utils';
import HoverValue from './HoverValue';

const CustomPopUp = React.memo(({ hovered_feature, enabledHovering }) => {
  // hoverId, longitude and latitude are ours, added so the popup can place itself: they were
  // being listed back to the reader as if they were properties of the feature.
  const rows = useMemo(() => hoverRows(hovered_feature), [hovered_feature]);

    if (!enabledHovering || !hovered_feature?.hoverId) return null;

  return (
    <Popup
      longitude={hovered_feature.longitude}
      latitude={hovered_feature.latitude}
      offset={[0, -10]}
      closeButton={false}
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