/**
 * Keep in sync with packages/finance-core/src/tripAnalyticsDefinitions.ts
 * Re-export (one copy). trip-analytics-rules-v1
 */
export {
  TRIP_ANALYTICS_TZ,
  TRIP_ANALYTICS_RULES_V1,
  TRIP_ANALYTICS_FILTER_KEYS,
  CANCEL_REASON_CODES,
  statusBucket,
  normalizeAnalyticsPlatform,
  cashCollectedAbs,
  normalizeCancel,
  analyticsPopulation,
  tripLocalParts,
  priorPeriod,
  percentDelta,
  buildTripAnalyticsFilter,
  deltaIsBad,
} from "../../../packages/finance-core/src/tripAnalyticsDefinitions.ts";

export type { TripAnalyticsFilter } from "../../../packages/finance-core/src/tripAnalyticsDefinitions.ts";
