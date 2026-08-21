import { FEATURE_PROPERTIES } from "./data";

function separateWords(word){
  return word.replace(/-/g, ' '); 
}

const capitalizeWords = (str) => str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

export const getYesterdayDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

export const makeTitle = (forecast, feature_id) => {
  const cleanForecast = forecast.replace(/_/g, ' '); // replace all underscores
  const cleanId = separateWords(feature_id);
  return capitalizeWords(`${cleanId} ${cleanForecast} Forecast`);
};

export const formatLabel = (key) =>{
 return FEATURE_PROPERTIES[key] || key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}


export const layerIdToFeatureType = (layerId) => {
  switch(layerId) {
    case 'nexus-points':
      return 'id';
    case 'divides':
      return 'divide_id';
    default:
      return null;
  }
};

// The prefixes the hydrofabric index actually uses, in the order the app cares about: a
// catchment is what gets charted, its flowpath is the same reach, and a nexus is the junction
// below it. Lakes carry no prefix, so the bare number is tried last.
const ID_PREFIXES = ['cat', 'wb', 'nex'];

/**
 * The ids worth looking for, given whatever was typed.
 *
 * A bare number is the useful case: people read "2884494" off a chart title or a popup and
 * should not have to know that the catchment is cat-2884494 while its flowpath is wb-2884494.
 * Anything already carrying a prefix is taken as written.
 */
export const searchCandidates = (input) => {
  const trimmed = String(input ?? '').trim().toLowerCase();
  if (!trimmed) return [];
  if (!/^\d+$/.test(trimmed)) return [trimmed];
  return [...ID_PREFIXES.map((prefix) => `${prefix}-${trimmed}`), trimmed];
};

/** The numeric part of a hydrofabric id, which is what the timeseries tables are keyed by. */
export const numericPartOf = (id) => {
  const match = /(\d+)\s*$/.exec(String(id ?? ''));
  return match ? match[1] : null;
};
