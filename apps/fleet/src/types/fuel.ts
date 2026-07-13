import { LocationStatus } from './station';

export type FuelType = 'Gasoline_87' | 'Gasoline_91' | 'Gasoline_93' | 'Diesel' | 'Electric' | 'Hybrid';

export interface FuelCard {
  id: string;
  cardNumber: string; // Last 4 or full visible number
  provider: string; // e.g., 'Shell', 'FleetCor', 'Wex'
  status: 'Active' | 'Inactive' | 'Lost';
  assignedVehicleId?: string;
  assignedDriverId?: string;
  expiryDate?: string;
  notes?: string;
}

export interface FuelEntry {
  id: string;
  date: string; // ISO Date YYYY-MM-DD
  time?: string; // HH:mm:ss
  cardId?: string;
  vehicleId?: string;
  driverId?: string;
  
  amount: number; // Total Cost
  liters?: number; // Volume
  pricePerLiter?: number;
  
  odometer?: number | null;
  odometerImageUrl?: string; // Photo of odometer dashboard (admin upload)
  location?: string; // Station Name/Address
  stationAddress?: string; // Specific location/address
  
  type: 'Card_Transaction' | 'Manual_Entry' | 'Fuel_Manual_Entry' | 'Reimbursement';
  entryMode: 'Anchor' | 'Floating'; // Anchor = Verified Odo, Floating = Legacy/Cash without Odo
  paymentSource: 'RideShare_Cash' | 'Gas_Card' | 'Personal' | 'Petty_Cash';
  
  // Entry source tagging — distinguishes live driver submissions from admin back-office entries
  entrySource?: 'driver-portal' | 'admin-manual' | 'admin-edit' | 'bulk-import' | 'fuel-card';
  
  isFlagged?: boolean; // If capacity exceeded or outlier
  
  // Link to financial transaction
  transactionId?: string;

  // Geolocation & Matching (Phase 1)
  locationMetadata?: {
    lat: number;
    lng: number;
    accuracy: number;
    timestamp?: string;
  };
  geofenceMetadata?: {
    isInside: boolean;
    distanceMeters: number;
    timestamp: string;
    radiusAtTrigger: number;
  };
  locationStatus?: LocationStatus;
  matchedStationId?: string;
  deviationReason?: string;

  // Phase 1: Ledger Accounting & Threshold Cap
  volumeContributed?: number; // How much of this receipt went into the specific cycle
  isCarryover?: boolean; // If this entry was carried over from a previous overfill
  carryoverVolume?: number; // The amount carried over to the NEXT cycle
  
  // Phase 1 Refactor: Anchor Tracking
  anchorPeriodId?: string; // Links this entry to a specific odometer window
  reconciliationStatus?: 'Pending' | 'Verified' | 'Flagged' | 'Observing' | 'Archived';

  // Phase 7: Audit Status
  auditStatus?: 'Clear' | 'Observing' | 'Flagged' | 'Auto-Resolved';
  
  // Phase 2: Audit Metadata
  metadata?: {
    isEdited?: boolean;
    lastEditedAt?: string;
    editReason?: string;

    // Phase 1: Ledger Accounting
    isDebit?: boolean;
    isCredit?: boolean;
    
    // Phase 7: Advanced Predictive Metadata
    observationReason?: string;
    observationStartedAt?: string;
    expectedAnchorDate?: string;
    predictedEconomy?: number;
    varianceFromBaseline?: number;
    
    [key: string]: any;
  };
}

export interface MileageAdjustment {
  id: string;
  date: string;
  vehicleId: string;
  driverId: string;
  type: 'Company_Misc' | 'Personal' | 'Maintenance';
  distance: number; // in km/miles
  reason: string;
  approvedBy?: string;
}

/** Sentinel driverId for fills that could not be attributed. */
export const UNASSIGNED_FUEL_DRIVER_ID = '__unassigned__';

