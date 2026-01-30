export const FEATURE_PROPERTIES = {
  'tot_drainage_areasqkm': 'Total Drainage Area (km2)',
  'areasqkm': 'Area (km2)',
  'toid': 'To ID',
  'vpuid': 'VPU ID',
  'lengthkm': 'Length (km)',
  'has_flowline': 'Has Flowline',
  'divide_id': 'Divide ID',
};

export const getVariableUnits = (variableName) => {
  if (!variableName) return '';

  const variableUnits = {
    rain_rate: 'mm/h',
    giuh_runoff: 'mm',
    infiltration_excess: '',
    direct_runoff: '',
    nash_lateral_runoff: '',
    deep_gw_to_channel_flux: '',
    soil_to_gw_flux: '',
    q_out: '',
    potential_et: '',
    actual_et: '',
    gw_storage: 'm/m',
    soil_storage: 'm/m',
    soil_storage_change: '',
    surf_runoff_scheme: '',
    nwm_ponded_depth: '',
    type: '',
    flow: 'm³/s',
    velocity: 'm/s',
    depth: 'm',
    nudge: 'm³/s',
    streamflow: 'm³/s',
  };
  const variable = variableName.toLowerCase();
  return variableUnits[variable] ?? '';
};