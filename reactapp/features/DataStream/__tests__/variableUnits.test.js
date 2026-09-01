/**
 * Twelve of the twenty-one entries in this lookup were empty strings, so selecting one of those
 * variables drew an axis labelled with a bare variable name -- the symptom reported in
 * CIROH-UA/ngiab-client#26. Eleven of the twelve are answerable from CFE itself, which declares
 * 'm' for every one of its outputs except SURF_RUNOFF_SCHEME. This pins the filled entries to
 * that declaration, so a later edit cannot quietly put a guess back in.
 */
import { getVariableUnits } from 'features/DataStream/lib/data';

// NOAA-OWP/cfe, src/bmi_cfe.c output_var_units at a349a953.
const CFE_OUTPUTS_IN_METRES = [
  'infiltration_excess', 'direct_runoff', 'nash_lateral_runoff', 'deep_gw_to_channel_flux',
  'soil_to_gw_flux', 'q_out', 'potential_et', 'actual_et', 'soil_storage_change',
  'nwm_ponded_depth',
];

describe('getVariableUnits', () => {
  it.each(CFE_OUTPUTS_IN_METRES)('reports %s in metres, as CFE declares it', (name) => {
    expect(getVariableUnits(name)).toBe('m');
  });

  it('leaves surf_runoff_scheme unitless, since CFE declares it none', () => {
    expect(getVariableUnits('surf_runoff_scheme')).toBe('');
  });

  it('leaves type unitless, being categorical rather than a CFE output', () => {
    expect(getVariableUnits('type')).toBe('');
  });

  it('is case insensitive, since callers pass names in either case', () => {
    expect(getVariableUnits('Q_OUT')).toBe('m');
  });

  it('returns an empty string for a name it does not know', () => {
    expect(getVariableUnits('land_surface_water__runoff_volume_flux')).toBe('');
  });
});