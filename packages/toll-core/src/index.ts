export {
  isTollCategory,
  isTollLedgerCategory,
  tollLogKindFromCategory,
  tollLogKindFromTx,
} from './tollCategoryHelper.ts';
export type { TollLogKind } from './tollCategoryHelper.ts';

export {
  classifyOrphanToll,
} from './orphanTollClassifier.ts';
export type {
  PersonalUseReasonCode,
  OrphanCandidateTrip,
  OrphanClassifierInput,
  OrphanClassification,
} from './orphanTollClassifier.ts';

export {
  parseTollDate,
  getTollTransactionDate,
  ymdToLocalDate,
  normalizeWallClockTime,
} from './tollDate.ts';
export type { TollDateSource } from './tollDate.ts';

export type {
  TollType,
  TollPaymentMethod,
  TollStatus,
  TollResolution,
  TollAuditAction,
  TollAuditEntry,
  TollLedgerRecord,
  TollLedgerFilters,
} from './tollLedgerRecord.ts';
export {
  validateTollLedgerRecord,
  createAuditEntry,
  appendAuditTrail,
} from './tollLedgerRecord.ts';

export type {
  TollPaymentMethodRate,
  TollRate,
  TollVehicleClassDef,
  PlazaRates,
  RouteSegment,
  RouteRateGroup,
  TollRateScheduleVersion,
  TollRateScheduleStore,
  TollRateScheduleLegacy,
  OfficialTollRateResult,
} from './tollRateSchedule.ts';
export {
  TOLL_RATE_TOLERANCE,
  KV_TOLL_RATE_SCHEDULE,
} from './tollRateSchedule.ts';

export {
  toIsoDateKey,
  isoToDisplayDate,
  migrateToVersionedStore,
  selectScheduleVersion,
  TollRatePublishError,
  pricingFingerprint,
  publishScheduleVersion,
  publishScheduleVersionChecked,
  resolveOfficialTollRate,
  hasOfficialRateDrift,
  resolveExpectedTollCost,
  listVehicleClassesFromStore,
} from './officialTollRate.ts';
export type {
  TollRatePublishRejection,
  PublishScheduleResult,
  ResolveOfficialTollRateInput,
} from './officialTollRate.ts';

export {
  resolveTollPlaza,
  isVoidedToll,
  resolveTollStatusDisplay,
  excludeVoidedTolls,
} from './tollPlazaResolution.ts';
export type {
  PlazaMatchSource,
  PlazaMatch,
  PlazaMatchInput,
  TollPlazaMatchable,
  TollStatusInput,
} from './tollPlazaResolution.ts';
