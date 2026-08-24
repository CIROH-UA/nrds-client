import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useShallow } from 'zustand/react/shallow';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer } from "@deck.gl/layers";
import Map, {
  NavigationControl,
  ScaleControl,
  Source,
  useControl,
  useMap,
} from 'react-map-gl/maplibre';
import { Protocol } from 'pmtiles';
import useTimeSeriesStore from '../../store/Timeseries';
import useDataStreamStore from '../../store/Datastream';
import { useVPUStore } from '../../store/VPU';
import { useLayersStore, useFeatureStore } from '../../store/Layers';
import CustomPopUp from './Popup';
import { SelectedFeaturePopup } from './SelectedFeaturePopup';
import {
  DIVIDES_MIN_ZOOM,
  FLOWPATHS_LAYER_ID,
  FLOWPATHS_MIN_ZOOM,
  addPaths,
  boundsFor,
  clickableLayerIds,
  createPathStore,
  hideStyleFlowpaths,
  reorderLayers,
  selectionLngLat,
  setVpuVisibility,
} from '../../lib/layers';
import { useMapTheme } from '../../lib/mapTheme';
import { createPointerCursor } from '../../lib/mapCursor';
import {
  animationIsOnMap,
  onMapSettled,
  quantiseZoom,
  useVisiblePaths,
} from '../../lib/flowpaths';
import { releaseMapHandle, setMapHandle } from '../../lib/mapHandle';
import { useShowSelectionOnChange } from '../../actions/showSelection';
import { flowPathLayerProps, shouldPromptZoom } from './flowPathLayer';
import { TimeSlider } from '../forecast/TimeSlider';
import { selectMapFeature } from '../../actions/selectFeature';
import { hoveredFeatureOf, pickHoverFeature } from '../../actions/hoverFeature';

import {
  useCatchmentLayers,
  useFlowPathsLayer,
  useFlowPathsHighlightLayer,
  useConusGaugesLayer,
} from './MapLayers';
import { MapHint, TimeSliderDock } from '../styles/Styles';

