import { formatLabel } from 'features/DataStream/lib/utils';

/**
 * A selected feature as label/value rows, ready to render.
 *
 * Lifted out of the side panel's Feature Information block when that moved onto the map. The
 * formatting rules came with it: coordinates to six decimals because that is roughly a tenth of
 * a metre and anything more is noise from a centroid; other numbers to four; booleans as words,
 * since a bare "true" beside "Has Flowline" reads as a value rather than an answer.
 *
 * Position is pulled out first and recombined, because the two sources spell it differently -- a
 * map click produces latitude/longitude and the hydrofabric index produces lat/lon -- and the
 * reader wants one row, not two halves.
 *
 * Empty values are dropped rather than shown blank. The index carries columns that are null for
 * most rows, and a grid half full of empty cells reads as something failing to load.
 */
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
