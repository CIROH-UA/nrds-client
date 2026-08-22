import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useShallow } from 'zustand/react/shallow';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer } from "@deck.gl/layers";
import Map, { Source, useControl, useMap } from 'react-map-gl/maplibre';
import { Protocol } from 'pmtiles';
import { IoLocateOutline } from 'react-icons/io5';
import useTimeSeriesStore from '../../store/Timeseries';
import useDataStreamStore from '../../store/Datastream';
import { useVPUStore } from '../../store/VPU';
import { useLayersStore, useFeatureStore } from '../../store/Layers';
import CustomPopUp from './Popup';
import {
  reorderLayers,
  computeBounds,
} from '../../lib/layers';
import { useMapTheme } from '../../lib/mapTheme';
import { createPointerCursor } from '../../lib/mapCursor';
import { animationIsOnMap, quantiseZoom } from '../../lib/flowpaths';
import { selectionLngLat } from '../../lib/layers';
import {
  DIVIDES_MIN_ZOOM,
  FLOWPATHS_LAYER_ID,
  clickableLayerIds,
  FLOWPATHS_MIN_ZOOM,
  addPaths,
  createPathStore,
  hideStyleFlowpaths,
  setVpuVisibility,
} from '../../lib/layers';
import { flowPathLayerProps, shouldPromptZoom } from './flowPathLayer';
import { ValueLegend } from './ValueLegend';
import { TimeSlider } from '../forecast/TimeSlider';
import { selectMapFeature } from '../../actions/selectFeature';
import { hoveredFeatureOf, pickHoverFeature } from '../../actions/hoverFeature';

import {
  useCatchmentLayers,
  useFlowPathsLayer,
  useFlowPathsHighlightLayer,
  useConusGaugesLayer,
} from './MapLayers';
import { MapHint, RecentreButton, TimeSliderDock } from '../styles/Styles';

const INITIAL_VIEW = { longitude: -96, latitude: 40, zoom: 4 };
// Where a selection is shown from. The catchment fill only reaches full opacity at zoom 11.
const SELECTION_ZOOM = 11;

// Half-width of the hover hit box. A flowpath renders two pixels wide, so an exact-pixel query
// is a target most people cannot hit, and one react-map-gl's own query missed outright.
const HOVER_TOLERANCE_PX = 4;
const EMPTY_PATHS = [];


