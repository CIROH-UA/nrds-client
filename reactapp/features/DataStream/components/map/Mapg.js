// MapComponent.jcacheKeys
import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer } from "@deck.gl/layers";
import Map, { Source, useControl } from 'react-map-gl/maplibre';
import { Protocol } from 'pmtiles';
import useTimeSeriesStore from '../../store/Timeseries';
import useDataStreamStore from '../../store/Datastream';
import { useVPUStore } from '../../store/Layers';
import { useLayersStore, useFeatureStore } from '../../store/Layers';
import CustomPopUp from './Popup';
import { 
  dividesOutlineColor, 
  dividesHighlightFillColor, 
  dividesHighlightOutlineColor, 
  flowpathsLineColor, 
  gaugesCircleColor, 
  nexusCircleColor, 
  nexusStrokeColor, 
  nexusHighlightCircleColor,
  reorderLayers, 
  computeBounds, 
  convertFeaturesToPaths, 
  valueToColor, 
  getValueAtTimeFlat 
} from '../../lib/layers';
import { layerIdToFeatureType } from '../../lib/utils';
import { getCentroid, flowpathsSignature } from '../../lib/layers';

import {
  useCatchmentLayers,
  useFlowPathsLayer,
  useConusGaugesLayer,
  useNexusLayers,
} from './MapLayers';


