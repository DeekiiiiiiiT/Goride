/**
 * Fuel Brain types — sessions, classify output, policies.
 * Shared across Dominion, Fleet, Driver, and Edge.
 */

export type FuelDrivingSessionMode = 'personal' | 'off_duty' | 'work';
export type FuelDrivingSessionSource = 'driver_toggle' | 'driver_declare' | 'admin_override';

export interface FuelDrivingSession {
  id: string;
  organizationId?: string | null;
  driverId: string;
  vehicleId: string;
  mode: FuelDrivingSessionMode;
  source: FuelDrivingSessionSource;
  startAt: string;
  endAt?: string | null;
  startOdo?: number | null;
  endOdo?: number | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FuelBrainPolicy {
  id: string;
  name: string;
  deadheadGapMaxMinutes: number;
  personalGapMinMinutes: number;
  peakHoursStart: number;
  peakHoursEnd: number;
  unknownFinalizeThresholdKm: number;
  unknownFinalizeThresholdPct: number;
  isDefault: boolean;
  updatedAt?: string;
}

export type FuelBrainCategory =
  | 'ride_share'
  | 'personal'
  | 'off_duty'
  | 'deadhead'
  | 'company_ops'
  | 'unknown';

export interface FuelBrainClassifyWeekInput {
  organizationId?: string;
  driverId: string;
  vehicleId: string;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;
  totalOdometerKm: number;
  tripRideshareKm: number;
  companyOpsKm: number;
  sessions: Array<{
    mode: FuelDrivingSessionMode;
    startAt: string;
    endAt?: string | null;
    startOdo?: number | null;
    endOdo?: number | null;
  }>;
  /** Optional server deadhead hint (capped to residual after personal). */
  deadheadHintKm?: number;
  policy?: Partial<FuelBrainPolicy>;
}

export interface FuelBrainClassifyWeekResult {
  rideShareKm: number;
  personalKm: number;
  offDutyKm: number;
  companyOpsKm: number;
  deadheadKm: number;
  unknownKm: number;
  totalOdometerKm: number;
  confidence: {
    rideShare: 'high' | 'medium' | 'low';
    personal: 'high' | 'medium' | 'low';
    deadhead: 'high' | 'medium' | 'low';
    unknown: 'high' | 'medium' | 'low';
  };
  /** Share of odo km that is Unknown (0–100). */
  unknownPct: number;
  method: 'fuel_brain_v1';
}

export interface FuelUnknownReview {
  id: string;
  organizationId?: string | null;
  driverId: string;
  vehicleId: string;
  weekStart: string;
  weekEnd: string;
  unknownKm: number;
  status: 'open' | 'resolved' | 'dismissed';
  resolutionLabel?: 'personal' | 'deadhead' | 'company' | 'dismissed' | null;
  resolutionNotes?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt?: string;
}
