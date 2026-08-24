import { formatLabel } from 'features/DataStream/lib/utils';

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