export interface WeeklyFuelReport {
  id: string; // composite: driverId_weekStart (legacy: vehicleId_weekStart)
  weekStart: string; // ISO Date (Monday)
  weekEnd: string; // ISO Date (Sunday)
  /** Primary vehicle for the week (highest spend); see vehicleIds for shared/multi-car. */
  vehicleId: string;
  driverId: string;
  /** All vehicles this driver fueled in the week. */
  vehicleIds?: string[];
  vehiclePlates?: string[];

  // 1. The Truth (Financial)
  totalGasCardCost: number;
  
  // 2. The Operation (Trips) -> Ride Share
  totalTripDistance: number;
  rideShareCost: number; // Previously operatingFuelCost
  
  // 3. Known Non-Trip (Adjustments) -> Company Usage
  companyMiscDistance: number;
  companyUsageCost: number; // Previously companyMiscCost
  
  // 4. Personal -> Driver Personal Fuel Usage
  personalDistance: number;
  personalUsageCost: number; // Previously personalCost
  
  // 4b. Deadhead (Repositioning) -> Work-related cruising fuel
  deadheadDistance: number;
  deadheadCost: number;

  // 5. The Leakage (Remainder) -> Miscellaneous
  miscellaneousCost: number; // Previously fuelMiscCost (GasCard - RideShare - CompanyUsage - Personal)
  
  // 6. The Split
  companyShare: number;
  driverShare: number;
  
  status: 'Draft' | 'Finalized';
  healthStatus?: 'Emerald' | 'Amber' | 'Red';
  healthScore?: number; // 0-100
  finalizedAt?: string;
  // metadata.rideShareCalc contains:
  //   totalRideshareKm: number - All distance segments summed (On Trip + Enroute + Open + Unavailable)
  //   observedEfficiency: number - km/L from odometer or fallback
  //   actualPricePerLiter: number - $/L from fuel entries or fallback
  //   efficiencySource: 'odometer' | 'vehicle_settings' | 'default_fallback'
  //   priceSource: 'fuel_entries' | 'default_fallback'
  //   totalLitersInPeriod: number
  //   tripsIncluded: number - Total trips counted
  //   completedTrips: number
  //   cancelledTrips: number
  metadata?: any;
  
  // Deadhead attribution metadata (from server-side engine)
  deadheadMeta?: {
    method: 'A' | 'C' | 'combined' | 'fallback';
    confidenceLevel: 'high' | 'medium' | 'low';
    confidenceReason: string;
    serverDeadheadKm: number;   // raw value from server before capping
    serverPersonalKm: number;   // raw value from server before capping
  };

  // Phase 3: Staged Reconciliation
  pendingCount?: number; // Number of logs waiting to be finalized
  
  // Phase 6: Cryptographic Integrity
  signature?: string;
  signedAt?: string;

  // Cached OdometerBucket[] from calculateOdometerBuckets().
  // Available after calculateReconciliation() runs. Used by Stop-to-Stop sidebar and health status.
  // These buckets use fuel-entry-only anchors. For unified anchors, BucketReconciliationView
  // fetches its own via odometerService.getUnifiedHistory().
  odometerBuckets?: OdometerBucket[];
}

/**
 * Snapshot shape frozen at Finalize time — extends WeeklyFuelReport with fields
 * that only exist once a period is settled and posted to the ledger.
 */
export interface FinalizedFuelReport extends WeeklyFuelReport {
  status: 'Finalized';
  finalizedAt: string;
  finalizedByUser?: string;
  /** Total the driver already paid out-of-pocket for fuel in this period (cash/manual entries). */
  driverSpend: number;
  /** driverSpend − driverShare. Positive = company owes the driver; negative = driver owes the company. */
  netPay: number;
  vehiclePlate?: string;
  vehicleModel?: string;
  driverName?: string;
  /**
   * Cumulative driver/company share actually posted to the financial ledger across
   * ALL finalize passes for this vehicle+week. Differs from driverShare/companyShare
   * (which are recomputed live from current data every finalize) only when a week is
   * re-finalized after new entries or scenario/adjustment changes shift the week's
   * observed efficiency or price-per-liter — those recompute the whole week's totals,
   * not just the delta, so posted totals must be tracked separately to detect drift.
   */
  postedDriverShare?: number;
  postedCompanyShare?: number;
}

