import { useLayersStore } from '../../store/Layers';
import { Fragment, useMemo, useState } from 'react';
import { Switch } from  '../styles/Styles';
import { IoLayers } from "react-icons/io5";
import { IconLabel, Row, Title, InfoPanel } from '../styles/Styles';
import { CatchmentSymbol, FlowPathSymbol, GaugeSymbol, VpuSymbol, symbologyColors, CursorSymbol } from '../../lib/layers';
import { usePrefersDark } from '../../lib/mapTheme';
import { InfoToggle } from '../InfoDisclosure';
import { LayerInfoContent } from '../InfoContent';
import { ValueLegendPanel } from './ValueLegend';

export const LayerControl = () => {
  const [layerInfoOpen, setLayerInfoOpen] = useState(false);
  
  const catchmentLayer = useLayersStore((state) => state.catchments);
  const flowpathsLayer = useLayersStore((state) => state.flowpaths);
  const conusGaugesLayer = useLayersStore((state) => state.conus_gauges);
  const layerHoveredEnabled = useLayersStore((state) => state.hovered_enabled);
  
  const set_catchments_visibility = useLayersStore(
    (state) => state.set_catchments_visibility
  );
  const set_flowpaths_visibility = useLayersStore(
    (state) => state.set_flowpaths_visibility
  );
  const set_conus_gauges_visibility = useLayersStore(
    (state) => state.set_conus_gauges_visibility
  );

  const set_hovered_enabled = useLayersStore(
    (state) => state.set_hovered_enabled
  );

  const vpuLayer = useLayersStore((state) => state.vpu);
  const set_vpu_visibility = useLayersStore((state) => state.set_vpu_visibility);

  // The legend reads the same tokens the map layers do, so the two cannot disagree. It was
  // branching on styled-components' useTheme, and nothing here installs a ThemeProvider, so
  // that value was always undefined and the legend was always the light branch.
  const prefersDark = usePrefersDark();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(() => symbologyColors(), [prefersDark]);

  const handleToggleCatchmentLayer = () => {
    set_catchments_visibility(!catchmentLayer.visible);
  };

  const handleToggleFlowPathsLayer = () => {
    set_flowpaths_visibility(!flowpathsLayer.visible);
  };

  const handleToggleConusGaugesLayer = () => {
    set_conus_gauges_visibility(!conusGaugesLayer.visible);
  };

  const handleToggleHovering = () => {
    set_hovered_enabled(!layerHoveredEnabled);
  };

  return (
    <Fragment>
      <IconLabel>
        <IoLayers />
        <Title>Layer Options</Title>
        <InfoToggle
          open={layerInfoOpen}
          onToggle={setLayerInfoOpen}
          controls="layer-info"
          label="layer information"
        />
      </IconLabel>

      {layerInfoOpen && (
        <InfoPanel id="layer-info">
          <LayerInfoContent />
        </InfoPanel>
      )}


      {/* <Content> */}

      <Row>
        <IconLabel>
          <CatchmentSymbol
            fill={colors.catchmentFill}
            stroke={colors.catchmentStroke}
          />
          Catchments
        </IconLabel>
        <Switch
          id="catchment-layer-switch"
          checked={catchmentLayer.visible}
          onChange={handleToggleCatchmentLayer}
          title="Toggle Catchment Layer visualization"
        />
      </Row>

      <Row>
        <IconLabel>
          <FlowPathSymbol stroke={colors.flowStroke} />
          FlowPaths
        </IconLabel>
        <Switch
          id="flowpaths-layer-switch"
          checked={flowpathsLayer.visible}
          onChange={handleToggleFlowPathsLayer}
          title="Toggle FlowPaths Layer visualization"
        />
      </Row>

      <Row>
        <IconLabel>
          <GaugeSymbol
            fill={colors.gaugeFill}
            stroke={colors.gaugeStroke}
          />
          Conus Gauges
        </IconLabel>
        <Switch
          id="conus-gauges-layer-switch"
          checked={conusGaugesLayer.visible}
          onChange={handleToggleConusGaugesLayer}
          title="Toggle Conus Gauges Layer visualization"
        />
      </Row>
      {/* </Content> */}

      <Row>
        <IconLabel>
          <VpuSymbol />
          VPU Boundaries
        </IconLabel>
        <Switch
          id="vpu-layer-switch"
          checked={vpuLayer.visible}
          onChange={() => set_vpu_visibility(!vpuLayer.visible)}
          title="Toggle VPU boundaries"
        />
      </Row>

      {/* The key for the animation, beside the switch that turns it on. */}
      <ValueLegendPanel />

      <IconLabel $fontSize={14}>
        <span style={{ fontWeight: 600 }}>Map Interactions</span>
      </IconLabel>

      <Row>
        <IconLabel>
          <CursorSymbol fill={colors.cursorFill} stroke={colors.cursorStroke} />
          Enable Hovering 
        </IconLabel>
        <Switch
          id="enable-hovering-switch"
          checked={layerHoveredEnabled}
          onChange={handleToggleHovering}
          title="Toggle Conus Gauges Layer visualization"
        />
      </Row>
    </Fragment>
  );
};