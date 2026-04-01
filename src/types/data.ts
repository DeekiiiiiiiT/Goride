import { RoutePoint, TripStop } from './tripSession';

export interface Trip {
  id: string;
  platform: 'Uber' | 'Lyft' | 'Bolt' | 'InDrive' | 'Roam' | 'GoRide' | 'Private' | 'Cash' | 'Other';
  paymentMethod?: 'Cash' | 'Card' | 'Digital (card/Bank)'; // Cash vs platform-settled (Uber: braintree, etc.)
  date: string; // ISO date string
  requestTime?: string; // ISO date string
  dropoffTime?: string; // ISO date string
  serviceType?: string; // e.g. UberX
  serviceCategory?: 'ride' | 'courier'; // ride = normal trip, courier = delivery (e.g. InDrive Courier)
  driverId: string;
  driverName?: string;
  amount: number;
  status: 'Completed' | 'Cancelled' | 'Processing';
  distance?: number;
  duration?: number; // minutes
  pickupLocation?: string;
  dropoffLocation?: string;
  vehicleId?: string;
  notes?: string;
  batchId?: string; // ID of the upload batch this trip belongs to
  
  // Financial Reconciliation (Phase 3)
  cashCollected?: number; // The amount of physical cash the driver collected
  netPayout?: number;     // Calculated: amount - cashCollected
  
  // Detailed Financials (Phase 2 Extension)
  grossEarnings?: number; // "Paid to you"
  fareBreakdown?: {
    baseFare: number;
    tips: number;
    waitTime: number;
    surge: number;
    airportFees: number;
    timeAtStop: number;
    taxes: number;
  };
  tollCharges?: number;
  netToDriver?: number; // "Your earnings" - adjustments

  // Phase 4: Trip Analysis
  speed?: number;       // Distance / Duration
  timeOfDay?: number;   // 0-23 hour
  pickupArea?: string;  // Extracted from address
  dropoffArea?: string; // Extracted from address
  efficiency?: number;  // Amount / Distance
  normalizedEnrouteDistance?: number; // Phase 4 Fix: Derived from CSV Totals
  normalizedOpenDistance?: number;    // Phase 4 Fix: Derived from CSV Totals for Open Distance
  normalizedUnavailableDistance?: number; // Phase 4 Fix: Derived from CSV Totals for Unavailable Distance
  route?: RoutePoint[]; // Phase 2: Live Trip Route Data
  stops?: TripStop[];   // Phase 2.1: Multi-Stop Support
  totalWaitTime?: number; // Phase 2.1: Wait Time Tracking
  
  // Phase 1 (Trip Logs Enhancement): Enhanced Data Fields
  requestTime?: string; // ISO date string
  dropoffTime?: string; // ISO date string
  productType?: string; // UberX, Comfort, etc.
  earningsPerKm?: number;
  earningsPerMin?: number;
  efficiencyScore?: number; // 0-100
  routeId?: string; // pickupZone_dropoffZone
  tripRating?: number; // 1-5
  dayOfWeek?: string; // Mon-Sun
  
  // Coordinate Persistence (Phase 1 Fix)
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  
  // Phase 2 (Static Import Reconstruction): Fleet Efficiency
  onTripHours?: number;   // Period 3
  toTripHours?: number;   // Period 2
  availableHours?: number; // Period 1 (Allocated)
  totalHours?: number;    // Total Online Time attributed

  cancellationReason?: string;
  cancelledBy?: 'rider' | 'driver' | 'admin';
  estimatedLoss?: number; // For cancelled trips
  
  // Phase 6: Anchor Period Tracking
  anchorPeriodId?: string; // Links to the startAnchor ID
  isPersonal?: boolean;    // Explicitly marked as personal if not from platform

  // Phase 6: Metadata Schema Extension
  resolutionMethod?: 'instant' | 'background' | 'manual' | 'pending';
  resolutionTimestamp?: string; // ISO date string
  geocodeError?: string;

  // InDrive Fee Tracking
  indriveNetIncome?: number;          // What the driver keeps after InDrive's cut
  indriveServiceFee?: number;         // Auto-calculated: amount - indriveNetIncome
  indriveServiceFeePercent?: number;  // Auto-calculated: (fee / amount) * 100
  indriveBalanceDeduction?: number;   // Fee deducted from driver's InDrive Balance (cash trips only)

  // Multi-stop trips (e.g. InDrive)
  intermediateStops?: { id: string; address: string; coords?: { lat: number; lon: number } }[];

