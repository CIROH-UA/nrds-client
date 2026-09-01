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
  // CFE outputs take their units from NOAA-OWP/cfe, src/bmi_cfe.c output_var_units, at
  // a349a953 -- the commit CIROH-UA/ngen@ngiab pins as its extern/cfe/cfe submodule.
  // Every CFE output is declared 'm' there except SURF_RUNOFF_SCHEME, which is 'none'.
  // 'type' is categorical and not a CFE output, so both of those stay unitless.
  const variableUnits = {
    rain_rate: 'mm/h',
    giuh_runoff: 'mm',
    infiltration_excess: 'm',
    direct_runoff: 'm',
    nash_lateral_runoff: 'm',
    deep_gw_to_channel_flux: 'm',
    soil_to_gw_flux: 'm',
    q_out: 'm',
    potential_et: 'm',
    actual_et: 'm',
    gw_storage: 'm/m',
    soil_storage: 'm/m',
    soil_storage_change: 'm',
    surf_runoff_scheme: '',
    nwm_ponded_depth: 'm',
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