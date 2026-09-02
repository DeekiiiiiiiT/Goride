export {
  FALLBACK_EFFICIENCY_KM_L,
  GAP_ANOMALY_PCT,
  SEVERE_GAP_PCT,
  TANK_OVERFLOW_MULT,
  UNACCOUNTED_DISTANCE_DEDUCTION_KM,
} from './constants';

export {
  resolvePricePerLiter,
  type FuelPriceSource,
  type ResolvePricePerLiterInput,
  type ResolvePricePerLiterResult,
} from './resolvePricePerLiter';

export {
  resolveFuelBrainFlags,
  type FuelBrainRuntimeFlags,
} from './fuelBrainFlags';

export {
  resolveRetailEstimate,
  pickMarkupForDate,
  isPriceOutlier,
  medianPositive,
  DEFAULT_PRICE_OUTLIER_PCT,
  type FuelGrade,
  type PetrojamWholesaleRow,
  type RetailMarkupVersion,
  type RetailEstimateResult,
} from './retailPriceEstimate';

export {
  enterpriseFuelSyncIdempotencyKey,
  fuelSettlementEntryYmd,
} from './settlementShared';

export {
  assembleWeekSnapshotsFromCalcInput,
  companyCoveragePercentFromFuelRule,
  driverShareRatioFromFuelRule,
  resolveEntryDriverRatio,
  weekSnapshotMoneyDelta,
  type BuiltWeekSnapshot,
  type WeekSnapDriverContext,
  type WeekSnapEntry,
  type WeekSnapFuelRule,
} from './weekSnapshotEngine';