  /** Uber CSV: payments row(s) merged but no row from trip_activity.csv for this Trip UUID (e.g. date cutoff mismatch). */
  missingTripActivityInExport?: boolean;

  /**
   * Phase 2 (Uber SSOT canonical decomposition): per-trip fare vs tip components parsed from
   * `payments_transaction.csv` (uber payment rows).
   *
   * These are additive components used for reconciliation later (ledger generation in Phase 3).
   */
  uberFareComponents?: number; // "fare-only" components, excluding tips
  uberTips?: number; // per-trip tips extracted from Uber payments rows
  uberSsotFarePlusTipsMatch?: boolean; // whether (fareComponents + tips) matches the row gross (within tolerance)

  /**
   * Phase 4: SSOT allocations (statement-level components distributed across trips).
   * These values are derived from `payments_driver.csv` totals during the import merge phase.
   */
  uberPromotionsAmount?: number;
  uberRefundExpenseAmount?: number;

  [key: string]: any; // Allow dynamic properties
}

export interface CancellationMetrics {
  totalCancelled: number;
  cancellationRate: number; // 0-1
  byReason: { reason: string; count: number }[];
  byTimeOfDay: { hour: number; count: number }[];
  estimatedRevenueLost: number;
  topCancellationAreas: { area: string; count: number }[];
}

export interface RouteMetrics {
  routeId: string; // pickupZone_dropoffZone
  pickupZone: string;
  dropoffZone: string;
  totalTrips: number;
  avgEarnings: number;
  avgDistance: number;
  avgDuration: number; // minutes
  profitabilityScore: number; // 0-100
  surgeFrequency: number; // 0-1
}

export interface TimePatternMetrics {
  hour: number; // 0-23
  dayOfWeek: string; // Mon-Sun
  avgDemand: number; // relative score or trip count
  avgEarnings: number;
  cancellationRate: number;
  isPeak: boolean;
}

export interface TripAnalytics {
  geographic: {
    topPickups: { area: string; count: number }[];
    topDropoffs: { area: string; count: number }[];
    mostProfitableRoutes: { route: string; earningsPerKm: number }[];
  };
  patterns: {
    avgDistance: number;
    avgDuration: number;
    peakHours: { hour: number; count: number }[];
  };
  cancellations: {
    rate: number;
    byHour: { hour: number; count: number }[];
  };
}

export interface ImportBatch {
  id: string;
  fileName: string; // or multiple files joined
  uploadDate: string;
  status: 'completed' | 'error';
  recordCount: number;
  type: string; // 'uber_trip', 'uber_payment', 'merged', etc.
  processedBy?: string;
}

export type FieldType = 'text' | 'number' | 'date' | 'address';

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean; // If true, cannot be deleted and must be mapped for import to proceed
  removable?: boolean; // If true, can be deleted from the list
  description?: string;
}

export interface CsvMapping {
  date: string;
  amount: string;
  driverId: string;
  platform?: string;
  status?: string;
  distance?: string;
  duration?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  driverName?: string;
  vehicleId?: string;
  notes?: string;
  [key: string]: string | undefined; // Allow dynamic mapping
}

export interface ParsedRow {
  [key: string]: string | number | undefined;
}

export type NotificationType = 'alert' | 'update' | 'reminder' | 'success';
export type NotificationSeverity = 'info' | 'warning' | 'critical' | 'success';

export interface Notification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: 'cancellation_rate' | 'revenue_drop' | 'driver_inactive' | 'high_wait_time';
  condition: 'gt' | 'lt';
  threshold: number;
  severity: NotificationSeverity;
  enabled: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string; // 'admin' | 'fleet_owner' | 'fleet_manager' | 'fleet_accountant' | 'fleet_viewer' | 'driver'
  status: 'active' | 'invited' | 'disabled';
  lastActive?: string;
  avatarUrl?: string;
  isOwner?: boolean;
  invitedBy?: string | null;
  invitedAt?: string | null;
}

export type BusinessType = 'rideshare' | 'delivery' | 'taxi' | 'trucking' | 'shipping';

export interface FleetConfig {
  fleetName: string;
  serviceArea: string;
  vehicleTypes: string[];
  currency: string;
  timezone: string;
  businessType?: BusinessType;
}

// --- Phase 1: New Data Architecture for Uber Reporting ---

