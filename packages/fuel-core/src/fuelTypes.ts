/**
 * Fuel domain types for calc engines in @roam/fuel-core.
 * Kept here (not packages/types/fuel.ts) — parity script bans that path.
 * Structurally compatible with apps/fleet/src/types/fuel.ts.
 */

export type FuelType = 'Gasoline_87' | 'Gasoline_91' | 'Gasoline_93' | 'Diesel' | 'Electric' | 'Hybrid';

export type JaaCardType = 'rental' | 'driver_tied';

export interface FuelCardAssignmentHistoryEntry {
  driverId: string;
  driverName?: string;
  assignedAt: string;
  unassignedAt?: string;
  assignedBy?: string;
  vehicleLabelAtAssign?: string;
}

export interface FuelCard {
  id: string;
  cardNumber: string;
  provider: string;
  status: 'Active' | 'Inactive' | 'Lost';
  organizationId?: string;
  jaaCompanyCode?: string;
  jaaCardType?: JaaCardType;
  assignedVehicleId?: string;
  assignedDriverId?: string;
  assignmentHistory?: FuelCardAssignmentHistoryEntry[];
  expiryDate?: string;
  notes?: string;
}

export interface FuelEntry {
  id: string;
  date: string;
  time?: string;
  cardId?: string;
  vehicleId?: string;
  driverId?: string;
  organizationId?: string;
  amount: number;
  liters?: number;
  pricePerLiter?: number;
  fuelType?: FuelType | string;
  odometer?: number | null;
  odometerImageUrl?: string;
  location?: string;
  stationAddress?: string;
  vendor?: string;
  notes?: string;
  type: 'Card_Transaction' | 'Manual_Entry' | 'Fuel_Manual_Entry' | 'Reimbursement';
  entryMode: 'Anchor' | 'Floating';
  paymentSource: 'RideShare_Cash' | 'Gas_Card' | 'Personal' | 'Petty_Cash';
  /**
   * N-18: fill usage for Phase 4 server category authority
   * (`ride` | `company` | `deadhead` | `personal`).
   */
  usageCategory?: string;
  entrySource?: 'driver-portal' | 'admin-manual' | 'admin-edit' | 'bulk-import' | 'fuel-card';
  isFlagged?: boolean;
  isVerified?: boolean;
  status?: 'Draft' | 'Posted' | 'Finalized' | string;
  isLocked?: boolean;
  lockedAt?: string;
  signature?: string;
  signedAt?: string;
  correctionReason?: string;
  transactionId?: string;
  volumeContributed?: number;
  isCarryover?: boolean;
  carryoverVolume?: number;
  anchorPeriodId?: string;
  reconciliationStatus?: 'Pending' | 'Verified' | 'Flagged' | 'Observing' | 'Archived';
  auditStatus?: 'Clear' | 'Observing' | 'Flagged' | 'Auto-Resolved';
  metadata?: {
    isEdited?: boolean;
    lastEditedAt?: string;
    editReason?: string;
    isDebit?: boolean;
    isCredit?: boolean;
    observationReason?: string;
    observationStartedAt?: string;
    expectedAnchorDate?: string;
    predictedEconomy?: number;
    varianceFromBaseline?: number;
    [key: string]: unknown;
  };
}

export interface MileageAdjustment {
  id: string;
  date: string;
  vehicleId: string;
  driverId: string;
  type: 'Company_Misc' | 'Personal' | 'Maintenance';
  distance: number;
  reason: string;
  approvedBy?: string;
}

export const UNASSIGNED_FUEL_DRIVER_ID = '__unassigned__';

export interface OdometerBucket {
  id: string;
  vehicleId: string;
  startOdometer: number;
  endOdometer: number;
  startDate: string;
  endDate: string;
  actualFuelLiters: number;
  actualFuelCost: number;
  associatedReceipts: string[];
  closingEntryId?: string;
  /** Ledger/source kind of the closing boundary (Fill / Check-in / Service). */
  closingBoundarySource?: 'fuel' | 'checkin' | 'service' | 'manual' | 'unknown';
  totalTripDistance: number;
  tripsCount: number;
  expectedFuelLiters: number;
  varianceLiters: number;
  variancePercent: number;
  rideShareDistance: number;
  /** Evidenced Personal adjustments only — never residual. */
  personalDistance: number;
  companyMiscDistance: number;
  /**
   * Over-logged distance: category evidence exceeds odometer movement (N-6).
   * Not "unlogged km" — UI must label as over-logged.
   */
  unaccountedDistance: number;
  /** Odometer km not explained by RS + company + evidenced personal. Non-chargeable. */
  unexplainedDistance?: number;
  /** Check-in/service waypoints inside this fill window (never boundaries). */
  waypointCount?: number;
  /** exact | partial | indeterminate — chargeable only when exact. */
  confidenceTier?: 'exact' | 'partial' | 'indeterminate';
  confidenceReason?: string;
  chainAnomaly?: boolean;
  deductionRecommendation?: number;
  deductionReason?: string;
  isDeductionPosted?: boolean;
  deductionTransactionId?: string;
  status: 'Complete' | 'Partial' | 'Anomaly';
}

