// mapLayers.js
import { useMemo } from 'react';
import { Layer } from 'react-map-gl/maplibre';
import { FLOWPATHS_LAYER_ID, FLOWPATHS_HIGHLIGHT_LAYER_ID } from 'features/DataStream/lib/layers';
import { numericPartOf } from 'features/DataStream/lib/utils';

/**
 * Catchment (divides) layers
 */
export function useCatchmentLayers({
  isCatchmentsVisible,
  selectedFeatureId,
  dividesOutlineColor,
  dividesHighlightFillColor,
  dividesHighlightOutlineColor,
}) {
  return useMemo(() => {
    if (!isCatchmentsVisible) return null;

    const divides = (
      <Layer
        key="divides"
        id="divides"
        type="fill"
        source="hydrofabric"
        source-layer="conus_divides"
        paint={{
          'fill-color': ['rgba', 0, 0, 0, 0],
          'fill-outline-color': dividesOutlineColor,
          'fill-opacity': { stops: [[7, 0], [11, 1]] },
        }}
      />
    );

    const highlighted = (
      <Layer
        key="divides-highlight"
        id="divides-highlight"
        type="fill"
        source="hydrofabric"
        source-layer="conus_divides"
        beforeId="divides"
        filter={
          selectedFeatureId
            ? ['any', ['==', ['get', 'divide_id'], selectedFeatureId]]
            : ['==', ['get', 'divide_id'], '']
        }
        paint={{
          'fill-color': dividesHighlightFillColor,
          'fill-outline-color': dividesHighlightOutlineColor,
          'fill-opacity': { stops: [[7, 0], [11, 1]] },
        }}
      />
    );

    return [divides, highlighted];
  }, [
    isCatchmentsVisible,
    selectedFeatureId,
    dividesOutlineColor,
    dividesHighlightFillColor,
    dividesHighlightOutlineColor,
  ]);
}

/**
 * Flowpaths layer.
 *
 * Drawn from its own archive rather than from merged.pmtiles, which carries flowpaths only from
 * zoom 7 up. upstream_index/flowpaths.pmtiles carries them from zoom 1, which is what lets the
 * deck.gl animation draw over a wide view: its geometry is read back out of this layer with
 * queryRenderedFeatures, so wherever this renders, the animation can follow.
 *
 * Nothing clicks or hovers flowpaths, so the properties this archive drops (vpuid, divide_id,
 * lengthkm) cost nothing. Its numeric MVT feature ids match the value array through
 * buildFeatureIdToIndex, which registers both the bare id and the wb- form.
 *
 * The ramps stay modest at low zoom: every available reach across CONUS at once is a lot of
 * ink, and the animation's own colour is what should carry there.
 */
export function useFlowPathsLayer({ isFlowPathsVisible, flowpathsLineColor }) {
  return useMemo(() => {
    if (!isFlowPathsVisible) return null;

    return (
      <Layer
        key={FLOWPATHS_LAYER_ID}
        id={FLOWPATHS_LAYER_ID}
        type="line"
        source="flowpath-geometry"
        source-layer="flowpaths"
        paint={{
          'line-color': flowpathsLineColor,
          'line-width': { stops: [[2, 0.6], [7, 1], [10, 2]] },
          'line-opacity': { stops: [[2, 0.45], [7, 0.7], [10, 1]] },
        }}
      />
    );
  }, [isFlowPathsVisible, flowpathsLineColor]);
}

/**
 * The selected reach, drawn over the flowpaths.
 *
 * A separate layer from the catchment highlight because it reads a different property: the
 * catchment tiles carry divide_id as "cat-2884494", while this archive carries it as the bare
 * number 2884494. Selecting a catchment therefore highlights both its polygon and its reach,
 * which is what someone searching an id is looking for.
 */
export function useFlowPathsHighlightLayer({ isFlowPathsVisible, selectedFeatureId, color }) {
  return useMemo(() => {
    if (!isFlowPathsVisible) return null;

    const numeric = numericPartOf(selectedFeatureId);
    return (
      <Layer
        key={FLOWPATHS_HIGHLIGHT_LAYER_ID}
        id={FLOWPATHS_HIGHLIGHT_LAYER_ID}
        type="line"
        source="flowpath-geometry"
        source-layer="flowpaths"
        // An id that cannot match, rather than no filter, so nothing is highlighted by default.
        filter={numeric ? ['==', ['get', 'divide_id'], Number(numeric)] : ['==', ['get', 'divide_id'], -1]}
        paint={{
          'line-color': color,
          'line-width': { stops: [[2, 2], [7, 3], [10, 5]] },
          'line-opacity': 0.9,
        }}
      />
    );
  }, [isFlowPathsVisible, selectedFeatureId, color]);
}

/**
 * CONUS gauges layer
 */
export function useConusGaugesLayer({
  isConusGaugesVisible,
  gaugesCircleColor,
}) {
  return useMemo(() => {
    if (!isConusGaugesVisible) return null;

    return (
      <Layer
        key="conus-gauges"
        id="conus-gauges"
        type="circle"
        source="hydrofabric"
        source-layer="conus_gages"
        paint={{
          'circle-radius': { stops: [[3, 2], [11, 5]] },
          'circle-color': gaugesCircleColor,
          'circle-opacity': { stops: [[3, 0], [9, 1]] },
        }}
      />
    );
  }, [isConusGaugesVisible, gaugesCircleColor]);
}
