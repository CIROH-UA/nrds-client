// --- Read CSS variables for map styles/colors ---
const rootStyles = getComputedStyle(document.documentElement);

export const mapStyleUrl =
  rootStyles.getPropertyValue('--map-style-url').trim() ||
  'https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/styles/light-style.json';

export const dividesOutlineColor =
  rootStyles.getPropertyValue('--map-divides-outline-color').trim() ||
  'rgba(91, 44, 111, 0.5)';
export const dividesHighlightFillColor =
  rootStyles.getPropertyValue('--map-divides-highlight-fill').trim() ||
  'rgba(5, 49, 243, 0.32)';
export const dividesHighlightOutlineColor =
  rootStyles.getPropertyValue('--map-divides-highlight-outline').trim() ||
  'rgba(253, 0, 253, 0.7)';

export const flowpathsLineColor =
  rootStyles.getPropertyValue('--map-flowpaths-color').trim() || '#000000';

export const gaugesCircleColor =
  rootStyles.getPropertyValue('--map-gauges-color').trim() || '#646464';

export const nexusCircleColor =
  rootStyles.getPropertyValue('--map-nexus-circle-color').trim() || '#1f78b4';
export const nexusStrokeColor =
  rootStyles.getPropertyValue('--map-nexus-stroke-color').trim() || '#ffffff';
export const nexusHighlightCircleColor =
  rootStyles.getPropertyValue('--map-nexus-highlight-circle-color').trim() ||
  nexusCircleColor;

export const reorderLayers = (map) => {
  if (!map) return;
  // Draw order from bottom → top
  const LAYER_ORDER = [
    'flowpaths',
    'conus-gauges',
    'divides',
    'divides-highlight',
    'nexus-points',
    'nexus-highlight',
  ];

  LAYER_ORDER.forEach((id) => {
    if (map.getLayer(id)) {
      // moveLayer with no beforeId = move to top
      map.moveLayer(id);
    }
  });
};

export const getCentroid = (feature) => {
  
    const { type, coordinates } = feature.geometry;
    let lon = null;
    let lat = null;
    if (type === 'Point' && Array.isArray(coordinates)) {
      // GeoJSON Point: [lon, lat]
      lon = coordinates[0];
      lat = coordinates[1];
      return { lon, lat };
    } else if (type === 'Polygon' && Array.isArray(coordinates)) {
      // Use outer ring to compute a simple centroid
      const outerRing = coordinates[0] || [];
      if (outerRing.length > 0) {
        let sumLon = 0;
        let sumLat = 0;
        let count = 0;
        for (const coord of outerRing) {
          if (!Array.isArray(coord) || coord.length < 2) continue;
          sumLon += coord[0];
          sumLat += coord[1];
          count += 1;
        }
        if (count > 0) {
          lon = sumLon / count;
          lat = sumLat / count;
          return { lon, lat };
        }
      }
    }

    return {lon, lat};
  }
export const symbologyColors = (theme) => ({
      nexusFill: theme === 'dark' ? '#4f5b67' : '#1f78b4',
      nexusStroke: theme === 'dark' ? '#e9ecef' : '#ffffff',
      catchmentFill:
        theme === 'dark'
          ? 'rgba(238, 51, 119, 0.32)'
          : 'rgba(91, 44, 111, 0.32)',
      catchmentStroke:
        theme === 'dark'
          ? 'rgba(238, 51, 119, 0.9)'
          : 'rgba(91, 44, 111, 0.9)',
      flowStroke: theme === 'dark' ? '#0077bb' : '#000000',
      gaugeFill: theme === 'dark' ? '#c8c8c8' : '#646464',
      gaugeStroke: theme === 'dark' ? '#111827' : '#ffffff',
})

export const getSymbology = (typeSymbol, colors) => {
  switch (typeSymbol) {
    case 'nexus':
      return (
        <NexusSymbol fill={colors.nexusFill} stroke={colors.nexusStroke} />
      );
    case 'catchments':
      return (
        <CatchmentSymbol
          fill={colors.catchmentFill}
          stroke={colors.catchmentStroke}
        />
      );
    case 'flowpaths':
      return <FlowPathSymbol stroke={colors.flowStroke} />;
    case 'conus_gauges':
      return (
        <GaugeSymbol fill={colors.gaugeFill} stroke={colors.gaugeStroke} />
      );
    default:
      return null;
  }
}

