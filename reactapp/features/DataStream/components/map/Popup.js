import React,{ useMemo } from 'react';
import { Popup } from 'react-map-gl/maplibre';
import { PopupContent } from '../styles/Styles';
const CustomPopUp = React.memo(({ hovered_feature, enabledHovering }) => {
  const rows = useMemo(() => {
    if (!hovered_feature ) return [];
    return Object.entries(hovered_feature);
  }, [hovered_feature]);

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
        {rows.map(([k, v]) => (
          <div className="popup-row" key={k}>
            <span className="popup-label">{k}</span>
            <span className="popup-value">{String(v)}</span>
          </div>
        ))}
      </PopupContent>
    </Popup>
  );
});

export default CustomPopUp;