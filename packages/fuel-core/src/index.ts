export {
  FALLBACK_EFFICIENCY_KM_L,
  GAP_ANOMALY_PCT,
  SEVERE_GAP_PCT,
  TANK_OVERFLOW_MULT,
  UNACCOUNTED_DISTANCE_DEDUCTION_KM,
} from './constants.ts';

export {
  resolvePricePerLiter,
  type FuelPriceSource,
  type ResolvePricePerLiterInput,
  type ResolvePricePerLiterResult,
} from './resolvePricePerLiter.ts';

export {
  resolveFuelBrainFlags,
  type FuelBrainRuntimeFlags,
} from './fuelBrainFlags.ts';

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
} from './retailPriceEstimate.ts';

export {
  enterpriseFuelSyncIdempotencyKey,
  fuelSettlementEntryYmd,
} from './settlementShared.ts';

export {
  assembleWeekSnapshotsFromCalcInput,
  assembleWeekSnapshotsFromRawEntries,
  companyCoveragePercentFromFuelRule,
  driverShareRatioFromFuelRule,
  pickSettlePoolEntries,
  resolveEntryDriverRatio,
  weekSnapshotMoneyDelta,
  type BuiltWeekSnapshot,
  type WeekSnapDriverContext,
  type WeekSnapEntry,
  type WeekSnapFuelRule,
} from './weekSnapshotEngine.ts';
