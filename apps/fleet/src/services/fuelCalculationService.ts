/**
 * Canonical fuel money engine lives in @roam/fuel-core — keep fleet import paths stable.
 */
export {
  FuelCalculationService,
  FALLBACK_EFFICIENCY_KM_L,
  GAP_ANOMALY_PCT,
  SEVERE_GAP_PCT,
  TANK_OVERFLOW_MULT,
  UNACCOUNTED_DISTANCE_DEDUCTION_KM,
} from '@roam/fuel-core';
export type {
  PersonalAllowanceReconContext,
  VehicleDeadheadInput,
  FuelBrainClassificationInput,
  FuelCoverageCategory,
} from '@roam/fuel-core';
