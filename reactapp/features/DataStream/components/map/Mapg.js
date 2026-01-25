// MapComponent.jcacheKeys
import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer } from "@deck.gl/layers";
import Map, { Source, Popup } from 'react-map-gl/maplibre';
import { Protocol } from 'pmtiles';
import { makeGpkgUrl, makePrefix } from '../../lib/s3Utils';
import { loadVpuData, getVariables, getTimeseries, getFeatureIDs,  getDistinctFeatureIds, getDistinctTimes, getVpuVariableFlat, checkForTable  } from 'features/DataStream/lib/queryData';
import useTimeSeriesStore from '../../store/Timeseries';
import useDataStreamStore from '../../store/Datastream';
import useS3DataStreamBucketStore from '../../store/s3Store';
import { useVPUStore } from '../../store/Layers';
import { useLayersStore, useFeatureStore } from '../../store/Layers';
import { PopupContent } from '../styles/Styles';
import { reorderLayers, computeBounds, convertFeaturesToPaths, valueToColor,  getValueAtTimeFlat } from '../../lib/layers';
import { makeTitle, layerIdToFeatureType } from '../../lib/utils';
import { getCentroid } from '../../lib/layers';
import { toast } from 'react-toastify';

// NEW: layer hooks
import {
  useCatchmentLayers,
  useFlowPathsLayer,
  useConusGaugesLayer,
  useNexusLayers,
} from './MapLayers';

const onMapLoad = (event) => {
  const map = event.target;
  const hoverLayers = ['divides', 'nexus-points'];
  hoverLayers.forEach((layer) => {
    map.on('mouseenter', layer, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layer, () => {
      map.getCanvas().style.cursor = '';
    });
  });

  reorderLayers(map);
};