// 1. Driver Performance & Quality
export interface DriverMetrics {
  id: string; // Composite key (driverId_date)
  driverId: string;
  driverName: string;
  periodStart: string; // ISO Date
  periodEnd: string;   // ISO Date
  
  // Quality Metrics (REPORT_TYPE_DRIVER_QUALITY)
  acceptanceRate: number;    // 0.0 to 1.0
  cancellationRate: number;  // 0.0 to 1.0
  completionRate: number;    // 0.0 to 1.0
  ratingLast500: number;     // e.g. 4.85
  ratingLast4Weeks: number;  // e.g. 4.90
  
  // Activity Metrics (REPORT_TYPE_DRIVER_ACTIVITY)
  onlineHours: number;       // Decimal format (e.g., 8.5)
  onTripHours: number;
  hoursOnJob?: number;
  tripsCompleted: number;

  // Phase 2 (Time & Distance Reports)
  openTime?: number;
  enrouteTime?: number;
  unavailableTime?: number;
  
  openDistance?: number;
  enrouteDistance?: number;
  onTripDistance?: number;
  unavailableDistance?: number;

  // Financial Metrics (REPORT_TYPE_PAYMENTS_DRIVER)
  totalEarnings?: number;
  cashCollected?: number;
  
  // Phase 2 New Metrics
  netEarnings?: number;       // totalEarnings - expenses
  cashFlowRisk?: 'HIGH' | 'OK'; 
  expenseRatio?: number;      // (expenses / totalEarnings) * 100
  refundsAndExpenses?: number;

  // Phase 3: Scorecard & Tiers
  score?: number; // 0 to 100
  tier?: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
  tierConfigId?: string; // Phase 1: Dynamic Tier Link
  recommendation?: string;

  // Phase 6: Source Tracking ("Source of Truth" Logic)
  // Tracks where this driver record was sourced from: 'activity', 'payment', 'quality', 'org_file'
  dataSources?: string[];
  
  // Phase 3: Identity Flags
  isFleetOwner?: boolean;
}

// 2. Vehicle ROI & Health
export interface VehicleMetrics {
  id: string; // Composite key (plate_date)
  vehicleId: string; // Internal UUID if mapped, otherwise plate
  plateNumber: string;
  vehicleName: string; // Year Make Model
  periodStart: string;
  periodEnd: string;

  // Performance (REPORT_TYPE_VEHICLE_PERFORMANCE)
  totalEarnings: number;
  earningsPerHour: number;
  tripsPerHour: number;
  onlineHours: number;
  onTripHours: number;
  hoursOnJob?: number; // Added for vehicle performance
  totalTrips: number;
  
  // Phase 2 New Metrics
  utilizationRate?: number; // (onTripHours / onlineHours) * 100
  costEfficiency?: number;  // earningsPerHour / target (default target needed)
  
  // Phase 2 (Time & Distance Reports)
  openTime?: number;
  enrouteTime?: number;
  unavailableTime?: number;
  
  openDistance?: number;
  enrouteDistance?: number;
  onTripDistance?: number;
  unavailableDistance?: number;

  // Phase 4: Vehicle Health & Maintenance
  maintenanceStatus?: 'Good' | 'Due Soon' | 'Critical';
  roiScore?: number; // 0-100 score based on earnings vs average
  mileageEfficiency?: number; // Earnings / Distance (if distance available)
}

// 3. Financial Reconciliation
export interface FinancialRecord {
  id: string; // Transaction UUID
  driverId: string;
  tripId?: string; // Optional: Links to Trip Table
  organizationId?: string;
  
  timestamp: string;
  description: string;
  category: 'Trip_Earnings' | 'Fare_Adjustment' | 'Incentive' | 'Fee' | 'Tax' | 'Cash_Collection' | 'Transfer' | 'Tip' | 'Settlement';
  
  amount: number;        // Net impact on wallet (Earnings - Fees)
  cashCollected: number; // Specific cash field for reconciliation
  taxes: number;
  
  // Phase 2 New Metrics
  netTransaction?: number; // Earnings - Payouts
  cashPercentage?: number; // (Cash Collected / Earnings) * 100
  payouts?: number;
  earnings?: number;
}

// 4. Leasing / Rental
export interface RentalContract {
  termId: string; // Term UUID
  driverId: string;
  organizationId: string;
  
  startDate: string;
  endDate: string;
  status: 'Active' | 'Closed' | 'Default';
  
