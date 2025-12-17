export interface Trip {
  id: string;
  platform: 'Uber' | 'Lyft' | 'Bolt' | 'InDrive' | 'Other';
  date: string; // ISO date string
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
  
  // Phase 4: Trip Analysis
  speed?: number;       // Distance / Duration
  timeOfDay?: number;   // 0-23 hour
  pickupArea?: string;  // Extracted from address
  dropoffArea?: string; // Extracted from address
  efficiency?: number;  // Amount / Distance
  
  [key: string]: any; // Allow dynamic properties
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
  role: 'admin' | 'manager' | 'viewer';
  status: 'active' | 'invited' | 'disabled';
  lastActive?: string;
  avatarUrl?: string;
}

export interface FleetConfig {
  fleetName: string;
  serviceArea: string;
  vehicleTypes: string[];
  currency: string;
  timezone: string;
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
  tripsCompleted: number;

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
  recommendation?: string;
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
  totalTrips: number;
  
  // Phase 2 New Metrics
  utilizationRate?: number; // (onTripHours / onlineHours) * 100
  costEfficiency?: number;  // earningsPerHour / target (default target needed)
  
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

// 5. Organization Metrics (Phase 2 New)
export interface OrganizationMetrics {
    periodStart: string;
    periodEnd: string;
    totalEarnings: number;
    netFare: number;
    balanceStart: number;
    balanceEnd: number;
    
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
