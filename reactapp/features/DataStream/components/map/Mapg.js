import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useShallow } from 'zustand/react/shallow';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer } from "@deck.gl/layers";
import Map, { Source, useControl, useMap } from 'react-map-gl/maplibre';
import { Protocol } from 'pmtiles';
import useTimeSeriesStore from '../../store/Timeseries';
import useDataStreamStore from '../../store/Datastream';
import { useVPUStore } from '../../store/Layers';
import { useLayersStore, useFeatureStore } from '../../store/Layers';
import CustomPopUp from './Popup';
import {
  reorderLayers,
  computeBounds,
} from '../../lib/layers';
import { useMapTheme } from '../../lib/mapTheme';
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
const FlowPathsOverlay = React.memo(function FlowPathsOverlay({
  visible,
  valuesByVar,
  timesArr,
  variable,
  bounds,
  pathDataRef,
  pathTick,
  getCursor,
}) {
  const currentTimeIndex = useTimeSeriesStore((s) => s.currentTimeIndex);

  /**
   * The live zoom, subscribed to here rather than passed down.
   *
   * The animated width follows the static flowpaths' zoom curve, so it has to move with the
   * view, and maplibre only reports zoomend to the map component above -- which would leave the
   * animation frozen at its pre-gesture width for the whole of a pinch while the network under
   * it rescaled continuously. Reading it here keeps the per-frame re-render inside this
   * component, which is the same reason the frame index is read here and not above.
   */
  const { current: mapRef } = useMap();
  const [zoom, setZoom] = useState(() => mapRef?.getZoom?.() ?? 0);

  useEffect(() => {
    const map = mapRef?.getMap?.();
    if (!map) return undefined;
    const onZoom = () => setZoom(map.getZoom());
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
    });
    return props ? [new PathLayer(props)] : NO_LAYERS;
  }, [visible, valuesByVar, bounds, variable, timesArr, currentTimeIndex, pathTick, pathDataRef, zoom]);

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
    vpu,
  } = useDataStreamStore(
    useShallow((s) => ({
      conus_pmtiles: s.community_pmtiles,
      flowpaths_pmtiles: s.flowpaths_pmtiles,
      vpu: s.vpu,
    }))
  );

  /**
   * Whether the time slider is on the map.
   *
   * Once a vpu has been chosen, and for as long as flowpaths are on. Not keyed on the clock
   * itself: a dead transport control on the opening view is clutter, and one that vanishes every
   * time a later load empties the clock reads as breakage. Between those, the slider stays put
   * and disables itself, which is what it already did in the panel.
   */
  const sliderDocked = isFlowPathsVisible && Boolean(vpu);

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


  // Read live, so the basemap and every layer colour follow the theme instead of whatever the
  // tokens happened to resolve to while the module graph was still evaluating.
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

  const zoomToFlowpaths = useCallback(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map) return;

    // Toward the selection when there is one, since the data's location is the question.
    const lat = selectedMapFeature?.lat ?? selectedMapFeature?.latitude;
    const lon = selectedMapFeature?.lon ?? selectedMapFeature?.longitude;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      map.flyTo({ center: [lon, lat], zoom: FLOWPATHS_MIN_ZOOM + 1, essential: true });
      return;
    }
    map.easeTo({ zoom: FLOWPATHS_MIN_ZOOM + 1, essential: true });
  }, [selectedMapFeature]);



  /**
   * The layers a click acts on, and so the ones that get the pointer cursor.
   *
   * Catchments only. A reach is reached by clicking the catchment it runs through, which then
   * highlights it -- see useFlowPathsHighlightLayer. Flowpaths were briefly clickable in their
   * own right; that needed the index to name the vpu, since the archive drops vpuid, and
   * selecting the catchment gets to the same place without the lookup.
   */
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

  /**
   * How many clickable layers the pointer is currently inside.
   *
   * Counted rather than a boolean, following beginLoading/endLoading in actions/loadState.js.
   * maplibre fires mouseenter and mouseleave per layer, so leaving one is not leaving them all:
   * with catchments and flowpaths both registered, a reach's mouseleave cleared the cursor while
   * the reader was still well inside the catchment, and since flowpaths thread through every
   * catchment the pointer spent most of its time reset to grab. Only one layer is registered
   * today, so this cannot bite -- but the whole point of clickableLayerIds is that the list can
   * grow, and it would come straight back.
   */
  const insideClickable = useRef(0);

  /**
   * What the cursor should be, answered for deck.gl rather than written behind its back.
   *
   * The overlay is interleaved, so deck renders into maplibre's own canvas and its
   * _updateCursor writes container.style.cursor on every pointer update, from a getCursor that
   * defaults to grabbing-or-grab. Setting the canvas cursor ourselves was therefore undone on
   * the very next mouse move, which is why the pointer never appeared over a catchment however
   * the listeners were registered. Answering deck's own question instead means the two cannot
   * disagree. The direct writes below stay for immediacy; deck now agrees with them.
   */
  const getCursor = useCallback(
    ({ isDragging }) => {
      if (isDragging) return 'grabbing';
      return insideClickable.current > 0 ? 'pointer' : 'grab';
    },
    []
  );

  const setPointerCursor = useCallback((e) => {
    insideClickable.current += 1;
    const canvas = e?.target?.getCanvas?.();
    if (canvas?.style) canvas.style.cursor = "pointer";
  }, []);

  const resetPointerCursor = useCallback((e) => {
    insideClickable.current = Math.max(0, insideClickable.current - 1);
    if (insideClickable.current > 0) return;
    const canvas = e?.target?.getCanvas?.();
    if (canvas?.style) canvas.style.cursor = "";
  }, []);

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
    hideStyleFlowpaths(map);
    setVpuVisibility(map, useLayersStore.getState().vpu.visible);
    reorderLayers(map);
    // Announces the map to the cursor effect below. A ref cannot do this job: mutating .current
    // is invisible to React's dependency diffing, so an effect watching mapRef would run once at
    // whatever moment it happened to hold and never again.
    setMapReady(true);
  }, [isMapUsable]);

  /**
   * Keep the pointer cursor on whatever is currently clickable.
   *
   * Registered here rather than in the load handler because the set changes: turning catchments
   * off used to leave their listeners attached and turning them back on added a second pair.
   * Re-running on the list means the cleanup removes exactly what this run added.
   */
  useEffect(() => {
    const map = hoverMapRef.current;
    if (!mapReady || !isMapUsable(map)) return undefined;

    removeHoverListeners(map, clickableLayers);
    insideClickable.current = 0;
    clickableLayers.forEach((layer) => {
      map.on("mouseenter", layer, setPointerCursor);
      map.on("mouseleave", layer, resetPointerCursor);
    });
    return () => removeHoverListeners(map, clickableLayers);
  }, [mapReady, clickableLayers, isMapUsable, removeHoverListeners, setPointerCursor, resetPointerCursor]);

  /**
   * The layers hovering may report, which is only the ones currently on the map.
   *
   * This was a fixed list of all four. Turning a layer off removes it from the style, and
   * maplibre's queryRenderedFeatures refuses the whole call when any named layer is missing: it
   * fires an error and returns an empty array. So switching catchments off stopped hovering
   * from reporting anything at all, flowpaths included, because `divides` was still on the list.
   */
  const hoverableLayerIds = useMemo(() => {
    const ids = [];
    if (isCatchmentsVisible) ids.push('divides');
    if (isFlowPathsVisible) ids.push(FLOWPATHS_LAYER_ID);
    if (isConusGaugesVisible) ids.push('conus-gauges');
    return ids;
  }, [isCatchmentsVisible, isFlowPathsVisible, isConusGaugesVisible]);

  /**
   * What is under the pointer, asked of the live map with a few pixels of tolerance.
   *
   * Not event.features. react-map-gl builds that by querying a clone of the transform at the
   * exact pointer pixel, and a flowpath renders two pixels wide: measured at a pixel where the
   * live map reported a flowpath, react-map-gl's own query returned only the catchment beneath
   * it, and with catchments hidden it returned nothing at all. A small box also makes a thin
   * line a target a person can hit rather than one they have to land on exactly.
   */
  const featuresUnder = useCallback((point) => {
    // The same lookup the rest of this component uses, rather than event.target, whose shape is
    // react-map-gl's business and which does not have to be the maplibre map.
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map?.getLayer || !point) return [];
    const ids = hoverableLayerIds.filter((id) => map.getLayer(id));
    // An empty list would query the whole style, and one missing layer makes maplibre refuse
    // the call outright and return nothing.
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

  // The vpu outlines belong to the basemap style, so this reaches into it rather than mounting
  // a Layer. handleMapLoad reapplies it, since changing theme reloads the style from scratch.
  useEffect(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    setVpuVisibility(map, isVpuVisible);
  }, [isVpuVisible]);

 
  // Paths belong to the vpu whose values they are drawn from: featureIndex points into that
  // vpu's flat array, so carrying them over would colour one dataset with another's numbers.
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

        // Handed over whole. This used to pre-filter on properties.id, which duplicated the id
        // resolution addPaths already does and only half of it: merged.pmtiles put the id in
        // properties as wb-2862525, upstream_index puts it on the feature itself and has no
        // properties.id at all, so the filter dropped every feature and nothing was ever
        // collected. One place decides what a feature's id is.
        const feats = map.queryRenderedFeatures({ layers: [FLOWPATHS_LAYER_ID] });

        // Kept, not replaced. This used to hold only what the viewport was rendering, so
        // moving away from a reach dropped it and zooming below the tileset's flowpath minzoom
        // dropped everything, which is why playback over a wide view drew nothing at all.
        // Accumulating means the geometry survives the view that produced it, and deck.gl has
        // no zoom limit of its own, so it keeps drawing at any scale.
        // Tagged with the zoom it was read at, so a closer look replaces a coarser capture.
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


  useEffect(() => {
    if (!selectedMapFeature) return;

    const map =
      mapRef.current && mapRef.current.getMap
        ? mapRef.current.getMap()
        : mapRef.current;

    if (!map) return;

    // ?? not ||, so a feature on the equator or the prime meridian keeps its real coordinate.
    const lat = selectedMapFeature.lat ?? selectedMapFeature.latitude;
    const lon = selectedMapFeature.lon ?? selectedMapFeature.longitude;
    // Without this a geometry we cannot place flies the map to 0,0, off the coast of Africa.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    map.flyTo({
      center: [lon, lat],
      zoom: 11,
      essential: true,
    });
  }, [selectedMapFeature]);


  // The same list the cursor uses, so what invites a click and what answers one cannot drift.
  const layersToQuery = clickableLayers;


  // A popup describing a layer that is no longer shown has to go. Toggling catchments off left
  // the last catchment's popup on screen, still attached to a layer the reader had just hidden.
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
      // Nothing to hit rather than a missed aim: no catchment geometry exists below this zoom,
      // so the map looks identical and every click is silently ignored.
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
      // No interactiveLayerIds: react-map-gl uses it to build event.features, which means a
      // second queryRenderedFeatures on every pointer move, and onHover ignores that in favour
      // of its own box query. The pointer cursor comes from the mouseenter/mouseleave listeners
      // registered in handleMapLoad, not from this prop.
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
        variable={variable}
        visible={isFlowPathsVisible && Boolean(colorBounds) && (timesArr?.length || 0) > 0}
      />
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