function DeckGLOverlay(props) {
  const overlay = useControl(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

const MainMap = () => {
  const isNexusVisible = useLayersStore((state) => state.nexus.visible);
  const isCatchmentsVisible = useLayersStore((state) => state.catchments.visible);
  const isFlowPathsVisible = useLayersStore((state) => state.flowpaths.visible);
  const isConusGaugesVisible = useLayersStore((state) => state.conus_gauges.visible);
  const enabledHovering = useLayersStore((state) => state.hovered_enabled);

  const selectedFeatureId = useTimeSeriesStore((state) => state.feature_id);
  const loading = useTimeSeriesStore((state) => state.loading);
  const set_loading_text = useTimeSeriesStore((state) => state.set_loading_text);
  const set_feature_id = useTimeSeriesStore((state) => state.set_feature_id);
  const reset = useTimeSeriesStore((state) => state.reset);

  const nexus_pmtiles = useDataStreamStore((state) => state.nexus_pmtiles);
  const conus_pmtiles = useDataStreamStore((state) => state.community_pmtiles);

  const set_vpu = useDataStreamStore((state) => state.set_vpu);
  const set_hovered_feature = useFeatureStore((state) => state.set_hovered_feature);
  const hovered_feature = useFeatureStore((state) => state.hovered_feature);
  const set_selected_feature = useFeatureStore((state) => state.set_selected_feature);
  const selectedMapFeature = useFeatureStore((state) => state.selected_feature);

  const currentTimeIndex = useTimeSeriesStore((s) => s.currentTimeIndex);
  const variable = useTimeSeriesStore((s) => s.variable);

  const featureIdToIndex = useVPUStore((s) => s.featureIdToIndex);
  const timesArr = useVPUStore((s) => s.times);
  const valuesByVar = useVPUStore((s) => s.valuesByVar);
  const pathData = useVPUStore((s) => s.pathData);
  const setPathData = useVPUStore((s) => s.setPathData);

  const EMPTY_LAYERS = useMemo(() => [], []);

  const mapRef = useRef(null);
  const lastSigRef = useRef("");

  const mapStyleUrl = getComputedStyle(document.documentElement).getPropertyValue('--map-style-url').trim();


  const deckLayers = useMemo(() => {
    if (!isFlowPathsVisible) return EMPTY_LAYERS;

    const varData = valuesByVar?.[variable];
    const numTimes = timesArr?.length || 0;

    if (!varData || !numTimes || !pathData.length) return EMPTY_LAYERS;

    const bounds = computeBounds(varData);

    return [
      new PathLayer({
        id: "flowpaths-anim",
        data: pathData,
        getPath: (d) => d.path,
        getColor: (d) => {
          const v = getValueAtTimeFlat(varData, numTimes, d.featureIndex, currentTimeIndex);
          return valueToColor(v, bounds);
        },
        getWidth: (d) => {
          const v = getValueAtTimeFlat(varData, numTimes, d.featureIndex, currentTimeIndex);
          if (v === null || v <= -9998) return 2;
          const t = Math.max(0, Math.min(1, (v - bounds.min) / (bounds.max - bounds.min)));
          return 3 + t * 8;
        },
        widthUnits: "pixels",
        widthMinPixels: 2,
        widthMaxPixels: 12,
        capRounded: true,
        jointRounded: true,
        pickable: false,
        updateTriggers: {
          getColor: [currentTimeIndex, variable],
          getWidth: [currentTimeIndex, variable],
        },
      }),
    ];
  }, [isFlowPathsVisible, valuesByVar, variable, timesArr, pathData, currentTimeIndex]);

  const handleMapLoad = useCallback((event) => {
    const map = event.target;
    
    // keep your existing onMapLoad behavior
    const hoverLayers = ["divides", "nexus-points"];
    hoverLayers.forEach((layer) => {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    });
    reorderLayers(map);

  }, []); // deckOverlayRef is a ref; no dep needed

  const onHover = useCallback((event) => {
    if (!enabledHovering) return;

    const { features, lngLat } = event;

    const prev = useFeatureStore.getState().hovered_feature;

    if (!features?.length) {
      if (prev !== null) set_hovered_feature(null);
      return;
    }

    const feature = features[0];
    const layerId = feature.layer.id;

    const hoverId =
      layerId === "divides"
        ? feature.properties?.divide_id
        : feature.properties?.id;

    if (!hoverId) {
      if (prev !== null) set_hovered_feature(null);
      return;
    }

    if (prev?.hoverId === hoverId) return;

    const next = {
      ...feature.properties,
      hoverId,
      longitude: lngLat.lng,
      latitude: lngLat.lat,
    };

    set_hovered_feature(next);
  }, [enabledHovering, set_hovered_feature]);


  // --- Use extracted layer hooks ---
  const catchmentLayer = useCatchmentLayers({
    isCatchmentsVisible,
    selectedFeatureId,
    dividesOutlineColor,
    dividesHighlightFillColor,
    dividesHighlightOutlineColor,
  });

  const flowPathsLayer = useFlowPathsLayer({
    isFlowPathsVisible,
    flowpathsLineColor,
  });

  const conusGaugesLayer = useConusGaugesLayer({
    isConusGaugesVisible,
    gaugesCircleColor,
  });

  const nexusLayers = useNexusLayers({
    isNexusVisible,
    selectedFeatureId,
    nexusCircleColor,
    nexusStrokeColor,
    nexusHighlightCircleColor,
  });

  useEffect(() => {
    const protocol = new Protocol({ metadata: true });
    maplibregl.addProtocol('pmtiles', protocol.tile);

    const map = mapRef.current && mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map) return;

    return () => {
      maplibregl.removeProtocol('pmtiles');
    };
  }, []);

  useEffect(() => {
    const map =
      mapRef.current && mapRef.current.getMap
        ? mapRef.current.getMap()
        : mapRef.current;

    if (!map) return;

    reorderLayers(map);
  }, [isNexusVisible, isCatchmentsVisible, isFlowPathsVisible, isConusGaugesVisible]);

 
  useEffect(() => {
    const map =
      mapRef.current && mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map) return;

    const hasIndex = featureIdToIndex && Object.keys(featureIdToIndex).length > 0;
    if (!hasIndex) return;

    let raf = null;

    const run = () => {

      // cancel any queued run and schedule at next animation frame
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!isFlowPathsVisible) return;
        const feats = map.queryRenderedFeatures({ layers: ["flowpaths"] });

        const matched = feats.filter(
          (f) => featureIdToIndex[f.properties?.id] !== undefined
        );

        const sig = flowpathsSignature(matched);
        if (sig === lastSigRef.current) {
          raf = null;
          return;
        }
        lastSigRef.current = sig;
        const next = convertFeaturesToPaths(matched, featureIdToIndex);
        setPathData(next);

        raf = null;
      });
    };

    map.once("idle", run);
    map.on("moveend", run);
    map.on("zoomend", run);
  
    return () => {
      if (raf) cancelAnimationFrame(raf);
      map.off("moveend", run);
      map.off("zoomend", run);
      map.off("idle", run);
    };
  }, [featureIdToIndex, setPathData, isFlowPathsVisible]);



  useEffect(() => {
    if (!selectedMapFeature) return;

    const map =
      mapRef.current && mapRef.current.getMap
        ? mapRef.current.getMap()
        : mapRef.current;

    if (!map) return;

    const lat = selectedMapFeature.lat || selectedMapFeature.latitude;
    const lon = selectedMapFeature.lon || selectedMapFeature.longitude;
    map.flyTo({
      center: [lon, lat],
      zoom: 11,
      essential: true,
    });
  }, [selectedMapFeature]);


  const layersToQuery = useMemo(() => {
    const layers = [];
    if (isNexusVisible) layers.push('nexus-points');
    if (isCatchmentsVisible) layers.push('divides');
    return layers;
  }, [isNexusVisible, isCatchmentsVisible]);

  const handleMapClick = async (event) => {
   if (loading) {
      set_loading_text('Data is already loading, please wait...');
      set_loading_text('');
      return;
    }
    reset();

    const map = event.target;

    if (layersToQuery.length === 0) return;

    const features = map.queryRenderedFeatures(event.point, {
      layers: layersToQuery,
    });
    if (!features || !features.length) return;

    for (const feature of features) {
      const layerId = feature.layer.id;
      console.log('Clicked feature on layer:', layerId, feature);
      const {lon, lat} = getCentroid(feature);
      set_selected_feature({
        latitude: lat,
        longitude: lon,
        ...feature.properties,
      });
      const featureIdProperty = layerIdToFeatureType(layerId);
      const unbiased_id = feature.properties[featureIdProperty];
      set_feature_id(unbiased_id);
      const vpu_str = `VPU_${feature.properties.vpuid}`;
      set_vpu(vpu_str);
      break;
    }
  };

  return (
    <Map
      ref={mapRef}
      initialViewState={{ longitude: -96, latitude: 40, zoom: 4 }}
      style={{ width: '100%', height: '100%' }}
      mapLib={maplibregl}
      mapStyle={mapStyleUrl}
      onClick={handleMapClick}
      onLoad={handleMapLoad}
      onMouseMove={onHover}
      interactiveLayerIds={['divides', 'nexus-points', 'flowpaths', 'conus-gauges']}
    >
      <Source key="conus" id="conus" type="vector" url={`pmtiles://${conus_pmtiles}`}>
        {catchmentLayer}
        {flowPathsLayer}
        {conusGaugesLayer}
      </Source>

      <Source key="nexus" id="nexus" type="vector" url={`pmtiles://${nexus_pmtiles}`}>
        {nexusLayers}
      </Source>
      <DeckGLOverlay layers={deckLayers} interleaved />
      <CustomPopUp hovered_feature={hovered_feature} enabledHovering={enabledHovering} />
    </Map>
  );
};


const MapComponent = React.memo(MainMap);

MapComponent.whyDidYouRender = true;
export default MapComponent;

