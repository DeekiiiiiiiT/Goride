/** Re-export fleet-canonical rate schedule types from @roam/toll-core. */
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
} from '@roam/toll-core';
export {
  TOLL_RATE_TOLERANCE,
  KV_TOLL_RATE_SCHEDULE,
} from '@roam/toll-core';