  // Financials (REPORT_TYPE_RENTAL_PAYMENTS_CONTRACT)
  balanceStart: number;
  totalCharges: number; // Rental fees + debits
  totalPaid: number;    // Deducted from earnings
  balanceEnd: number;

  // Phase 5: Rental Logic
  paymentStatus?: 'On Track' | 'Overdue' | 'Paid Off';
  collectionRate?: number; // (totalPaid / totalCharges) * 100
  weeksRemaining?: number; // If total contract value known (placeholder)
}

// Phase 1: Fuel Management Types
export interface FuelCard {
    id: string;
    cardNumber: string; 
    provider: string;
    status: 'Active' | 'Inactive';
    assignedVehicleId?: string;
}

// 5. Organization Metrics (Phase 2 New)
export interface OrganizationMetrics {
    periodStart: string;
    periodEnd: string;
    totalEarnings: number;
    netFare: number;
    balanceStart: number;
    balanceEnd: number;
    bankTransfer?: number;
    
    // Calculated
    periodChange: number;       // End - Start
    fleetProfitMargin: number;  // (NetFare / TotalEarnings) * 100
    cashPosition: number;       // CashCollected / TotalEarnings
    
    // Phase 6: Fleet Analytics
    activeDrivers?: number;
    activeVehicles?: number;
    totalTrips?: number;
    fleetUtilization?: number; // Average of all vehicle utilizations
    totalCashExposure?: number; // Sum of all cash collected
}

// Phase 8.4: Driver Portal & Maintenance Reporting
export interface FuelLog {
  id: string;
  driverId: string;
  vehicleId: string;
  date: string;
  odometer?: number | null;
  liters: number;
  totalCost: number;
  entryMode: 'Anchor' | 'Floating';
  paymentSource: 'RideShare_Cash' | 'Gas_Card' | 'Personal' | 'Petty_Cash';
  receiptUrl?: string;
  notes?: string;
}

export interface ServiceRequest {
  id: string;
  driverId: string;
  vehicleId: string;
  date: string;
  type: 'Maintenance' | 'Repair' | 'Inspection' | 'Emergency';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  description: string;
  odometer?: number;
  status: 'Pending' | 'Scheduled' | 'In-Progress' | 'Completed' | 'Cancelled';
}

// --- Phase 1: Enhanced Transaction Data Structure (Transactions Tab Enhancement) ---

export type TransactionType = 'Revenue' | 'Expense' | 'Payout' | 'Transfer' | 'Adjustment' | 'Float_Given' | 'Payment_Received' | 'Reimbursement' | 'Fuel_Manual_Entry';

export type TransactionCategory = 
  // Revenue
  | 'Fare Earnings' | 'Tips' | 'Surge Pricing' | 'Bonuses' | 'Other Income' 
  // Expenses
  | 'Fuel' | 'Maintenance' | 'Insurance' | 'Registration' | 'Tolls' | 'Driver Payouts' | 'Cash Collection Fees' | 'Bank Charges' | 'Office Expenses' | 'Software/Subscription' | 'Marketing' | 'Other Expenses'
  // Payouts
  | 'Vehicle Payment' | 'Supplier Payment' | 'Tax Payment'
  // Wallet
  | 'Cash Collection' | 'Float Issue'
  /** Fleet top-up to driver InDrive digital wallet — maps to ledger `wallet_credit` (see `INDRIVE_WALLET_LOAD_CATEGORY`). */
  | 'InDrive Wallet Credit';

export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'Digital Wallet' | 'Credit Card' | 'Mobile Money' | 'Check' | 'Other' | 'Gas Card';

export type TransactionStatus = 'Completed' | 'Pending' | 'Failed' | 'Reconciled' | 'Void' | 'Verified' | 'Approved' | 'Rejected' | 'Flagged';

// ─── Write-Time Ledger Types ──────────────────────────────────────────

export type LedgerEventType =
  | 'fare_earning'
  | 'tip'
  | 'promotion'
  | 'refund_expense'
  | 'surge_bonus'
  | 'fuel_expense'
  | 'fuel_reimbursement'
  | 'toll_charge'
  | 'toll_refund'
  | 'maintenance'
  | 'insurance'
  | 'driver_payout'
  | 'cash_collection'
  | 'platform_fee'
  | 'wallet_credit'
  | 'wallet_debit'
  | 'cancelled_trip_loss'
  | 'adjustment'
  | 'other';

export type LedgerDirection = 'inflow' | 'outflow';

