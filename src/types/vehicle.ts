export type VehicleStatus = 'Active' | 'Maintenance' | 'Inactive' | 'Decommissioned';
export type ServiceStatus = 'OK' | 'Due Soon' | 'Overdue';

export type TollProvider = 'JRC' | 'T-Tag' | 'Other';
export type TollTagStatus = 'Active' | 'Inactive' | 'Lost' | 'Damaged';

export interface TollTag {
  id: string;
  provider: TollProvider;
  tagNumber: string;
  status: TollTagStatus;
  assignedVehicleId?: string;
  assignedVehicleName?: string; // Denormalized for easier display
  dateAdded?: string; // Date added to inventory/fleet
  providerBalance?: number;       // Phase 5: Manually entered balance from provider portal
  providerBalanceDate?: string;   // Phase 5: When the provider balance was last checked
  lowBalanceThreshold?: number;   // Phase 6: Alert when balance drops below this (default: 500)
  lastCalculatedBalance?: number; // Phase 6: Cached calculated balance for list-view badges
  lastUtilizationPercent?: number; // Phase 7: Cached tag utilization % for list-view badges
  assignmentHistory?: Array<{     // Phase 8: Tag assignment audit trail
    vehicleId: string;
    vehicleName: string;
    assignedAt: string;            // ISO date
    unassignedAt?: string;         // ISO date (undefined = currently assigned)
    assignedBy?: string;           // Admin name/ID (future use)
  }>;
  createdAt: string;
  updatedAt?: string;
}

export interface VehicleDocument {
  id: string;
  name: string;
  type: string;
  status: 'Verified' | 'Pending' | 'Expired' | 'Rejected';
  expiryDate: string;
  uploadDate: string;
  url?: string;
  metadata?: {
    valuationDate?: string;
    marketValue?: string;
    forcedSaleValue?: string;
    modelYear?: string;
    chassisNumber?: string;
    engineNumber?: string;
    color?: string;
    odometer?: string;
  };
}

export interface Vehicle {
  id: string; // Internal UUID or Plate if used as ID
  licensePlate: string;
  vin: string;
  make: string;
  model: string;
  year: string;
  /** Linked platform motor catalog row (KV); set after admin approval or auto match. */
  vehicle_catalog_id?: string;
  /** Optional hints for resolving catalog when multiple variants share make/model/year */
  vehicle_catalog_trim_hint?: string;
  /** Market trim / grade; matches `vehicle_catalog.catalog_trim`. */
  vehicle_catalog_catalog_trim_hint?: string;
  vehicle_catalog_full_model_code_hint?: string;
  vehicle_catalog_emissions_prefix_hint?: string;
  vehicle_catalog_trim_suffix_hint?: string;
  vehicle_catalog_generation_hint?: string;
  vehicle_catalog_model_code_hint?: string;
  vehicle_catalog_chassis_hint?: string;
  vehicle_catalog_drivetrain_hint?: string;
  vehicle_catalog_fuel_type_hint?: string;
  vehicle_catalog_fuel_category_hint?: string;
  vehicle_catalog_fuel_grade_hint?: string;
  vehicle_catalog_transmission_hint?: string;
  /** 1–12; narrows catalog resolution when multiple variants share the same model year */
  vehicle_catalog_production_month_hint?: number;
  /** @deprecated Prefer vehicle_catalog_production_month_hint */
  vehicle_manufacture_month?: number;
  vehicle_catalog_engine_code_hint?: string;
  vehicle_catalog_engine_type_hint?: string;
  color?: string;
  image?: string;
  
  status: VehicleStatus;
  currentDriverId?: string;
  currentDriverName?: string;
  
  // Snapshot Metrics (Computed from daily metrics)
  metrics: {
      todayEarnings: number;
      utilizationRate: number; // 0-100
      totalLifetimeEarnings: number;
      odometer: number;
      fuelLevel: number; // 0-100 (Mocked for now)
      healthScore: number; // 0-100
      // Phase 5: Expanded Efficiency Metrics
      onlineHours?: number;
      onTripHours?: number;
      roiScore?: number;
      maintenanceStatus?: string;
  };

  // Maintenance
  serviceStatus: ServiceStatus;
  nextServiceDate?: string;
  nextServiceType?: string; // e.g. "Oil Change"
  daysToService?: number;
  
  // Documents Expiry & Details
  insuranceExpiry?: string;
  
