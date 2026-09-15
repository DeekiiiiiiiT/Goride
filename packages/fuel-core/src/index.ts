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
  FLEET_USE_FUEL_BRAIN,
  FLEET_CYCLE_HEALTH,
  FUEL_BRAIN_SHADOW_COMPARE,
  FUEL_BRAIN_FLAGS,
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
  type WeekSnapCategoryCosts,
  type WeekSnapDriverContext,
  type WeekSnapEntry,
  type WeekSnapFuelRule,
} from './weekSnapshotEngine.ts';

export {
  assembleLeftoverWeekMoney,
  computeMiscellaneousCost,
  getCategoryCoverageSplit,
  getCompanyCoveragePercent,
  splitAllCategoryCosts,
  sumCategoryShare,
  assertCategoryCostsTieSpend,
  isKnownCoverageType,
  coverageRuleIsResolved,
  type CategoryCosts,
  type CategorySplit,
  type FuelCoverageCategory,
  type FuelCoverageRule,
} from './fuelCoverageSplit.ts';

export {
  deriveFuelExpenseStatus,
  fuelExpenseStatusIsFinalized,
  fuelExpenseStatusLabel,
  isFuelReconPeriodLocked,
  type FuelExpenseStatus,
  type FuelReconPeriodLockRow,
} from './fuelReconPeriodStatus.ts';

export {
  FUEL_MISC_MAX_RATIO,
  isOverExplainedFuelWeek,
  isFuelMiscWithinGate,
  floorMiscForSplit,
  classifyFuelMiscResidual,
  isOverExplainedResidual,
  isUnderExplainedResidual,
  type FlooredMiscSplit,
  type FuelMiscResidualKind,
} from './fuelFinalizeGate.ts';

export {
  evaluateFuelWeekClosable,
  fuelWeekIsClosable,
  type EvaluateFuelWeekClosableInput,
  type FuelWeekClosableBlocker,
} from './evaluateFuelWeekClosable.ts';

export {
  computeFuelWeek,
  applyPersonalAllowanceAbsorb,
  diffWeekCalc,
  weekCalcMatches,
  type ComputeFuelWeekInput,
  type WeekCalc,
} from './computeFuelWeek.ts';

export {
  FUEL_RESIDUAL_DISPOSITIONS,
  isFuelResidualDisposition,
  validateDisposition,
  type FuelResidualDisposition,
  type FuelResidualDispositionRecord,
} from './fuelResidualDisposition.ts';

export {
  precomputeFuelFillDrivers,
  indexTripsByVehicleYmd,
} from './precomputeFuelFillDrivers.ts';

export {
  unwrapFuelEntriesPayload,
  type FuelEntriesListMeta,
} from './unwrapFuelEntriesPayload.ts';

export {
  metaFlagOn,
  isStationGateHeld,
  isLedgerFuelExpenseRow,
  isFuelCategory,
  isFuelReimbursement,
  isPendingFuelQueueRow,
  isAdminManualFuelWithProvidedOdometer,
  isLogReviewEligible,
  isPendingReadyForReview,
  fuelTxDateYmd,
  holdReasonForUnapprovedTx,
  listUnapprovedFuelTxInWindow,
  countFuelReviewQueueWork,
  type FuelReviewQueueTx,
  type FuelClassifyFields,
  type FuelUnapprovedHoldReason,
  type FuelUnapprovedTxBlocker,
  type FuelReviewQueueCounts,
} from './fuelReviewQueue.ts';

export { calculateFuelCycles } from './fuelCycleEngine.ts';

export {
  FuelCalculationService,
  type PersonalAllowanceReconContext,
  type VehicleDeadheadInput,
  type FuelBrainClassificationInput,
} from './fuelCalculationService.ts';

export {
  classifyAnchor,
  resolveTankCapacity,
  isStableCycleId,
  mintCycleId,
  SOFT_ANCHOR_THRESHOLD,
  CAPACITY_CLOSE_THRESHOLD,
  type AnchorClassifyInput,
  type AnchorClassifyResult,
} from './fuelAnchorLogic.ts';

export {
  evaluateCycleClose,
  resolveCycleCloseMode,
  closeOpenCycleAtWeekBoundary,
  SINGLE_FILL_FULL_THRESHOLD,
  type CycleCloseMode,
  type CloseDecision,
} from './fuelCycleClosePolicy.ts';

export {
  toEntryYmd,
  isEntryInInclusiveYmdRange,
  entriesInFuelWeek,
} from './fuelWeekRange.ts';

export { getTotalTripRideshareKm, sumTripRideshareKm } from './tripRideshareKm.ts';
export { getTripGrossRevenue } from './tripGrossRevenue.ts';

export {
  computePersonalAllowanceSplit,
  buildPersonalAllowanceMetadata,
  mergePersonalAllowanceDefaults,
  DEFAULT_PERSONAL_ALLOWANCE,
  type PersonalAllowanceSplitResult,
} from './personalAllowance.ts';

export {
  pickScenarioForDriverMembership,
  pickScenarioForDriverWeek,
  resolveDriverVersionForWeek,
} from './fuelPolicyVersion.ts';

export { resolveFuelFillDriver, stampAttributedDriverIds } from './resolveFuelFillDriver.ts';

export {
  filterFuelOpsLogEntries,
  fuelOpsLiters,
  fuelOpsSpendAmount,
  isFuelOpsLogEntry,
  isGasCardFuelEntry,
  countsInGasCardSpend,
} from './fuelOpsEligibility.ts';

export {
  UNASSIGNED_FUEL_DRIVER_ID,
  type FuelEntry,
  type FuelCycle,
  type FuelScenario,
  type FuelRule,
  type WeeklyFuelReport,
  type FuelCalcTrip,
  type FuelCalcVehicle,
  type PersonalAllowanceTierConfig,
  type QuotaConfig,
} from './fuelTypes.ts';