const MapComponent = () => {
  const isNexusVisible = useLayersStore((state) => state.nexus.visible);
  const isCatchmentsVisible = useLayersStore((state) => state.catchments.visible);
  const isFlowPathsVisible = useLayersStore((state) => state.flowpaths.visible);
  const isConusGaugesVisible = useLayersStore((state) => state.conus_gauges.visible);
  const enabledHovering = useLayersStore((state) => state.hovered_enabled);

  const selectedFeatureId = useTimeSeriesStore((state) => state.feature_id);
  const loading = useTimeSeriesStore((state) => state.loading);
  // const table = useTimeSeriesStore((state) => state.table);
  const setLoading = useTimeSeriesStore((state) => state.set_loading);
  const set_series = useTimeSeriesStore((state) => state.set_series);
  const set_feature_id = useTimeSeriesStore((state) => state.set_feature_id);
  const set_variable = useTimeSeriesStore((state) => state.set_variable);
  const set_layout = useTimeSeriesStore((state) => state.set_layout);
  const reset = useTimeSeriesStore((state) => state.reset);

  const nexus_pmtiles = useDataStreamStore((state) => state.nexus_pmtiles);
  const conus_pmtiles = useDataStreamStore((state) => state.community_pmtiles);
  const forecast = useDataStreamStore((state) => state.forecast);
  const outputFile = useDataStreamStore((state) => state.outputFile);
  const cacheKey = useDataStreamStore((state) => state.cache_key);

  const set_vpu = useDataStreamStore((state) => state.set_vpu);
  const set_variables = useDataStreamStore((state) => state.set_variables);


  const prefix = useS3DataStreamBucketStore((state) => state.prefix);

  const set_hovered_feature = useFeatureStore((state) => state.set_hovered_feature);
  const hovered_feature = useFeatureStore((state) => state.hovered_feature);
  const set_selected_feature = useFeatureStore((state) => state.set_selected_feature);
  const selectedMapFeature = useFeatureStore((state) => state.selected_feature);

  const set_feature_ids = useVPUStore((state) => state.set_feature_ids);
  

  const currentTimeIndex = useTimeSeriesStore((s) => s.currentTimeIndex);
  const variable = useTimeSeriesStore((s) => s.variable);

  const featureIdToIndex = useVPUStore((s) => s.featureIdToIndex);
  const timesArr = useVPUStore((s) => s.times);
  const valuesByVar = useVPUStore((s) => s.valuesByVar);
  const pathData = useVPUStore((s) => s.pathData);
  const setAnimationIndex = useVPUStore((s) => s.setAnimationIndex);
  const setVarData = useVPUStore((s) => s.setVarData);
  const setPathData = useVPUStore((s) => s.setPathData);
  const deckOverlayRef = useRef(null);


  const mapRef = useRef(null);

  // --- Read CSS variables for map styles/colors ---
  const rootStyles = getComputedStyle(document.documentElement);

  const mapStyleUrl =
    rootStyles.getPropertyValue('--map-style-url').trim() ||
    'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/styles/light-style.json';

  const dividesOutlineColor =
    rootStyles.getPropertyValue('--map-divides-outline-color').trim() ||
    'rgba(91, 44, 111, 0.5)';
  const dividesHighlightFillColor =
    rootStyles.getPropertyValue('--map-divides-highlight-fill').trim() ||
    'rgba(5, 49, 243, 0.32)';
  const dividesHighlightOutlineColor =
    rootStyles.getPropertyValue('--map-divides-highlight-outline').trim() ||
    'rgba(253, 0, 253, 0.7)';

  const flowpathsLineColor =
    rootStyles.getPropertyValue('--map-flowpaths-color').trim() || '#000000';

  const gaugesCircleColor =
    rootStyles.getPropertyValue('--map-gauges-color').trim() || '#646464';

  const nexusCircleColor =
    rootStyles.getPropertyValue('--map-nexus-circle-color').trim() || '#1f78b4';
  const nexusStrokeColor =
    rootStyles.getPropertyValue('--map-nexus-stroke-color').trim() || '#ffffff';
  const nexusHighlightCircleColor =
    rootStyles.getPropertyValue('--map-nexus-highlight-circle-color').trim() ||
    nexusCircleColor;
const handleMapLoad = useCallback((event) => {
  const map = event.target;

  // keep your existing onMapLoad behavior
  const hoverLayers = ["divides", "nexus-points"];
  hoverLayers.forEach((layer) => {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  });
  reorderLayers(map);

  // ✅ init deck overlay once, when map is guaranteed to exist
  if (!deckOverlayRef.current) {
    deckOverlayRef.current = new MapboxOverlay({ interleaved: true, layers: [] });
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
  return () => {
    if (deckOverlayRef.current) {
      deckOverlayRef.current.finalize?.(); // safe if available
      deckOverlayRef.current = null;
    }
  };
}, []);
 
  useEffect(() => {
    const map =
      mapRef.current && mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;

    if (!map) return;

    if (!deckOverlayRef.current) {
      deckOverlayRef.current = new MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(deckOverlayRef.current);
    }

    return () => {
      if (deckOverlayRef.current) {
        map.removeControl(deckOverlayRef.current);
        deckOverlayRef.current = null;
      }
    };
  }, []);

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
      pickable: true,
      updateTriggers: {
        getColor: [currentTimeIndex, variable],
        getWidth: [currentTimeIndex, variable],
      },
    });

    deckOverlayRef.current.setProps({ layers: [layer] });
  }, [isFlowPathsVisible, valuesByVar, variable, timesArr, pathData, currentTimeIndex]);


  useEffect(() => {
    console.log('Selected feature changed:', selectedMapFeature);
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
      toast.info('Data is already loading, please wait...', { autoClose: 300 });
      return;
    }

    setLoading(true);
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


      const id = unbiased_id.split('-')[1];
      const vpu_str = `VPU_${feature.properties.vpuid}`;
      set_vpu(vpu_str);
     
      const vpu_gpkg = makeGpkgUrl(vpu_str);
      // const cacheKey = getCacheKey(model, date, forecast, cycle, ensemble , vpu_str, outputFile);
      // const cacheKey = table;
      // const _prefix = makePrefix(model, date, forecast, cycle, ensemble , vpu_str, outputFile);
      if(!outputFile){
        toast.warning('No Output File found.', { autoClose: 3000 });
        setLoading(false);
        return;
      }
      const toastId = toast.loading(`MAP- Loading data for id: ${id}...`, {
        closeOnClick: false,
        draggable: false,
      });
      try {
        // await loadVpuData(model, date, forecast, cycle, ensemble, vpu_str, outputFile, vpu_gpkg);
        const tableExists = await checkForTable(cacheKey);
        if (!tableExists) {
          await loadVpuData(cacheKey, prefix, vpu_gpkg);
          const featureIDs = await getFeatureIDs(cacheKey);
          set_feature_ids(featureIDs);
        }
      } catch (err) {
        toast.update(toastId, {
          render: `No data for id: ${id}`,
          type: 'warning',
          isLoading: false,
          autoClose: 500,
          closeOnClick: true,
        });
        console.error('No data for VPU', vpu_str, err);
        setLoading(false);
        continue;
      }
      try {
        const variables = await getVariables({ cacheKey });
        const series = await getTimeseries(id, cacheKey, variables[0]);
        const xy = series.map((d) => ({
          x: new Date(d.time),
          y: d.flow,
         }));
        const textToat = `Loaded ${xy.length} points for id: ${id}`;
        set_variables(variables);
        set_variable(variables[0]);
        set_series(xy);
        set_layout({
          yaxis: variables[0],
          xaxis: '',
          title: makeTitle(forecast, unbiased_id),
        });
        const [featureIds, times, flat] = await Promise.all([
          getDistinctFeatureIds(cacheKey),
          getDistinctTimes(cacheKey),
          getVpuVariableFlat(cacheKey, variables[0]),
        ]);

        setAnimationIndex(featureIds, times);
        setVarData(variables[0], flat);

        toast.update(toastId, {
          render: `${textToat}`,
          type: 'success',
          isLoading: false,
          autoClose: 3000,
          closeOnClick: true,
        });
        setLoading(false);
      } catch (err) {
          toast.update(toastId, {
            render: `Failed to load data for id: ${id}`,
            type: 'error',
            isLoading: false,
            autoClose: 5000,
            closeOnClick: true,
          });
          setLoading(false);
          console.error('Failed to load timeseries for', id, err);
      }
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
      // onLoad={onMapLoad}
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

