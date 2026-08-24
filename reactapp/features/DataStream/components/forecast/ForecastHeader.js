
import PropTypes from 'prop-types';
import { useState } from 'react';
import { MdLocationPin, MdClose } from "react-icons/md";
import { IoLocateOutline } from "react-icons/io5";

import { Row, IconLabel, SButton, InfoPanel, PanelCaption } from '../styles/Styles';
import { InfoToggle } from '../InfoDisclosure';
import { DataInfoContent } from '../InfoContent';
import { showSelection } from 'features/DataStream/actions/showSelection';

/** The panel's header, and the controls that act on the selection as a whole. */
export const ForecastHeader = ({ title, subtitle, onClick }) => {
  const [dataInfoOpen, setDataInfoOpen] = useState(false);

  return (
    <div>
      <Row>
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
        <InfoToggle
          open={dataInfoOpen}
          onToggle={setDataInfoOpen}
          controls="data-info"
          label="notes on this data"
        />
        <SButton onClick={onClick} aria-label="Clear selection" title="Clear selection">
          <MdClose />
        </SButton>
      </Row>

      {subtitle && <PanelCaption>{subtitle}</PanelCaption>}

      {dataInfoOpen && (
        <InfoPanel id="data-info">
          <DataInfoContent />
        </InfoPanel>
      )}

    </div>
  );
};

ForecastHeader.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  onClick: PropTypes.func,
};
