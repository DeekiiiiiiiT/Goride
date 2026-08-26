/**
 * Dominion re-exports Fleet's canonical fuel money engine (Phase 1 de-fork).
 * Do not reintroduce a local fork — see @roam/fuel-core README.
 */
export {
  FuelCalculationService,
  FALLBACK_EFFICIENCY_KM_L,
  GAP_ANOMALY_PCT,
  SEVERE_GAP_PCT,
  TANK_OVERFLOW_MULT,
  UNACCOUNTED_DISTANCE_DEDUCTION_KM,
} from '@fleet/services/fuelCalculationService';
export type {
  PersonalAllowanceReconContext,
  VehicleDeadheadInput,
  FuelCoverageCategory,
} from '@fleet/services/fuelCalculationService';