// --- Small SVG legend symbols ----------------------------------

export const NexusSymbol = ({ fill, stroke }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    style={{ marginRight: '8px' }}
  >
    <circle cx="9" cy="9" r="5" fill={fill} stroke={stroke} strokeWidth="2" />
  </svg>
);

export const CatchmentSymbol = ({ fill, stroke }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    style={{ marginRight: '8px' }}
  >
    <rect
      x="3"
      y="4"
      width="12"
      height="10"
      rx="2"
      ry="2"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.5"
    />
  </svg>
);

export const FlowPathSymbol = ({ stroke }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    style={{ marginRight: '8px' }}
  >
    <path
      d="M2 13 C 5 9, 9 11, 16 5"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const GaugeSymbol = ({ fill, stroke }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    style={{ marginRight: '8px' }}
  >
    <circle cx="9" cy="9" r="4" fill={fill} stroke={stroke} strokeWidth="1.5" />
  </svg>
);

export const CursorSymbol = ({
  fill = '#1f78b4',
  stroke = '#ffffff',
}) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    style={{ marginRight: '6px' }}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Arrow body */}
    <path
      d="M4 3 L4 18 L8.5 14.5 L11 20 L13 19 L10.5 13.5 L15 13 Z"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.2"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

export const BasinSymbol = ({
  fill = 'rgba(91, 44, 111, 0.32)',
  stroke = 'rgba(91, 44, 111, 0.9)',
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    className="Eo3Yub"
  >
    <path
      d="M2.0975 7.12551L10.878 1.1499L18.5 13.8414L13.378 18.8502L1 16.5158L2.0975 7.12551Z"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.5"
    />
  </svg>
);

export const DeleteDataIcon = (props) => (
  <svg
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    {...props}
  >
    <rect x="6" y="4" width="12" height="2" rx="1" fill="currentColor" />
    <rect x="7" y="6" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10" y1="8" x2="10" y2="16" stroke="currentColor" strokeWidth="1.2" />
    <line x1="14" y1="8" x2="14" y2="16" stroke="currentColor" strokeWidth="1.2" />

    <ellipse cx="18" cy="17" rx="3" ry="1.3" fill="currentColor" opacity="0.15" />
    <ellipse cx="18" cy="17" rx="3" ry="1.3" stroke="currentColor" strokeWidth="1" />
    <path
      d="M15 17v2.2c0 .7 1.3 1.3 3 1.3s3-.6 3-1.3V17"
      fill="currentColor"
      opacity="0.05"
    />
    <path
      d="M15 17v2.2c0 .7 1.3 1.3 3 1.3s3-.6 3-1.3V17"
      stroke="currentColor"
      strokeWidth="1"
    />
    <path
      d="M15 18.1c0 .7 1.3 1.3 3 1.3s3-.6 3-1.3"
      stroke="currentColor"
      strokeWidth="0.8"
      opacity="0.7"
    />
  </svg>
);


const baseProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': 'true',
};