const INITIAL_VIEW = { longitude: -96, latitude: 40, zoom: 4 };

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
/**
 * Zoom is read here rather than passed down, so only this component re-renders as it changes,
 * and it is quantised because maplibre's 'zoom' fires per frame of a gesture for a width that
 * has barely moved.
 *
 * The visible set is filtered once per zoom step and per new-geometry tick. The layer memo below
 * also depends on the frame index, so filtering inline handed deck.gl a fresh array every tick
 * and made it rebuild the whole dataset.
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

  const { current: mapRef } = useMap();
  const [zoom, setZoom] = useState(() => quantiseZoom(mapRef?.getZoom?.() ?? 0));

  useEffect(() => {
    const map = mapRef?.getMap?.();
    if (!map) return undefined;
    const onZoom = () => setZoom(quantiseZoom(map.getZoom()));
    onZoom();
    map.on('zoom', onZoom);
    return () => map.off('zoom', onZoom);
  }, [mapRef]);

  const visiblePaths = useVisiblePaths(pathDataRef, zoom, pathTick);

  const layers = useMemo(() => {
    const props = flowPathLayerProps({
      visible,
      valuesByVar,
      timesArr,
      variable,
      bounds,
      pathData: visiblePaths,
      currentTimeIndex,
      pathTick,
      zoom,
      ramp,
    });
    return props ? [new PathLayer(props)] : NO_LAYERS;
  }, [visible, valuesByVar, bounds, variable, timesArr, currentTimeIndex, visiblePaths, zoom, ramp]);

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

/**
 * The map and everything docked to it.
 *
 * The theme is read live rather than snapshotted at module load: the tokens resolve late, so a
 * snapshot got the wrong theme. The colour bounds are literally the same object the legend
 * reads, so the two cannot describe different ramps.
 *
 * The zoom prompt is memoised because below FLOWPATHS_MIN_ZOOM it scans the whole path store,
 * which is never pruned -- unmemoised it ran again for every hover, selection and layer toggle.
 *
 * The slider is docked on whether the animation is on the map, not on whether a vpu is selected;
 * see animationIsOnMap in lib/flowpaths.js.
 */
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


  const mapTheme = useMapTheme();

  const mapRef = useRef(null);
  const hoverMapRef = useRef(null);
  const pathsByIdRef = useRef(createPathStore());
  const pathDataRef = useRef(EMPTY_PATHS);

  const [pathTick, setPathTick] = useState(0);
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom);
  const [mapReady, setMapReady] = useState(false);

  const colorBounds = useMemo(() => boundsFor(valuesByVar), [valuesByVar]);

  const belowFlowpathZoom = useMemo(
    () => shouldPromptZoom({
      visible: isFlowPathsVisible,
      valuesByVar,
      timesArr,
      zoom,
      paths: pathDataRef.current,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathTick stands in for the ref
    [isFlowPathsVisible, valuesByVar, timesArr, zoom, pathTick],
  );

  const selectionAt = useMemo(() => selectionLngLat(selectedMapFeature), [selectedMapFeature]);

  const zoomToFlowpaths = useCallback(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map) return;

    if (selectionAt) {
      map.flyTo({ center: selectionAt, zoom: FLOWPATHS_MIN_ZOOM + 1, essential: true });
      return;
    }
    map.easeTo({ zoom: FLOWPATHS_MIN_ZOOM + 1, essential: true });
  }, [selectionAt, mapRef]);

  useShowSelectionOnChange();



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

  const handleMapLoad = useCallback((event) => {
    const map = event.target;
    if (!isMapUsable(map)) return;

    hoverMapRef.current = map;
    setMapHandle(map);
    hideStyleFlowpaths(map);
    setVpuVisibility(map, useLayersStore.getState().vpu.visible);
    reorderLayers(map);
    setMapReady(true);
  }, [isMapUsable]);

  useEffect(() => () => releaseMapHandle(hoverMapRef.current), []);

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

  const hoverableLayerIds = useMemo(() => {
    const ids = [];
    if (isCatchmentsVisible) ids.push('divides');
    if (isFlowPathsVisible) ids.push(FLOWPATHS_LAYER_ID);
    if (isConusGaugesVisible) ids.push('conus-gauges');
    return ids;
  }, [isCatchmentsVisible, isFlowPathsVisible, isConusGaugesVisible]);

  const featuresUnder = useCallback((point) => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map?.getLayer || !point) return [];
    const ids = hoverableLayerIds.filter((id) => map.getLayer(id));
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

  useEffect(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    setVpuVisibility(map, isVpuVisible);
  }, [isVpuVisible]);

 
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

        const feats = map.queryRenderedFeatures({ layers: [FLOWPATHS_LAYER_ID] });

        const added = addPaths(pathsByIdRef.current, feats, featureIdToIndex, map.getZoom());
        if (!added) return;

        pathDataRef.current = [...pathsByIdRef.current.values()];
        setPathTick((t) => t + 1);
      });
    };

    const unsubscribe = onMapSettled(map, run);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsubscribe();
    };
  }, [featureIdToIndex, isFlowPathsVisible]);





  const layersToQuery = clickableLayers;


  useEffect(() => {
    if (useFeatureStore.getState().hovered_feature !== null) set_hovered_feature(null);
  }, [hoverableLayerIds, set_hovered_feature]);

  const handleMapClick = async (event) => {
    const map = event.target;

    if (layersToQuery.length === 0) return;

    const features = map.queryRenderedFeatures(event.point, {
      layers: layersToQuery,
    });
    if (!features || !features.length) {
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
      <NavigationControl position="bottom-right" showCompass={false} />
      <ScaleControl position="bottom-right" unit="metric" />
      <SelectedFeaturePopup />
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