export type LedgerSourceType = 'trip' | 'transaction' | 'manual' | 'system';

export interface LedgerEntry {
  id: string;
  date: string;                     // ISO date YYYY-MM-DD
  time?: string;                    // HH:mm:ss
  createdAt: string;                // ISO datetime

  // WHO
  driverId: string;                 // Canonical Roam UUID (resolved at write time)
  driverName?: string;
  vehicleId?: string;
  vehiclePlate?: string;

  // WHAT
  eventType: LedgerEventType;
  category: string;
  description: string;
  platform?: string;

  // MONEY
  grossAmount: number;
  netAmount: number;
  currency: string;
  paymentMethod?: string;

  // ACCOUNTING
  direction: LedgerDirection;
  isReconciled: boolean;
  reconciledAt?: string;
  reconciledBy?: string;

  // SOURCE LINKAGE
  sourceType: LedgerSourceType;
  sourceId: string;
  batchId?: string;
  batchName?: string;

  // FLEXIBLE METADATA
  metadata?: Record<string, any>;
}

export interface LedgerFilterParams {
  driverId?: string;
  driverIds?: string[];
  vehicleId?: string;
  startDate?: string;
  endDate?: string;
  eventType?: LedgerEventType;
  eventTypes?: LedgerEventType[];
  direction?: LedgerDirection;
  platform?: string;
  isReconciled?: boolean;
  batchId?: string;
  sourceType?: LedgerSourceType;
  minAmount?: number;
  maxAmount?: number;
  searchTerm?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'date' | 'amount' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}

