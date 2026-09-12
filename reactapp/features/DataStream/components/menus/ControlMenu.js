import { Fragment, useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { IoOptions, IoClose } from 'react-icons/io5';
import { useShallow } from 'zustand/react/shallow';

import { DataMenuControls } from '../forecast/dataMenu';
import { LayerControl } from '../map/LayersControl';
import { ThemeToggle } from './ThemeToggle';
import SelectComponent from '../SelectComponent';
import { LayerButton, PanelSectionHeading, Row, IconLabel } from '../styles/Styles';
import { useVPUStore } from '../../store/VPU';
import { SCALE_OPTIONS } from '../../lib/colorScale';

/**
 * The one map-chrome control (KTD5): run selection, layer toggles, and the light/dark theme,
 * previously three disconnected regions (the run selector in the forecast sheet, the layer menu
 * in the Tethys navbar, no manual theme control at all).
 *
 * It does not reimplement any of that behavior. The run cascade is `DataMenuControls`
 * (`useDataStreamStore` + `useS3DataStreamBucketStore` + `loadVpu`, race-guarded by
 * `beginSelection`/`isCurrentSelection`); the layer toggles are `LayerControl` (`useLayersStore`);
 * the theme control is the U2 `ThemeToggle` (the effective-theme signal in `store/theme`). This
 * component only composes and frames them, so run switching and layer toggling behave exactly as
 * before (R6).
 */

const Panel = styled.div`
  position: absolute;
  top: calc(var(--ts-header-height) + 16px);
  left: 10px;
  width: min(300px, calc(100vw - 32px));
  max-height: calc(100dvh - var(--ts-header-height) - 90px);
  padding: 14px 16px;
  background-color: var(--map-panel-bg);
  color: var(--map-panel-text);
  border: 1px solid var(--panel-border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--elevation-map-control);
  overflow-y: auto;
  z-index: 1000;
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 768px) {
    left: 8px;
    right: 8px;
    width: auto;
    max-height: calc(100dvh - var(--ts-header-height) - 32px);
  }
`;

/** A framed group inside the panel; the seam between run, layers, and theme. */
const Section = styled.section`
  padding-block: 10px;
  border-block-end: 1px solid var(--panel-border-color);

  &:first-of-type {
    padding-top: 0;
  }

  &:last-of-type {
    padding-bottom: 0;
    border-block-end: none;
  }
`;

const ThemeRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

const ThemeLabel = styled.span`
  font-size: var(--text-sm);
  font-weight: var(--weight-strong);
  color: var(--map-panel-text);
`;

/** Open unless the screen is too small to spare the room (mirrors the old LayersMenu default). */
const shouldStartOpen = () => {
  try {
    return window.matchMedia?.('(min-width: 769px)')?.matches ?? true;
  } catch {
    return true;
  }
};

/** The colour-scale selector: how a reach's value maps into the ramp. */
const ColorScaleControl = () => {
  const { scale, setScale } = useVPUStore(
    useShallow((s) => ({ scale: s.scale, setScale: s.setScale }))
  );

  const selected = useMemo(
    () => SCALE_OPTIONS.find((o) => o.value === scale) ?? SCALE_OPTIONS[0],
    [scale]
  );

  const onChange = useCallback((opt) => opt && setScale(opt.value), [setScale]);

  return (
    <Fragment>
      <PanelSectionHeading>Colour scale</PanelSectionHeading>
      <Row>
        <IconLabel as="label" htmlFor="color-scale-select">
          Color scale
        </IconLabel>
        <SelectComponent
          inputId="color-scale-select"
          compact
          optionsList={SCALE_OPTIONS}
          value={selected}
          onChangeHandler={onChange}
        />
      </Row>
    </Fragment>
  );
};

/** The unified run + layers + theme control, and the button that reveals it. */
export const ControlMenu = () => {
  const [open, setOpen] = useState(shouldStartOpen);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  return (
    <Fragment>
      <LayerButton
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="control-options"
        aria-label={open ? 'Hide map controls' : 'Show map controls'}
        title={open ? 'Hide map controls' : 'Show map controls'}
        $bgColor={open ? 'transparent' : undefined}
      >
        {open ? <IoClose size={20} aria-hidden="true" /> : <IoOptions size={20} aria-hidden="true" />}
      </LayerButton>

      {open && (
        <Panel id="control-options" role="group" aria-label="Map controls">
          <Section aria-label="Model run">
            <DataMenuControls />
          </Section>

          <Section aria-label="Layers">
            <LayerControl />
          </Section>

          <Section aria-label="Colour scale">
            <ColorScaleControl />
          </Section>

          <Section aria-label="Theme">
            <PanelSectionHeading>Appearance</PanelSectionHeading>
            <ThemeRow>
              <ThemeLabel>Theme</ThemeLabel>
              <ThemeToggle />
            </ThemeRow>
          </Section>
        </Panel>
      )}
    </Fragment>
  );
};

export default ControlMenu;
