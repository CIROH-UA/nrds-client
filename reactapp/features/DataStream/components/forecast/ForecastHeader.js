
import PropTypes from 'prop-types';
import { useState } from 'react';
import { MdLocationPin, MdClose } from "react-icons/md";
import { IoLocateOutline } from "react-icons/io5";

import { Row, IconLabel, SButton, InfoPanel, PanelCaption } from '../styles/Styles';
import { InfoToggle } from '../InfoDisclosure';
import { DataInfoContent } from '../InfoContent';
import { showSelection } from 'features/DataStream/actions/showSelection';

/**
 * The panel's header, and the controls that act on the selection as a whole.
 *
 * "Zoom to catchment" is here rather than floating over the map, which is where it started and
 * where it read as unrelated to anything. It only means something while a feature is selected,
 * this panel only exists while a feature is selected, and the chart underneath is the reason the
 * reader wants to find it again.
 *
 * It is an icon in this row rather than a button under it. As a full-width bordered button it
 * took the most prominent position in the panel, between the title and the chart, for a utility
 * action -- so the reading order was the feature, then a button, then the thing the reader came
 * for. The row already holds the other two controls that act on the selection as a whole.
 *
 * The heading carries the catchment and the caption carries the run, which are facts of
 * different kinds: one names the thing and does not change while the panel is open, the other
 * is a property of it that the controls below can change. Together they made a two-line title
 * in a 400px panel and repeated what the Forecast select already said.
 */
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