export interface PaginatedLedgerResponse {
  data: LedgerEntry[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface LedgerDriverOverview {
  period: {
    earnings: number;
    cashCollected: number;
    tolls: number;
    tips: number;
    baseFare: number;
    /**
     * Uber SSOT reconciliation view — ledger-derived totals for Uber components.
     * (Includes allocated statement-level promotions + refund/expense outflows.)
     */
    uber?: {
      fareComponents: number;
      tips: number;
      promotions: number;
      refundExpense: number; // positive magnitude
      netEarnings: number; // fare + tips + promotions - refundExpense
    };
    /** Sum of ledger platform_fee events; gross−net on fares is separate (baseFare − earnings). */
    platformFees: number;
    /** platform_fee ledger entries, split by platform. */
    platformFeesByPlatform?: Record<string, number>;
    /** Per-platform sum of (grossAmount − netAmount) on fare_earning lines. */
    fareGrossMinusNetByPlatform?: Record<string, number>;
    tripCount: number;
    cancelledCount: number;
    disputeRefunds?: number; // Phase 8: Support Adjustment refund totals
  };
  prevPeriod: {
    earnings: number;
  };
  lifetime: {
    earnings: number;
    tripCount: number;
    cashCollected: number;
    tolls: number;
    uber?: {
      fareComponents: number;
      tips: number;
      promotions: number;
      refundExpense: number;
      netEarnings: number;
    };
    disputeRefunds?: number; // Phase 8: Lifetime dispute refund totals
  };
  platformStats: Record<string, {
    earnings: number;
    tripCount: number;
    cashCollected: number;
    tolls: number;
  }>;
  dailyEarnings: Array<{
    date: string;
    total: number;
    byPlatform: Record<string, number>;
  }>;
  completeness?: {
    totalTrips: number;
    ledgerTrips: number;
    isComplete: boolean;
    missingCount: number;
    byPlatform: Record<string, { trips: number; ledger: number }>;
  };
}

/**
 * GET `/ledger/driver-indrive-wallet` (Phase 2 + Phase 7). All amounts same currency as fleet (e.g. JMD).
 *
 * **`periodFees` (canonical, Phase 2):** Within `[startDate, endDate]`, sum **absolute** fee impact
 * for InDrive:
 * 1. Primary: sum `|netAmount|` (or signed outflow magnitude) on ledger rows with `eventType === 'platform_fee'`,
 *    `platform === 'InDrive'` (after `GoRide` → `Roam` normalization does not apply to InDrive).
 * 2. If that sum is **0**, use sum of `(grossAmount - netAmount)` on `fare_earning` rows for InDrive in range
 *    (matches “Implied on fare” / `fareGrossMinusNetByPlatform.InDrive` in driver-overview).
 * This single rule must match the InDrive fee story shown in the Period earnings breakdown overlay.
 *
 * **`estimatedBalance` (Phase 7):** `lifetimeLoads - lifetimeInDriveFees` where `lifetimeInDriveFees` applies the
 * same two-step rule over **all** ledger rows (no date filter). Not InDrive’s official balance.
 */
export interface IndriveWalletSummary {
  periodLoads: number;
  periodFees: number;
  lifetimeLoads: number;
  /**
   * Phase 7 — `lifetimeLoads − lifetimeInDriveFees` (same fee rule as `periodFees`, lifetime scope).
   * Fleet estimate only; not InDrive’s official app balance. Do not conflate with Roam cash or other platforms.
   */
  estimatedBalance: number;
}

export interface IndriveWalletSummaryResponse {
  success: boolean;
  data?: IndriveWalletSummary;
  error?: string;
}

/**
 * Required shape for creating an InDrive wallet load via `saveTransaction` (Phase 5).
 * Optional fields may be set by the server or UI defaults.
 */
export interface IndriveWalletLoadTransactionInput {
  driverId: string;
  date: string;
  /** Must be > 0. */
  amount: number;
  category: 'InDrive Wallet Credit';
  platform: 'InDrive';
  type: 'Adjustment';
  description?: string;
  paymentMethod?: PaymentMethod;
  status?: TransactionStatus;
  referenceNumber?: string;
  metadata?: Record<string, unknown>;
}

export interface FinancialTransaction {
  id: string; // Transaction UUID
  date: string; // ISO Date YYYY-MM-DD
  time?: string; // HH:mm:ss
  driverId?: string; 
  driverName?: string;
  vehicleId?: string;
  vehiclePlate?: string;
  tripId?: string;
  
  type: TransactionType;
  category: TransactionCategory | string; 
  description: string;
  
  amount: number; // Signed value: + for inflow, - for outflow
  
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  
  referenceNumber?: string;
  receiptUrl?: string;
  
  taxAmount?: number;
  netAmount?: number;
  
  balanceAfter?: number;
  bankAccount?: string;
  processedDate?: string;
  isReconciled: boolean;
  
  // Phase 1 Refactor: Fuel Anchor Tracking
  anchorPeriodId?: string; // Links this transaction to a specific fuel window
  reconciliationStatus?: 'Pending' | 'Verified' | 'Flagged' | 'Observing' | 'Archived';
  
  // Expense Specific Fields
  odometer?: number;
  odometerProofUrl?: string; // Phase 1: Fuel Log Enhancement
  quantity?: number; // Liters/Gallons
  isFullTank?: boolean; // Phase 1: Fuel Log Enhancement
  unitPrice?: number;
  subType?: string; // Fuel Type (Regular/Diesel) or Service Type (Oil Change)
  vendor?: string; // Service Provider or Station
  
  // Maintenance Specific
  partsCost?: number;
  laborCost?: number;

  notes?: string;

  // Import/Source Tracking
  batchId?: string;
  batchName?: string;
  
  // New Fields for Cash Wallet
  metadata?: {
    odometerMethod?: 'ai_verified' | 'manual_override' | 'manual';
    aiConfidence?: string;
    odometerProofUrl?: string;
    approvalReason?: string;
    approvedAt?: string;

    // Phase 1: Ledger Accounting
    isDebit?: boolean;
    isCredit?: boolean;
    
    // Phase 1 (Unverified Vendor System): Gate-Hold & Vendor Verification
    stationGateHold?: boolean;           // Gate-hold flag for unverified vendors
    gateReason?: string;                 // Reason for gate-hold
    unverifiedVendorId?: string;         // Link to unverified_vendor:* entry
    vendorVerificationStatus?: 'pending' | 'verified' | 'rejected';
    vendorMatchedAt?: string;            // ISO timestamp when vendor was verified
    
    [key: string]: any;
  };
}

export interface BankReconciliationRecord {
  id: string;
  statementDate: string;
  transactionDate: string;
  description: string;
  bankAmount: number;
  systemAmount?: number;
  matchStatus: 'Matched' | 'Unmatched' | 'Partial';
  difference: number;
  reconciledBy?: string;
  reconciledDate?: string;
  notes?: string;
}

export interface CashFlowRecord {
  date: string; // YYYY-MM-DD
  openingBalance: number;
  cashIn: number;
  cashOut: number;
  closingBalance: number;
  
  breakdown: {
    cashOnHand: number;
    bankBalance: number;
  };
  
  dailyVariance?: number;
  weekAverage?: number;
  notes?: string;
}

// --- Phase 1: Fleet Analytics Dashboard Data Architecture ---

// 1.1 Dashboard Live Metrics
export interface DashboardMetrics {
  timestamp: string; // ISO String
  date: string; // YYYY-MM-DD
  hour: number; // 0-23
  
  // Real-time Counts
  activeDrivers: number;
  vehiclesOnline: number;
  tripsInProgress: number;
  tripsCompletedToday: number;
  
  // Financials
  earningsToday: number;
  
  // Performance Rates
  avgAcceptanceRate: number; // 0-1
  avgCancellationRate: number; // 0-1
  fleetUtilization: number; // 0-100
  
  // Leaderboard Highlights
  topDriverName: string;
  topDriverEarnings: number;
  bottomDriverName: string;
  
  // Alerts Summary
  criticalAlertsCount: number;
  alertDetails: string; // JSON string or summary
  
  lastUpdateTime: string;
}

// 1.3 Historical Dashboard Archive
export interface DashboardHistory {
  date: string;
  hour: number;
  metricName: string;
  metricValue: number;
  changeVsLastHour: number; // Percentage
  changeVsYesterday: number; // Percentage
  changeVsLastWeek: number; // Percentage
  notes?: string;
}

// 1.4 Alert Definitions (Enhanced)
export interface DashboardAlertDefinition {
  id: string;
  name: string;
  condition: string; // e.g., "acceptance_rate < 0.5"
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  notificationType: 'dashboard' | 'email' | 'sms' | 'call';
  actionRequired: string;
  autoResolve: boolean;
  checkFrequency: '15min' | 'hourly' | 'daily';
  lastTriggered?: string;
  active: boolean;
}

export interface DashboardAlert {
  id: string;
  definitionId: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  status: 'new' | 'viewed' | 'acknowledged' | 'resolved';
  driverId?: string;
  vehicleId?: string;
  routeId?: string;
  metadata?: Record<string, any>;
}

// --- Phase 1: Budget Data Structure ---

export interface Budget {
  id: string;
  month: string; // YYYY-MM
  category: string; // e.g., 'Fuel', 'Maintenance', 'Insurance', 'Cleaning'
  limit: number; // Target budget amount
}

export interface ExpenseSummary {
  category: string;
  actual: number;
  budget: number;
  variance: number;
}

// --- Phase 1: AI Analysis Types ---

export interface FleetAnalysisResult {
  metadata: {
    analysisDate: string;
    periodStart: string;
    periodEnd: string;
    filesProcessed: number;
    fleetName?: string; // Phase 1: Fleet Identity
  };
  
  // Detailed Section Data
  drivers: DriverMetrics[];
  vehicles: VehicleMetrics[];
  financials: OrganizationMetrics;
  
  // Qualitative Insights
  insights: {
    alerts: string[]; // "Ghost Trip detected for ID X"
    trends: string[]; // "Earnings up 10% vs last week"
    recommendations: string[]; // "Driver Y needs coaching on cancellations"
    phantomTrips?: any[]; 
  };
}

// --- Phase 1: AI Auditor & Data Validation Types ---

export type AuditStatus = 'healthy' | 'warning' | 'critical';

export interface AuditIssue {
  id: string; // Unique ID for the issue
  field?: string; // The specific field (e.g. "amount", "driverName")
  message: string; // Human readable error
  severity: AuditStatus;
  rowId?: string; // Link to the specific row ID (driverId, tripId)
}

// Wrapper for any data row to include audit metadata
export interface AuditRecord<T> {
  data: T;
  originalData?: T; // For diffing
  status: AuditStatus;
  issues: AuditIssue[];
  isFlagged: boolean; // If true, requires manual approval
}

// The High-Level Health Report
export interface AuditReport {
  score: number; // 0-100 Health Score
  status: AuditStatus;
  summary: string; // "Data looks good, 2 warnings."
  
  // Counts
  totalRecords: number;
  healthyCount: number;
  warningCount: number;
  criticalCount: number;
  
  // Categorized Issues
  issues: AuditIssue[]; 
  
  // Projections (Before vs After)
  impact: {
    revenueChange: number; // Percentage
    activeDriversChange: number; // Count
    newAnomalies: number;
  };
}

// The "Smart State" for the Imports Page
export interface ImportAuditState {
  raw: FleetAnalysisResult | null; // The original AI output
  sanitized: {
    drivers: AuditRecord<DriverMetrics>[];
    vehicles: AuditRecord<VehicleMetrics>[];
    financials: AuditRecord<OrganizationMetrics>; // Single record
    trips?: AuditRecord<Trip>[]; // Optional for now, added in Phase 3
  };
  report: AuditReport;
}

// --- Phase 4: Toll Management ---

export interface TollTag {
  id: string;
  provider: string; // e.g., 'T-Tag', 'E-ZPass'
  tagNumber: string;
  status: 'Active' | 'Inactive' | 'Lost';
  assignedVehicleId?: string; // Links to vehicle
  assignedVehiclePlate?: string; // Derived for display
  addedOn: string; // ISO Date
}

// --- Phase 5: Claims & Disputes ---

export interface Claim {
  id: string;
  type: 'Toll_Refund' | 'Wait_Time' | 'Cleaning_Fee';
  status: 'Open' | 'Sent_to_Driver' | 'Submitted_to_Uber' | 'Resolved' | 'Rejected';
  driverId: string;
  tripId?: string; // Links to the Uber trip
  transactionId?: string; // Links to the financial transaction (Toll Tag charge)
  resolutionTransactionId?: string; // Links to the generated adjustment transaction (for "Charge Driver" outcome)
  
  // Financials
  amount: number; // The amount to be claimed (Missing Amount)
  expectedAmount: number; // What should have been paid
  paidAmount: number; // What was paid
  
  // Content
  subject: string;
  message: string; // The generated text for the driver
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  evidenceUrls?: string[];
  
  // UI Display helpers
  tripDate?: string;
  pickup?: string;
  dropoff?: string;

  // Resolution Tracking
  resolutionReason?: 'Charge Driver' | 'Write Off' | 'Reimbursed' | 'Other';
  disputeRefundId?: string; // Phase 7: Links to dispute refund that auto-resolved this claim
}

// --- Dispute Refunds (Support Adjustment Import) ---

export interface DisputeRefund {
  id: string;                          // Generated UUID, unique per refund record
  supportCaseId: string;               // UUID extracted from Description field (format: "Support Adjustment:  <UUID>")
  amount: number;                      // Refund amount (always positive)
  date: string;                        // ISO timestamp from the CSV row
  driverId: string;                    // Driver UUID from CSV
  driverName: string;                  // Driver first + last name from CSV
  platform: string;                    // Source platform (e.g., "Uber")
  source: 'platform_import' | 'toll_usage'; // Which import path created this record
  status: 'unmatched' | 'matched' | 'auto_resolved'; // Lifecycle state
  matchedTollId: string | null;        // Toll transaction ID this refund was linked to
  matchedClaimId: string | null;       // Claimable Loss claim ID this refund resolved
  importedAt: string;                  // ISO timestamp of import
  resolvedAt: string | null;           // ISO timestamp of when matched/resolved
  resolvedBy: string | null;           // Admin who resolved, or "auto" for auto-match
  rawDescription: string;              // Full original Description field for audit trail
}

// --- Phase 1 Extension: Dynamic Tiers & Expenses ---

export interface TierConfig {
  id: string;
  name: string;
  minEarnings: number;
  maxEarnings: number | null; // null means "and above"
  sharePercentage: number; // 0-100 (Driver Share)
  color?: string; // Hex code for badges
}

export interface ExpenseSplitRule {
  id: string;
  category: string; // e.g., 'Fuel'
  name?: string; // Scenario Name (e.g., "Ride Share", "Personal")
  companyShare: number; // 0-100
  driverShare: number; // 0-100
  isDefault: boolean;
  customSplits?: {
    id: string;
    name: string;
    percentage: number;
  }[];
}

// --- Phase 1 Extension: Driver History (Monthly Tier Tracking) ---
export interface MonthlyPerformance {
  monthKey: string; // "YYYY-MM" for sorting
  monthLabel: string; // "October 2023" for display
  earnings: number;
  tripCount: number;
  tier: TierConfig;
  isCurrentMonth: boolean;
}

// --- Phase 1 Extension: Earning Quota Configuration ---
export interface QuotaPeriod {
  enabled: boolean;
  amount: number;
  workingDays?: number[];
}

export interface QuotaConfig {
  daily: QuotaPeriod;
  weekly: QuotaPeriod;
  monthly: QuotaPeriod;
}

export interface DriverGoal {
  current: number;
  target: number;
}

export interface DriverGoals {
  daily: DriverGoal;
  weekly: DriverGoal;
  monthly: DriverGoal;
}