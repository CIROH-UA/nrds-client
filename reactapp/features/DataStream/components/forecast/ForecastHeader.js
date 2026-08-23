
import React, { useState } from 'react';
import { MdLocationPin, MdClose } from "react-icons/md";
import { IoLocateOutline } from "react-icons/io5";

import { Row, IconLabel, SButton, InfoPanel, GhostButton } from '../styles/Styles';
import { InfoToggle } from '../InfoDisclosure';
import { DataInfoContent } from '../InfoContent';
import { showSelection } from 'features/DataStream/actions/showSelection';

/**
 * The panel's header, and the controls that act on the selection as a whole.
 *
 * "Show on map" is here rather than floating over the map, which is where it started and where
 * it read as unrelated to anything. It only means something while a feature is selected, this
 * panel only exists while a feature is selected, and the chart underneath is the reason the
 * reader wants to find it again.
 */
export const ForecastHeader = ({ title, onClick }) => {
  const [dataInfoOpen, setDataInfoOpen] = useState(false);

  return (
    <div>
      <Row>
        <IconLabel as="h2" $fontSize={16}>
          <MdLocationPin size={18} style={{ color: 'var(--nav-pill-active-bg)' }} />
          {title}
        </IconLabel>
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

      {dataInfoOpen && (
        <InfoPanel id="data-info">
          <DataInfoContent />
        </InfoPanel>
      )}

      <GhostButton
        type="button"
        onClick={showSelection}
        title="Centre the map on this catchment"
      >
        <IoLocateOutline size={15} aria-hidden="true" />
        Show on map
      </GhostButton>
    </div>
  );
};
