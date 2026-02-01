import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
  const { 
    isNexusVisible, 
    isCatchmentsVisible, 
    isFlowPathsVisible, 
    isConusGaugesVisible, 
    enabledHovering 
  } = useLayersStore(
    useShallow((s) => ({
      isNexusVisible: s.nexus.visible,
      isCatchmentsVisible: s.catchments.visible,
      isFlowPathsVisible: s.flowpaths.visible,
      isConusGaugesVisible: s.conus_gauges.visible,
      enabledHovering: s.hovered_enabled,
    }))
  );
   const { selectedFeatureId, loading, set_feature_id } = useTimeSeriesStore(
    useShallow((s) => ({
      selectedFeatureId: s.feature_id,
      loading: s.loading,
      set_feature_id: s.set_feature_id,
    }))
  );


  const {
    nexus_pmtiles,
    conus_pmtiles,
    vpu,
    set_vpu,
  } = useDataStreamStore(
    useShallow((s) => ({
      nexus_pmtiles: s.nexus_pmtiles,
      conus_pmtiles: s.community_pmtiles,
      vpu: s.vpu,
      set_vpu: s.set_vpu,
    }))
  );

  const { set_hovered_feature, set_selected_feature, selectedMapFeature, hovered_feature } = useFeatureStore(
    useShallow((s) => ({
      set_hovered_feature: s.set_hovered_feature,
      set_selected_feature: s.set_selected_feature,
      selectedMapFeature: s.selected_feature,
      hovered_feature: s.hovered_feature,
    }))
  );


  const { currentTimeIndex, variable } = useTimeSeriesStore(
    useShallow((s) => ({
      currentTimeIndex: s.currentTimeIndex,
      variable: s.variable,
    }))
  );

  const { featureIdToIndex, timesArr, valuesByVar } = useVPUStore(
    useShallow((s) => ({
      featureIdToIndex: s.featureIdToIndex,
      timesArr: s.times,
      valuesByVar: s.valuesByVar?.[variable],
    }))
  );

  const EMPTY_LAYERS = useMemo(() => [], []);

  const mapRef = useRef(null);
  const lastSigRef = useRef("");
  const pathDataRef = useRef([]);

  const [pathTick, setPathTick] = useState(0);
  const mapStyleUrl = getComputedStyle(document.documentElement).getPropertyValue('--map-style-url').trim();


  const deckLayers = useMemo(() => {
    if (!isFlowPathsVisible) return EMPTY_LAYERS;
    // console.log('Rendering flow paths layer');
    const varData = valuesByVar;
    const numTimes = timesArr?.length || 0;

    const pathData = pathDataRef.current;
    
    if (!varData || !numTimes || !pathData?.length) return EMPTY_LAYERS;
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
          getColor: [currentTimeIndex, variable, pathTick],
          getWidth: [currentTimeIndex, variable, pathTick],
        },
      }),
    ];
  }, [
    isFlowPathsVisible,
    valuesByVar,
    variable,
    timesArr,
    currentTimeIndex,
    pathTick,
  ]);


  const handleMapLoad = useCallback((event) => {
    const map = event.target;
    
    // keep your existing onMapLoad behavior
    const hoverLayers = ["divides", "nexus-points"];
    hoverLayers.forEach((layer) => {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    });
    reorderLayers(map);

  }, []);
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
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map) return;

    const hasIndex = featureIdToIndex && Object.keys(featureIdToIndex).length > 0;
    if (!hasIndex) return;

    let raf = null;

    const run = () => {
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

        pathDataRef.current = convertFeaturesToPaths(matched, featureIdToIndex);
        setPathTick((t) => t + 1);

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
    };
  }, [featureIdToIndex, isFlowPathsVisible]);


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
      return;
    }

    const map = event.target;

    if (layersToQuery.length === 0) return;

    const features = map.queryRenderedFeatures(event.point, {
      layers: layersToQuery,
    });
    if (!features || !features.length) return;

    for (const feature of features) {
      const layerId = feature.layer.id;
      const featureIdProperty = layerIdToFeatureType(layerId);
      const unbiased_id = feature.properties[featureIdProperty];
 
      const {lon, lat} = getCentroid(feature);
      set_selected_feature({
        latitude: lat,
        longitude: lon,
        layerId: layerId,
        _id: unbiased_id,
        ...feature.properties,
      });
      const vpu_str = `VPU_${feature.properties.vpuid}`;
      if (vpu_str === vpu){
        set_feature_id(unbiased_id);
      }
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

export default MapComponent;

