/**
 * Driver re-exports @roam/fuel-core fuel money engine (Phase 1 Dominion/Fleet decoupling).
 * Do not reintroduce a local fork — see @roam/fuel-core README.
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
  FuelCoverageCategory,
} from '@roam/fuel-core';
