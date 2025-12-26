export type VehicleStatus = 'Active' | 'Maintenance' | 'Inactive' | 'Decommissioned';
export type ServiceStatus = 'OK' | 'Due Soon' | 'Overdue';

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
  
  // Attached Documents
  documents?: VehicleDocument[];
}

export type OdometerSource = 'Service Log' | 'Manual Update' | 'Fuel Log' | 'Trip Import' | 'Baseline';
export type OdometerType = 'Hard' | 'Calculated';

export interface OdometerReading {
  id: string;
  vehicleId: string;
  date: string; // ISO string
  value: number; // The odometer reading in km
  type: OdometerType;
  source: OdometerSource;
  notes?: string;
  referenceId?: string; // ID of the service log, document, or trip batch
  createdAt: string;
}
