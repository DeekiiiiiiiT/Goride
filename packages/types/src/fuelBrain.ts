/**
 * Fuel Brain types — automated residual Personal stack (no driver toggles).
 * RS → Company Ops → capped Deadhead → Personal residual.
 */

export interface FuelBrainPolicy {
  id: string;
  name: string;
  /** Upper bound of “always deadhead” time-gap band (minutes). */
  deadheadGapMaxMinutes: number;
  /** Gaps longer than this (off-peak) are not treated as deadhead in time fallback. */
  personalGapMinMinutes: number;
  peakHoursStart: number;
  peakHoursEnd: number;
  /** Industry fallback % of non-trip km when gap data is weak. */
  industryFallbackPct: number;
  /** Method C vs A agreement threshold (percentage points). */
  crossValidationPp: number;
  /** Prefer odometer deltas between trips for deadhead (vs time-only). */
  preferOdoGaps: boolean;
  /** Ambiguous time-gap split toward deadhead (0–100). */
  ambiguousDeadheadSplitPct: number;
  isDefault: boolean;
  updatedAt?: string;
}

export type FuelBrainCategory =
  | 'ride_share'
  | 'personal'
  | 'deadhead'
  | 'company_ops';

export interface FuelBrainClassifyWeekInput {
  organizationId?: string;
  driverId: string;
  vehicleId: string;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;
  totalOdometerKm: number;
  tripRideshareKm: number;
  companyOpsKm: number;
  /** Server deadhead estimate (capped to Available_Km). */
  deadheadHintKm?: number;
  policy?: Partial<FuelBrainPolicy>;
}

export interface FuelBrainClassifyWeekResult {
  rideShareKm: number;
  personalKm: number;
  companyOpsKm: number;
  deadheadKm: number;
  totalOdometerKm: number;
  /** Available after RS + Company (before deadhead/personal split). */
  availableKm: number;
  confidence: {
    rideShare: 'high' | 'medium' | 'low';
    personal: 'high' | 'medium' | 'low';
    deadhead: 'high' | 'medium' | 'low';
  };
  method: 'fuel_brain_v2';
}