// Model: small cube / block
export const ModelIcon = (props) => (
  <svg {...baseProps} {...props}>
    <path
      d="M7 9L12 6L17 9L12 12L7 9Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M7 9V15L12 18L17 15V9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

// Date: calendar
export const DateIcon = (props) => (
  <svg {...baseProps} {...props}>
    <rect
      x="4"
      y="6"
      width="16"
      height="14"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M8 4V7M16 4V7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M4 10H20"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

// Forecast: horizon + forward arrow
export const ForecastIcon = (props) => (
  <svg {...baseProps} {...props}>
    {/* horizon */}
    <path
      d="M4 16H14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    {/* rising curve */}
    <path
      d="M4 16C6.5 12 9 10 12 10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* forward arrow */}
    <path
      d="M13 7L18 12L13 17"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Cycle: circular arrows
export const CycleIcon = (props) => (
  <svg {...baseProps} {...props}>
    <path
      d="M7 8H12.5C14.9853 8 17 10.0147 17 12.5C17 13.3284 16.7893 14.1074 16.4189 14.7816"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M9 5L7 8L9 11"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 16H11.5C9.01472 16 7 13.9853 7 11.5C7 10.6716 7.21075 9.89257 7.58107 9.21835"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M15 19L17 16L15 13"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const EnsembleIcon = (props) => (
  <svg {...baseProps} {...props}>
    <path
      d="M4 9C5.2 8.4 6.4 8 8 8C10.5 8 11.5 10 14 10C15.6 10 16.8 9.6 18 9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M4 12C5.2 11.4 6.4 11 8 11C10.5 11 11.5 13 14 13C15.6 13 16.8 12.6 18 12"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      opacity="0.85"
    />
    <path
      d="M4 15C5.2 14.4 6.4 14 8 14C10.5 14 11.5 16 14 16C15.6 16 16.8 15.6 18 15"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      opacity="0.7"
    />
  </svg>
);

export const FileIcon = (props) => (
  <svg {...baseProps} {...props}>
    <path
      d="M6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4C4 2.89543 4.89543 2 6 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M14 2V8H20"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

// Variable: axes + curve
export const VariableIcon = (props) => (
  <svg {...baseProps} {...props}>
    {/* axes */}
    <path
      d="M5 18V7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M5 18H18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    {/* curve */}
    <path
      d="M7 15C9 12 10 10 12 10C14 10 15 12 17 9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function getValueAtTimeFlat(varData, numTimes, featureIndex, timeIndex) {
  if (!varData || featureIndex === undefined || featureIndex === null) return null;
  const idx = featureIndex * numTimes + timeIndex;
  if (idx < 0 || idx >= varData.length) return null;
  return varData[idx];
}

export function valueToColor(value, bounds) {
  const colorScale = [
    [0, 119, 187],
    [0, 180, 216],
    [144, 224, 239],
    [255, 186, 8],
    [255, 107, 53],
    [208, 0, 0],
  ];
  if (value === null || value === undefined || value <= -9998) return [100, 100, 100, 150];
  if (!bounds || bounds.max === bounds.min) return colorScale[0];

  const t = Math.max(0, Math.min(1, (value - bounds.min) / (bounds.max - bounds.min)));
  const idx = t * (colorScale.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const frac = idx - lower;
  if (lower === upper) return colorScale[lower];
  return colorScale[lower].map((c, i) => Math.round(c + (colorScale[upper][i] - c) * frac));
}

export function computeBounds(varData) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < varData.length; i++) {
    const v = varData[i];
    if (v <= -9998) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1 };
  return { min, max };
}


export function convertFeaturesToPaths(features, featureIdToIndex) {
  const out = [];

  for (const f of features) {
    const rawId = f.id ?? f.properties?.id;
    if (rawId == null) continue;

    const id = String(rawId);
    const featureIndex = featureIdToIndex[id];
    if (featureIndex === undefined) continue;

    const geom = f.geometry;
    if (!geom) continue;

    if (geom.type === "LineString") {
      out.push({ id, featureIndex, path: geom.coordinates, properties: f.properties });
    } else if (geom.type === "MultiLineString") {
      geom.coordinates.forEach((line, i) => {
        out.push({ id: `${id}-${i}`, featureIndex, path: line, properties: f.properties });
      });
    }
  }

  return out;
}

export function flowpathsSignature(features) {
  const parts = [];

  for (const f of features) {
    const rawId = f.id ?? f.properties?.id;
    if (rawId == null) continue;

    const id = String(rawId);
    const g = f.geometry;
    if (!g) continue;

    if (g.type === "LineString") {
      parts.push(`${id}:L:${g.coordinates.length}`);
    } else if (g.type === "MultiLineString") {
      const lines = g.coordinates.length;
      const totalPts = g.coordinates.reduce((sum, line) => sum + line.length, 0);
      parts.push(`${id}:M:${lines}:${totalPts}`);
    }
  }

  parts.sort(); // make stable regardless of render order
  return parts.join("|");
}
