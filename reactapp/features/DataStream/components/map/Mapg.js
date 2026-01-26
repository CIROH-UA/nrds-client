// MapComponent.jcacheKeys
import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer } from "@deck.gl/layers";
import Map, { Source, Popup } from 'react-map-gl/maplibre';
import { Protocol } from 'pmtiles';
import useTimeSeriesStore from '../../store/Timeseries';
import useDataStreamStore from '../../store/Datastream';
import { useVPUStore } from '../../store/Layers';
import { useLayersStore, useFeatureStore } from '../../store/Layers';
import { PopupContent } from '../styles/Styles';
import { 
  mapStyleUrl,
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
import { getCentroid } from '../../lib/layers';

import {
  useCatchmentLayers,
  useFlowPathsLayer,
  useConusGaugesLayer,
  useNexusLayers,
} from './MapLayers';


const MapComponent = () => {
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
  const deckOverlayRef = useRef(null);


  const mapRef = useRef(null);



const handleMapLoad = useCallback((event) => {
  const map = event.target;
  
  // keep your existing onMapLoad behavior
  const hoverLayers = ["divides", "nexus-points"];
  hoverLayers.forEach((layer) => {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  });
  reorderLayers(map);

  // init deck overlay once, when map is guaranteed to exist
  if (!deckOverlayRef.current) {
    deckOverlayRef.current = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(deckOverlayRef.current);
  }
}, []); // deckOverlayRef is a ref; no dep needed

  const onHover = useCallback(
    (event) => {
      if (!enabledHovering) {
        set_hovered_feature({});
        return;
      }
      const { features, lngLat } = event;

      if (!features || features.length === 0) {
        set_hovered_feature({});
        return;
      }

      const feature = features[0];
      const layerId = feature.layer.id;

      let id =
        layerId === 'divides'
          ? feature.properties?.divide_id
          : feature.properties?.id;

      if (!id) {
        set_hovered_feature({});
        return;
      }

      set_hovered_feature({
        longitude: lngLat.lng,
        latitude: lngLat.lat,
        ...feature.properties,
      });
    },
    [set_hovered_feature, enabledHovering]
  );

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

    if (!deckOverlayRef.current) {
      deckOverlayRef.current = new MapboxOverlay({ interleaved: false, layers: [] });
      map.addControl(deckOverlayRef.current);
    }

    return () => {
      maplibregl.removeProtocol('pmtiles');
      if (deckOverlayRef.current) {
        deckOverlayRef.current.finalize?.();
        map.removeControl(deckOverlayRef.current);
        deckOverlayRef.current = null;
      }
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

      setPathData(convertFeaturesToPaths(matched, featureIdToIndex));
      raf = null;
    });
  };

  // initial fill once map is ready
  map.once("idle", run);

  // update when the view changes (zoom/pan)
  map.on("moveend", run);
  map.on("zoomend", run);

  // also update when new tiles load after moving/zooming
  map.on("idle", run);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    map.off("moveend", run);
    map.off("zoomend", run);
    map.off("idle", run);
  };
}, [featureIdToIndex, setPathData]);



  useEffect(() => {
    if (!deckOverlayRef.current) return;

    if (!isFlowPathsVisible) {
      deckOverlayRef.current.setProps({ layers: [] });
      return;
    }

    const varData = valuesByVar?.[variable];
    const numTimes = timesArr?.length || 0;

    if (!varData || !numTimes || !pathData.length) {
      console.log("deck clear layers");
      deckOverlayRef.current.setProps({ layers: [] });
      return;
    }

    const bounds = computeBounds(varData);

    const layer = new PathLayer({
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
    });

    deckOverlayRef.current.setProps({ layers: [layer] });
  }, [isFlowPathsVisible, valuesByVar, variable, timesArr, pathData, currentTimeIndex]);



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

      {hovered_feature?.id && (
        <Popup
          longitude={hovered_feature.longitude}
          latitude={hovered_feature.latitude}
          offset={[0, -10]}
          closeButton={false}
        >
          <PopupContent>
            <div className="popup-title">Feature</div>
            {Object.keys(hovered_feature).map((key) => (
              <div className="popup-row" key={key}>
                <span className="popup-label">{key}</span>
                <span className="popup-value">{hovered_feature[key]}</span>
              </div>
            ))}
          </PopupContent>
        </Popup>
      )}
    </Map>
  );
};

export default MapComponent;