function DeckGLOverlay(props) {
  const overlay = useControl(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

const NO_LAYERS = [];

/**
 * The flowpath animation, isolated so that stepping through time re-renders only this.
 *
 * currentTimeIndex advances on an interval while playing. Reading it in MainMap re-ran that
 * whole component every frame, including a getComputedStyle call and every hook in it. The
 * frame index is read here instead, and nothing above this needs to re-render to animate.
 */
const FlowPathsOverlay = React.memo(function FlowPathsOverlay({
  visible,
  valuesByVar,
  timesArr,
  variable,
  bounds,
  pathDataRef,
  pathTick,
  getCursor,
  ramp,
}) {
  const currentTimeIndex = useTimeSeriesStore((s) => s.currentTimeIndex);

  // Zoom read here, not passed down, so only this component re-renders as it changes.
  const { current: mapRef } = useMap();
  const [zoom, setZoom] = useState(() => quantiseZoom(mapRef?.getZoom?.() ?? 0));

  useEffect(() => {
    const map = mapRef?.getMap?.();
    if (!map) return undefined;
    // Quantised: 'zoom' fires per frame of a gesture, for a width that has barely moved.
    const onZoom = () => setZoom(quantiseZoom(map.getZoom()));
    onZoom();
    map.on('zoom', onZoom);
    return () => map.off('zoom', onZoom);
  }, [mapRef]);

  const layers = useMemo(() => {
    const props = flowPathLayerProps({
      visible,
      valuesByVar,
      timesArr,
      variable,
      bounds,
      pathData: pathDataRef.current,
      currentTimeIndex,
      pathTick,
      zoom,
      ramp,
    });
    return props ? [new PathLayer(props)] : NO_LAYERS;
  }, [visible, valuesByVar, bounds, variable, timesArr, currentTimeIndex, pathTick, pathDataRef, zoom, ramp]);

  return <DeckGLOverlay layers={layers} interleaved getCursor={getCursor} />;
});

FlowPathsOverlay.propTypes = {
  getCursor: PropTypes.func,
  visible: PropTypes.bool,
  valuesByVar: PropTypes.object,
  timesArr: PropTypes.array,
  variable: PropTypes.string,
  bounds: PropTypes.shape({ min: PropTypes.number, max: PropTypes.number }),
  pathDataRef: PropTypes.shape({ current: PropTypes.array }).isRequired,
  pathTick: PropTypes.number,
  ramp: PropTypes.arrayOf(PropTypes.array),
};

const MainMap = () => {
  const { 
    isCatchmentsVisible, 
    isFlowPathsVisible, 
    isConusGaugesVisible, 
    isVpuVisible,
    enabledHovering 
  } = useLayersStore(
    useShallow((s) => ({
      isCatchmentsVisible: s.catchments.visible,
      isFlowPathsVisible: s.flowpaths.visible,
      isConusGaugesVisible: s.conus_gauges.visible,
      isVpuVisible: s.vpu.visible,
      enabledHovering: s.hovered_enabled,
    }))
  );
  const selectedFeatureId = useTimeSeriesStore((s) => s.feature_id);


  const {
    conus_pmtiles,
    flowpaths_pmtiles,
  } = useDataStreamStore(
    useShallow((s) => ({
      conus_pmtiles: s.community_pmtiles,
      flowpaths_pmtiles: s.flowpaths_pmtiles,
    }))
  );

  // The slider goes with the animation it drives; see animationIsOnMap in lib/flowpaths.js.
  const animationTimes = useVPUStore((s) => s.times);
  const sliderDocked = animationIsOnMap({
    times: animationTimes,
    flowpathsVisible: isFlowPathsVisible,
  });

  const { set_hovered_feature, selectedMapFeature, hovered_feature } = useFeatureStore(
    useShallow((s) => ({
      set_hovered_feature: s.set_hovered_feature,
      selectedMapFeature: s.selected_feature,
      hovered_feature: s.hovered_feature,
    }))
  );


  const variable = useTimeSeriesStore((s) => s.variable);

  const { featureIdToIndex, timesArr, valuesByVar } = useVPUStore(
    useShallow((s) => ({
      featureIdToIndex: s.featureIdToIndex,
      timesArr: s.times,
      valuesByVar: s.valuesByVar?.[variable],
    }))
  );


  // Read live: tokens resolve late, so a module-load snapshot got the wrong theme.
  const mapTheme = useMapTheme();

  const mapRef = useRef(null);
  const hoverMapRef = useRef(null);
  const pathsByIdRef = useRef(createPathStore());
  const pathDataRef = useRef(EMPTY_PATHS);

  const [pathTick, setPathTick] = useState(0);
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom);
  const [mapReady, setMapReady] = useState(false);

  // One computation for both the layer and its legend: they must describe the same ramp.
  const colorBounds = useMemo(
    () => (valuesByVar ? computeBounds(valuesByVar) : null),
    [valuesByVar]
  );

  // pathTick is what re-renders this, so reading the ref during render is current.
  const belowFlowpathZoom = shouldPromptZoom({
    visible: isFlowPathsVisible,
    valuesByVar,
    timesArr,
    zoom,
    collectedPaths: pathDataRef.current.length,
  });

  const selectionAt = useMemo(() => selectionLngLat(selectedMapFeature), [selectedMapFeature]);

  const zoomToFlowpaths = useCallback(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map) return;

    // Toward the selection when there is one, since the data's location is the question.
    if (selectionAt) {
      map.flyTo({ center: selectionAt, zoom: FLOWPATHS_MIN_ZOOM + 1, essential: true });
      return;
    }
    map.easeTo({ zoom: FLOWPATHS_MIN_ZOOM + 1, essential: true });
  }, [selectionAt, mapRef]);

  /**
   * Put the selected catchment back on screen.
   *
   * SELECTION_ZOOM rather than the current one: the catchment fill only reaches full opacity at
   * zoom 11, so returning at whatever zoom the reader had drifted to could centre them on a
   * highlight they still cannot see.
   */
  const flyToSelection = useCallback(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map || !selectionAt) return;
    map.flyTo({ center: selectionAt, zoom: SELECTION_ZOOM, essential: true });
  }, [selectionAt, mapRef]);



  // Catchments only; a reach is reached by clicking the catchment it runs through.
  const clickableLayers = useMemo(
    () => clickableLayerIds({ isCatchmentsVisible }),
    [isCatchmentsVisible]
  );


  const isMapUsable = useCallback((map) => {
    if (!map || typeof map.on !== "function" || typeof map.off !== "function") return false;
    if (typeof map.getCanvas !== "function") return false;
    try {
      return !!map.getCanvas();
    } catch {
      return false;
    }
  }, []);

  // One owner for the pointer cursor, shared with deck.gl; see lib/mapCursor.js.
  const pointerCursor = useRef(null);
  if (!pointerCursor.current) pointerCursor.current = createPointerCursor();

  const getCursor = useCallback((info) => pointerCursor.current.cursorFor(info), []);
  const setPointerCursor = useCallback((e) => pointerCursor.current.enter(e), []);
  const resetPointerCursor = useCallback((e) => pointerCursor.current.leave(e), []);

  const removeHoverListeners = useCallback((map, layers) => {
    if (!isMapUsable(map)) return;
    layers.forEach((layer) => {
      map.off("mouseenter", layer, setPointerCursor);
      map.off("mouseleave", layer, resetPointerCursor);
    });
  }, [isMapUsable, setPointerCursor, resetPointerCursor]);

  // State, not a ref: the cursor effect below has to re-run when the map arrives.
  const handleMapLoad = useCallback((event) => {
    const map = event.target;
    if (!isMapUsable(map)) return;

    hoverMapRef.current = map;
    hideStyleFlowpaths(map);
    setVpuVisibility(map, useLayersStore.getState().vpu.visible);
    reorderLayers(map);
    setMapReady(true);
  }, [isMapUsable]);

  // Re-registered whenever the clickable set changes, so the cleanup removes exactly this run's.
  useEffect(() => {
    const map = hoverMapRef.current;
    if (!mapReady || !isMapUsable(map)) return undefined;

    removeHoverListeners(map, clickableLayers);
    pointerCursor.current.reset(map);
    clickableLayers.forEach((layer) => {
      map.on("mouseenter", layer, setPointerCursor);
      map.on("mouseleave", layer, resetPointerCursor);
    });
    return () => removeHoverListeners(map, clickableLayers);
  }, [mapReady, clickableLayers, isMapUsable, removeHoverListeners, setPointerCursor, resetPointerCursor]);

  // Only layers on the map: queryRenderedFeatures refuses the whole call if one is missing.
  const hoverableLayerIds = useMemo(() => {
    const ids = [];
    if (isCatchmentsVisible) ids.push('divides');
    if (isFlowPathsVisible) ids.push(FLOWPATHS_LAYER_ID);
    if (isConusGaugesVisible) ids.push('conus-gauges');
    return ids;
  }, [isCatchmentsVisible, isFlowPathsVisible, isConusGaugesVisible]);

  // Asked of the live map with tolerance; event.features queries one pixel and misses reaches.
  const featuresUnder = useCallback((point) => {
    // react-map-gl's event.target need not be the maplibre map; this lookup always is.
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map?.getLayer || !point) return [];
    const ids = hoverableLayerIds.filter((id) => map.getLayer(id));
    // An empty list would query the whole style rather than nothing.
    if (!ids.length) return [];
    const box = [
      [point.x - HOVER_TOLERANCE_PX, point.y - HOVER_TOLERANCE_PX],
      [point.x + HOVER_TOLERANCE_PX, point.y + HOVER_TOLERANCE_PX],
    ];
    try {
      return map.queryRenderedFeatures(box, { layers: ids });
    } catch {
      return [];
    }
  }, [hoverableLayerIds]);

  const onHover = useCallback((event) => {
    if (!enabledHovering) return;

    const { lngLat } = event;
    const features = featuresUnder(event.point);

    const prev = useFeatureStore.getState().hovered_feature;

    if (!features?.length) {
      if (prev !== null) set_hovered_feature(null);
      return;
    }

    const next = hoveredFeatureOf(pickHoverFeature(features), lngLat);
    if (!next) {
      if (prev !== null) set_hovered_feature(null);
      return;
    }

    if (prev?.hoverId === next.hoverId) return;
    set_hovered_feature(next);
  }, [enabledHovering, featuresUnder, set_hovered_feature]);


  const catchmentLayer = useCatchmentLayers({
    isCatchmentsVisible,
    selectedFeatureId,
    dividesOutlineColor: mapTheme.dividesOutline,
    dividesHighlightFillColor: mapTheme.dividesHighlightFill,
    dividesHighlightOutlineColor: mapTheme.dividesHighlightOutline,
  });

  const flowPathsLayer = useFlowPathsLayer({
    isFlowPathsVisible,
    flowpathsLineColor: mapTheme.flowpaths,
  });

  const flowPathsHighlightLayer = useFlowPathsHighlightLayer({
    isFlowPathsVisible,
    selectedFeatureId,
    color: mapTheme.dividesHighlightOutline,
  });

  const conusGaugesLayer = useConusGaugesLayer({
    isConusGaugesVisible,
    gaugesCircleColor: mapTheme.gauges,
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
  }, [isCatchmentsVisible, isFlowPathsVisible, isConusGaugesVisible]);

  // The vpu outlines live in the basemap style, so this reaches in rather than mounting a Layer.
  useEffect(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    setVpuVisibility(map, isVpuVisible);
  }, [isVpuVisible]);

 
  // Dropped per vpu: featureIndex points into that vpu's flat array and nothing else's.
  useEffect(() => {
    pathsByIdRef.current = createPathStore();
    pathDataRef.current = EMPTY_PATHS;
    setPathTick((t) => t + 1);
  }, [featureIdToIndex]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map) return;

    const hasIndex = featureIdToIndex && Object.keys(featureIdToIndex).length > 0;
    if (!hasIndex) return;

    let raf = null;

    const run = () => {
      if (raf) cancelAnimationFrame(raf);

      raf = requestAnimationFrame(() => {
        raf = null;
        if (!isFlowPathsVisible) return;

        // Handed over whole: addPaths alone decides what a feature's id is.
        const feats = map.queryRenderedFeatures({ layers: [FLOWPATHS_LAYER_ID] });

        // Accumulated and zoom-tagged: geometry outlives its view, a closer look replaces it.
        const added = addPaths(pathsByIdRef.current, feats, featureIdToIndex, map.getZoom());
        if (!added) return;

        pathDataRef.current = [...pathsByIdRef.current.values()];
        setPathTick((t) => t + 1);
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


  // Selecting something moves the map to it; the button below does the same thing on demand.
  useEffect(() => {
    flyToSelection();
  }, [flyToSelection]);


  // The same list the cursor uses, so what invites a click and what answers one cannot drift.
  const layersToQuery = clickableLayers;


  // A popup outliving the layer it describes has to go.
  useEffect(() => {
    if (useFeatureStore.getState().hovered_feature !== null) set_hovered_feature(null);
  }, [hoverableLayerIds, set_hovered_feature]);

  const handleMapClick = async (event) => {
    // Deliberately unguarded by loading: a newer load supersedes an older one.
    const map = event.target;

    if (layersToQuery.length === 0) return;

    const features = map.queryRenderedFeatures(event.point, {
      layers: layersToQuery,
    });
    if (!features || !features.length) {
      // Nothing to hit rather than a missed aim: no catchment geometry exists below this zoom.
      if (map.getZoom() < DIVIDES_MIN_ZOOM) {
        useTimeSeriesStore.setState({
          loadingText: `Zoom in past ${DIVIDES_MIN_ZOOM} to select a catchment`,
          last_error: { kind: 'zoom-required' },
        });
      }
      return;
    }

    const [feature] = features;
    selectMapFeature(feature, feature.layer.id);
  };

  return (
    <Map
      ref={mapRef}
      initialViewState={INITIAL_VIEW}
      style={{ width: '100%', height: '100%' }}
      mapLib={maplibregl}
      mapStyle={mapTheme.styleUrl}
      onClick={handleMapClick}
      onLoad={handleMapLoad}
      // No interactiveLayerIds: it would add a second query per pointer move that onHover ignores.
      onMouseMove={onHover}
      onZoomEnd={(e) => setZoom(e.viewState.zoom)}
    >
      <Source
        key="flowpath-geometry"
        id="flowpath-geometry"
        type="vector"
        url={`pmtiles://${flowpaths_pmtiles}`}
      >
        {flowPathsLayer}
        {flowPathsHighlightLayer}
      </Source>

      <Source key="conus" id="conus" type="vector" url={`pmtiles://${conus_pmtiles}`}>
        {catchmentLayer}
        {conusGaugesLayer}
      </Source>

      <FlowPathsOverlay
        getCursor={getCursor}
        ramp={mapTheme.ramp}
        visible={isFlowPathsVisible}
        valuesByVar={valuesByVar}
        timesArr={timesArr}
        variable={variable}
        bounds={colorBounds}
        pathDataRef={pathDataRef}
        pathTick={pathTick}
      />
      {sliderDocked && (
        <TimeSliderDock>
          <TimeSlider />
        </TimeSliderDock>
      )}
      <ValueLegend
        bounds={colorBounds}
        ramp={mapTheme.ramp}
        variable={variable}
        visible={isFlowPathsVisible && Boolean(colorBounds) && (timesArr?.length || 0) > 0}
      />
      {selectionAt && (
        <RecentreButton
          type="button"
          onClick={flyToSelection}
          aria-label="Show the selected catchment"
          title="Show the selected catchment"
        >
          <IoLocateOutline size={18} aria-hidden="true" />
          <span>Selected</span>
        </RecentreButton>
      )}
      <CustomPopUp hovered_feature={hovered_feature} enabledHovering={enabledHovering} />
      {belowFlowpathZoom && (
        <MapHint type="button" $raised={sliderDocked} onClick={zoomToFlowpaths}>
          Flowpaths are only mapped from zoom {FLOWPATHS_MIN_ZOOM}. Zoom in to see the animation.
        </MapHint>
      )}
    </Map>
  );
};


const MapComponent = React.memo(MainMap);

export default MapComponent;