  // Fitness Certificate
  fitnessExpiry?: string;
  fitnessIssueDate?: string;
  bodyType?: string;
  engineNumber?: string;
  ccRating?: string;
  
  // Registration Certificate
  registrationExpiry?: string;
  registrationIssueDate?: string;
  controlNumber?: string;
  
  // Documents URLs
  fitnessCertificateUrl?: string;
  registrationCertificateUrl?: string;
  
  // Registration Details
  mvid?: string;
  laNumber?: string;
  
  // Toll Configuration
  tollTagId?: string;       // The visible Tag Number (e.g. "212100286450")
  tollTagUuid?: string;     // Link to the TollTag entity ID
  tollTagProvider?: string; // e.g. "JRC", "T-Tag"
  tollBalance?: number;     // Estimated running balance

  // Fuel Configuration
  fuelScenarioId?: string; // ID of the assigned FuelScenario
  fuelSettings?: {
      fuelType: 'Gasoline_87' | 'Gasoline_91' | 'Gasoline_93' | 'Diesel' | 'Electric' | 'Hybrid';
      efficiencyCity: number; // L/100km or MPG
      efficiencyHighway: number; // L/100km or MPG
      tankCapacity: number; // Liters/Gallons
  };

  // Attached Documents
  documents?: VehicleDocument[];

  // Specifications
  specifications?: {
      engineType?: string;
      engineSize?: string;
      transmission?: string;
      driveType?: string;
      kerbWeight?: string;
      aerodynamicAids?: string;
      fuelEconomy?: string; // Storing as string to allow "24.6 km/L" format if user prefers, or mapped to numeric
      tankCapacity?: string; // Display string
      estimatedRangeMin?: number;
      estimatedRangeMax?: number;
      
      // Descriptions (keeping these for display if needed, but the form might just capture values)
      engineDescription?: string;
      transmissionDescription?: string;
      driveTypeDescription?: string;
      weightDescription?: string;
      aeroDescription?: string;
  };
}

export type OdometerSource = 'Service Log' | 'Manual Update' | 'Fuel Log' | 'Trip Import' | 'Baseline';
export type OdometerType = 'Hard' | 'Calculated';

export interface OdometerReading {
  id: string;
  vehicleId: string;
  driverId?: string;
  driverName?: string;
  date: string; // ISO string
  value: number; // The odometer reading in km
  type: OdometerType;
  source: OdometerSource | 'Weekly Check-in' | 'Fuel Receipt';
  notes?: string;
  referenceId?: string; // ID of the service log, document, or trip batch
  imageUrl?: string; // Photo of the odometer
  isVerified: boolean;
  isAnchorPoint?: boolean;
  isManagerVerified?: boolean;
  verifiedBy?: string; // Manager Name
  verifiedAt?: string;
  createdAt: string;
}

export interface MileageReport {
    vehicleId: string;
    periodStart: string;
    periodEnd: string;
    startOdometer: number;
    endOdometer: number;
    totalDistance: number;
    platformDistance: number;      // RideShare km (full: On Trip + Enroute + Open + Unavailable)
    personalDistance: number;      // Legacy: totalDistance - platformDistance (kept for backward compat)
    personalPercentage: number;   // Legacy: kept for backward compat
    anomalyDetected: boolean;
    anomalyReason?: string;
    tripCount: number;
    // 3-way attribution (new fields, all optional for backward compat)
    rideShareDistance?: number;    // Same as platformDistance (explicit name)
    adjustedPersonalDistance?: number;  // From MileageAdjustments with type='Personal'
    companyMiscDistance?: number;  // From MileageAdjustments with type='Company_Misc' or 'Maintenance'
    unaccountedDistance?: number;  // totalDistance - (rideShare + adjustedPersonal + companyMisc)
}

// Phase 1: Unified Restoration Types

export type UnifiedOdometerSource = 'manual' | 'fuel' | 'service' | 'checkin';

export interface UnifiedOdometerEntry extends Omit<OdometerReading, 'source' | 'referenceId'> {
  source: UnifiedOdometerSource;
  referenceId: string; // Required for unified entries to track origin
  metaData?: Record<string, any>;
}

export function isUnifiedOdometerEntry(entry: any): entry is UnifiedOdometerEntry {
  return (
    entry &&
    typeof entry === 'object' &&
    'source' in entry &&
    'value' in entry &&
    'date' in entry &&
    ['manual', 'fuel', 'service', 'checkin'].includes(entry.source)
  );
}