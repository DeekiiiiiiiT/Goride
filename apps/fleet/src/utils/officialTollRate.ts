/** Re-export fleet-canonical official rate helpers from @roam/toll-core. */
export {
  TOLL_RATE_TOLERANCE,
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
} from '@roam/toll-core';
export type {
  TollRatePublishRejection,
  PublishScheduleResult,
  ResolveOfficialTollRateInput,
} from '@roam/toll-core';
