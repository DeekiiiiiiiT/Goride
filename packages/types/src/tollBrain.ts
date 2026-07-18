/**
 * Toll Brain types — platform detect + classify (live geofence + recon match).
 * See docs/platform/TOLL_BRAIN.md
 */

export interface TollBrainPolicy {
  id: string;
  name: string;
  /** Live GPS / enroute detection master. */
  detectionEnabled: boolean;
  /** Detect tolls while en-route (before passenger onboard). */
  detectEnroute: boolean;
  /** Fallback geofence radius (meters) when plaza has none. */
  geofenceRadiusM: number;
  /** Same-plaza re-count cooldown (ms) for round trips. */
  roundTripCooldownMs: number;
  /** Match: approach window minutes before pickup. */
  approachMinutes: number;
  /** Match: post-dropoff personal buffer minutes. */
  postTripMinutes: number;
  /** Match: same-day candidate pad (days). */
  sameDayPadDays: number;
  /** Exact amount match tolerance ($). */
  varianceThreshold: number;
  /** Cash receipt ↔ trip credit max |delta| ($). */
  cashAmountDeltaMax: number;
  /** Cash soft-match proximity (minutes). */
  cashReceiptProximityMinutes: number;
  /** Enable orphan personal-use suggestions. */
  personalUseDetectionEnabled: boolean;
  /** Orphan proximity tiers (minutes). */
  orphanProximityMinutes: number;
  /** Ambiguity: min score for top-2. */
  ambiguityMinScore: number;
  /** Ambiguity: max score gap between top-2. */
  ambiguityMaxGap: number;
  /** Max suggestions returned. */
  maxSuggestions: number;
  /**
   * How Z-suffixed trip timestamps are read for matching.
   * trust_utc = real Uber/InDrive UTC (default).
   * legacy_reinterpret = old CSV imports that baked wall-clock into Z.
   * Fleet timezone still comes from platform settings — this is not a TZ picker.
   */
  tripTimeMode: 'trust_utc' | 'legacy_reinterpret';
  /** Live materialize crossings into toll_ledger. */
  liveLedgerMaterializeEnabled: boolean;
  isDefault: boolean;
  updatedAt?: string;
}

export const DEFAULT_TOLL_BRAIN_POLICY: Omit<TollBrainPolicy, 'id' | 'updatedAt'> = {
  name: 'default',
  detectionEnabled: true,
  detectEnroute: false,
  geofenceRadiusM: 100,
  roundTripCooldownMs: 5 * 60 * 1000,
  approachMinutes: 45,
  postTripMinutes: 15,
  sameDayPadDays: 1,
  varianceThreshold: 0.05,
  cashAmountDeltaMax: 15,
  cashReceiptProximityMinutes: 90,
  personalUseDetectionEnabled: true,
  orphanProximityMinutes: 180,
  ambiguityMinScore: 50,
  ambiguityMaxGap: 15,
  maxSuggestions: 5,
  tripTimeMode: 'trust_utc',
  liveLedgerMaterializeEnabled: true,
  isDefault: true,
};

export type TollBrainMatchType =
  | 'PERFECT_MATCH'
  | 'AMOUNT_VARIANCE'
  | 'DEADHEAD_MATCH'
  | 'PERSONAL_MATCH'
  | 'POSSIBLE_MATCH';

export type TollBrainReasonCode =
  | 'ON_TRIP'
  | 'ENROUTE_APPROACH'
  | 'POST_TRIP_GAP'
  | 'ORPHAN_NO_TRIP'
  | 'ORPHAN_OUT_OF_WINDOW'
  | 'ORPHAN_NEARBY_UNEXPLAINED';

export type TollBrainMatchStatus =
  | 'matched'
  | 'orphan_personal'
  | 'ambiguous'
  | 'unmatched';

export interface TollBrainTollInput {
  id?: string;
  date: string;
  time?: string;
  amount: number;
  paymentMethod?: string | null;
  receiptUrl?: string | null;
  vehicleId?: string | null;
  driverId?: string | null;
  plazaId?: string | null;
  plaza?: string | null;
  location?: string | null;
  category?: string | null;
  description?: string | null;
  matchStatus?: string | null;
  matchedTripId?: string | null;
  matchTypeCode?: string | null;
}

export interface TollBrainTripInput {
  id: string;
  date: string;
  requestTime?: string | null;
  startTime?: string | null;
  dropoffTime?: string | null;
  duration?: number | null;
  vehicleId?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  tollCharges?: number | null;
  pickupLocation?: string | null;
  dropoffLocation?: string | null;
  platform?: string | null;
  amount?: number | null;
  serviceType?: string | null;
  distance?: string | number | null;
}

export interface TollBrainSuggestion {
  tripId: string;
  matchType: TollBrainMatchType;
  reasonCode?: TollBrainReasonCode;
  confidenceScore?: number;
  confidence: 'high' | 'medium' | 'low';
  isAmbiguous?: boolean;
  windowHit?: 'ON_TRIP' | 'ENROUTE' | 'POST_TRIP' | 'NONE';
  timeDifferenceMinutes: number;
  varianceAmount?: number;
  vehicleMatch?: boolean;
  driverMatch?: boolean;
  reason: string;
  tripTollCharges?: number;
  tripPlatform?: string;
  tripPickup?: string;
  tripDropoff?: string;
  tripDate?: string;
  tripDriverId?: string;
  tripDriverName?: string;
}

export interface TollBrainClassifyMatchInput {
  toll: TollBrainTollInput;
  trips: TollBrainTripInput[];
  timezone: string;
  expectedCostAbs?: number;
  driverAliases?: Record<string, string>;
  policy?: Partial<TollBrainPolicy>;
  options?: {
    includeOrphan?: boolean;
    restorePersistedTrip?: boolean;
  };
}

export interface TollBrainClassifyMatchResult {
  suggestions: TollBrainSuggestion[];
  best: TollBrainSuggestion | null;
  classification: {
    matchStatus: TollBrainMatchStatus;
    matchedTripId: string | null;
    matchTypeCode: string | null;
    matchReasonCode: string | null;
    matchConfidenceScore: number | null;
  };
  meta: {
    method: 'toll_brain_v1';
    candidateTripCount: number;
    policiesApplied: Partial<TollBrainPolicy>;
  };
}

export interface TollBrainEvaluatePointInput {
  lat: number;
  lng: number;
  geofenceRadiusM?: number;
  alreadyCrossedPlazaIds?: string[];
  recentByPlaza?: Record<string, number>;
  cooldownMs?: number;
  policy?: Partial<TollBrainPolicy>;
}

export interface TollBrainCrossing {
  tollPlazaId: string;
  tollPlazaName: string;
  tollAmountMinor: number;
  currency: string;
  driverLat: number;
  driverLng: number;
}

export interface TollBrainEvaluatePointResult {
  tollsCrossed: TollBrainCrossing[];
  totalTollsMinor: number;
  method: 'toll_brain_v1';
}
