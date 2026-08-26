
import PropTypes from 'prop-types';
import { useState } from 'react';
import { MdLocationPin, MdClose, MdExpandLess, MdExpandMore } from "react-icons/md";
import { IoLocateOutline } from "react-icons/io5";

import { Row, IconLabel, SButton, InfoPanel, PanelCaption, CollapsibleRegion } from '../styles/Styles';
import { InfoToggle } from '../InfoDisclosure';
import { DataInfoContent } from '../InfoContent';
import { showSelection } from 'features/DataStream/actions/showSelection';

/** The panel's header, and the controls that act on the selection as a whole. */
export const ForecastHeader = ({ title, subtitle, onClick, collapsible = false, collapsed = false, onToggleCollapsed, collapseControls, rowRef }) => {
  const [dataInfoOpen, setDataInfoOpen] = useState(false);

  return (
    <div>
      <Row ref={rowRef}>
        <IconLabel as="h2" $fontSize={16}>
          <MdLocationPin size={18} style={{ color: 'var(--nav-pill-active-bg)' }} />
          {title}
        </IconLabel>
        <SButton
          onClick={showSelection}
          aria-label="Zoom to catchment"
          title="Move the map back to this catchment"
        >
          <IoLocateOutline />
        </SButton>
        {!collapsed && (
          <InfoToggle
            open={dataInfoOpen}
            onToggle={setDataInfoOpen}
            controls="data-info"
            label="notes on this data"
          />
        )}
        {collapsible && (
          <SButton
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls={collapseControls}
            aria-label={collapsed ? 'Expand the forecast panel' : 'Minimise the forecast panel'}
            title={collapsed ? 'Expand the forecast panel' : 'Minimise to watch the map'}
          >
            {collapsed ? <MdExpandLess /> : <MdExpandMore />}
          </SButton>
        )}
        <SButton onClick={onClick} aria-label="Clear selection" title="Clear selection">
          <MdClose />
        </SButton>
      </Row>

      <CollapsibleRegion $collapsed={collapsed} aria-hidden={collapsed || undefined}>
        {subtitle && <PanelCaption>{subtitle}</PanelCaption>}

        {dataInfoOpen && (
          <InfoPanel id="data-info">
            <DataInfoContent />
          </InfoPanel>
        )}
      </CollapsibleRegion>

    </div>
  );
};

ForecastHeader.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  onClick: PropTypes.func,
  collapsible: PropTypes.bool,
  collapsed: PropTypes.bool,
  onToggleCollapsed: PropTypes.func,
  collapseControls: PropTypes.string,
  rowRef: PropTypes.shape({ current: PropTypes.any }),
};