export interface OdometerBucket {
  id: string;
  vehicleId: string;
  startOdometer: number;
  endOdometer: number;
  startDate: string;
  endDate: string;
  
  // Fuel Data
  actualFuelLiters: number;
  actualFuelCost: number;
  associatedReceipts: string[]; // List of FuelEntry IDs (Floating and Anchor) that fall in this window
  closingEntryId?: string; // The specific anchor entry that closed this bucket
  
  // Trip Data
  totalTripDistance: number;
  tripsCount: number;
  
  // Performance
  expectedFuelLiters: number; // based on vehicle MPG/Efficiency
  varianceLiters: number;
  variancePercent: number;
  
  // Attribution
  rideShareDistance: number;
  personalDistance: number;
  companyMiscDistance: number;
  unaccountedDistance: number; // The "Jump" or "Gap" (Bucket Range - sum of all trips)
  
  // Phase 4: Deduction Triggers
  deductionRecommendation?: number;
  deductionReason?: string;
  isDeductionPosted?: boolean;
  deductionTransactionId?: string;

  status: 'Complete' | 'Partial' | 'Anomaly';
}

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
  efficiency: number; // KM/L
  resetType: 'Manual' | 'Auto_Soft' | 'Auto_Anomaly';
  startOdometer?: number;
  endOdometer?: number;
  
  // Phase 1: Threshold Cap & Reset
  startingPercentage?: number;
  isCapped?: boolean;
  excessVolume?: number;
}

export type DisputeStatus = 'Open' | 'Resolved' | 'Rejected';

export type DisputeReason = 
  | 'Trip_Log_Error' 
  | 'Fuel_Transaction_Error' 
  | 'Mechanical_Issue' 
  | 'Theft_Suspected' 
  | 'Other';

export interface FuelDispute {
  id: string;
  weekStart: string; // ISO Date (Monday)
  weekEnd?: string; // ISO Date (Sunday) - Optional for backward compatibility
  vehicleId: string;
  driverId: string;
  createdAt: string;
  
  reason: DisputeReason;
  description: string;
  
  status: DisputeStatus;
  adminResponse?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export type FuelCoverageType = 'Percentage' | 'Fixed_Amount' | 'Full';

export interface FuelRule {
  id: string;
  category: 'Fuel'; // Removed Maintenance and Tolls as requested
  coverageType: FuelCoverageType;
  coverageValue: number; // e.g., 50 for 50%, or 100 for $100
  
  // Granular Percentages (0-100)
  // If provided, these override the generic coverageValue for Percentage rules
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

export interface BulkFuelExpenseEntry {
  id: string;
  date: string;
  time: string;
  amount: number;
  liters: number;
  pricePerLiter: number;
  odometer: number;
  location: string;
  stationAddress: string;
  receiptUrl?: string;
  notes?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}

export interface FuelScenarioVersion {
  id: string;
  /** Monday yyyy-MM-dd — version applies to weeks starting on/after this date. */
  effectiveFrom: string;
  /**
   * Optional Monday yyyy-MM-dd — exclusive end.
   * Version applies while weekStart < effectiveUntil.
   * Unset = never ends (open-ended).
   */
  effectiveUntil?: string;
  rules: FuelRule[];
  createdAt: string;
}

export interface FuelScenario {
  id: string;
  name: string; // e.g. "Standard Fleet", "Owner Operator", "Rental"
  description?: string;
  /** Latest version rules (kept in sync for legacy readers). */
  rules: FuelRule[];
  isDefault?: boolean;
  /** Coverage rule history keyed by effective-from Monday. */
  versions?: FuelScenarioVersion[];
}