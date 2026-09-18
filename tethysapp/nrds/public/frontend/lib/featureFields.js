import { formatLabel } from './utils.js';

/** A selected feature as label/value rows, ready to render. */
export const featureFields = (feature) => {
  if (!feature) return [];

  const { lat, latitude, lon, longitude, ...rest } = feature;
  const latVal = lat ?? latitude;
  const lonVal = lon ?? longitude;

  const fields = [];

  if (latVal != null && lonVal != null) {
    const latNum = Number(latVal);
    const lonNum = Number(lonVal);
    fields.push({
      label: 'Lat/Long',
      value:
        !Number.isNaN(latNum) && !Number.isNaN(lonNum)
          ? `${latNum.toFixed(6)}, ${lonNum.toFixed(6)}`
          : `${latVal}, ${lonVal}`,
    });
  }

  Object.entries(rest).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;

    let displayValue = value;
    if (typeof value === 'boolean') displayValue = value ? 'Yes' : 'No';
    else if (typeof value === 'number') displayValue = value.toFixed(4);

    fields.push({ label: formatLabel(key), value: displayValue });
  });

  return fields;
};

const HEADER_KEYS = [
  'area_km2',
  'areasqkm',
  'tot_drainage_areasqkm',
  'tot_drainage_area',
  'drainage_area',
  'drainage_areasqkm',
  'stream_order',
  'streamorder',
  'order',
];
const HEADER_LABELS = new Set(HEADER_KEYS.map(formatLabel));

/** The compact header that sits above the chart: the feature's id and a few key attributes. */
export const curatedFeatureFields = (feature, { max = 4 } = {}) => {
  if (!feature) return [];

  const rows = [];
  const id = feature._id ?? feature.id;
  if (id != null && id !== '') rows.push({ label: 'ID', value: String(id) });

  for (const field of featureFields(feature)) {
    if (rows.length >= max) break;
    if (HEADER_LABELS.has(field.label)) rows.push(field);
  }

  return rows;
};