/** External ledger anchors for stop-to-stop (must carry referenceId for fuel joins). */
export type OdometerBucketAnchor = {
  id: string;
  date: string;
  odometer: number;
  referenceId?: string;
  source?: 'fuel' | 'checkin' | 'service' | 'manual' | string;
};

export interface FuelCycle {
  id: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  totalLiters: number;
  totalCost: number;
  avgPricePerLiter: number;
  transactions: FuelEntry[];
  status: 'Complete' | 'Active' | 'Anomaly';
  distance: number;
  efficiency: number;
  resetType: 'Manual' | 'Auto_Soft' | 'Auto_Anomaly';
  trustTier?: 'Manual' | 'Soft';
  startOdometer?: number;
  endOdometer?: number;
  startingPercentage?: number;
  isCapped?: boolean;
  excessVolume?: number;
  isChainOrigin?: boolean;
  signalTier?: 'observe' | 'review' | 'exception';
  healthStatus?: 'healthy' | 'review' | 'exception';
  closeReason?: string | null;
}

export type FuelCoverageType = 'Percentage' | 'Fixed_Amount' | 'Full';

export interface FuelRule {
  id: string;
  category: 'Fuel';
  coverageType: FuelCoverageType;
  coverageValue: number;
  rideShareCoverage?: number;
  companyUsageCoverage?: number;
  deadheadCoverage?: number;
  personalCoverage?: number;
  miscCoverage?: number;
  conditions?: {
    maxAmount?: number;
    requiresReceipt?: boolean;
  };
}

export interface FuelScenarioVersion {
  id: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  rules: FuelRule[];
  driverIds?: string[];
  createdAt: string;
}

export interface FuelScenario {
  id: string;
  name: string;
  description?: string;
  rules: FuelRule[];
  isDefault?: boolean;
  versions?: FuelScenarioVersion[];
}

export interface WeeklyFuelReport {
  id: string;
  weekStart: string;
  weekEnd: string;
  vehicleId: string;
  driverId: string;
  vehicleIds?: string[];
  vehiclePlates?: string[];
  totalGasCardCost: number;
  totalTripDistance: number;
  rideShareCost: number;
  companyMiscDistance: number;
  companyUsageCost: number;
  personalDistance: number;
  personalUsageCost: number;
  deadheadDistance: number;
  deadheadCost: number;
  miscellaneousCost: number;
  /** F-1/N-2: first-fill litres × price — tank-window timing, not leakage. */
  windowTimingCost?: number;
  /** N-2: no-odometer fill litres × price — unmeasured burn, gated separately. */
  unattributedFillCost?: number;
  /** N-4: driver share of misc from coverage split (0 under F-8). */
  driverMiscShare?: number;
  companyShare: number;
  driverShare: number;
  status: 'Draft' | 'Finalized';
  healthStatus?: 'Emerald' | 'Amber' | 'Red';
  healthScore?: number;
  finalizedAt?: string;
  metadata?: any;
  deadheadMeta?: {
    method: 'A' | 'C' | 'combined' | 'fallback';
    confidenceLevel: 'high' | 'medium' | 'low';
    confidenceReason: string;
    serverDeadheadKm: number;
    serverPersonalKm: number;
  };
  pendingCount?: number;
  signature?: string;
  signedAt?: string;
  odometerBuckets?: OdometerBucket[];
  dataQuality?: {
    odometerIncomplete?: boolean;
  };
  fuelCycles?: FuelCycle[];
}

/** Trip fields used by fuel calc (structurally compatible with @roam/types Trip). */
export type FuelCalcTrip = {
  id?: string;
  date: string;
  driverId: string;
  vehicleId?: string;
  amount: number;
  status: 'Completed' | 'Cancelled' | 'Processing';
  platform?: string;
  distance?: number | null;
  normalizedEnrouteDistance?: number | null;
  normalizedOpenDistance?: number | null;
  normalizedUnavailableDistance?: number | null;
  requestTime?: string;
  dropoffTime?: string;
  startOdometer?: number;
  endOdometer?: number;
  indriveNetIncome?: number | null;
  uberFareComponents?: number | null;
  uberTips?: number | null;
  uberPriorPeriodAdjustment?: number | null;
};

export type PersonalAllowanceBand = {
  minPctInclusive: number;
  maxPctExclusive: number | null;
  earnedKm: number;
};

export type PersonalAllowanceTierConfig = {
  enabled: boolean;
  weeklyQuotaOverrideJmd: number | null;
  nextWeekBonusKm: number;
  bands: PersonalAllowanceBand[];
};

export type QuotaConfig = {
  daily: { enabled: boolean; amount: number; workingDays?: number[] };
  weekly: { enabled: boolean; amount: number; workingDays?: number[] };
  monthly: { enabled: boolean; amount: number; workingDays?: number[] };
};

/** Vehicle fields used by cycle + recon engines. */
export type FuelCalcVehicle = {
  id: string;
  licensePlate?: string;
  currentDriverId?: string;
  fuelScenarioId?: string;
  specifications?: { tankCapacity?: number | string | null };
  fuelSettings?: {
    efficiencyCity?: number;
    tankCapacity?: number | string | null;
    cycleCloseMode?: string;
  };
  driverAssignmentHistory?: Array<{
    driverId: string;
    driverName: string;
    assignedAt: string;
    unassignedAt?: string;
    assignedBy?: string;
  }>;
};
