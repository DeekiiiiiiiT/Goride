/**
 * Driver types for hybrid driver architecture
 * Supports both fleet-affiliated and independent drivers
 */

export type DriverMode = 'fleet' | 'independent';

export interface DriverProfile {
  id: string;
  userId: string;
  mode: DriverMode;
  
  // Fleet affiliation (nullable for independent)
  fleetId?: string;
  fleetName?: string;
  fleetJoinedAt?: string;
  fleetRole?: 'driver' | 'lead_driver' | 'trainer';
  
  // Independent driver fields
  vehicleOwnership?: 'owned' | 'rented' | 'financed' | 'leased';
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiry?: string;
  businessLicenseNumber?: string;
  taxId?: string;
  
  // Common fields
  status: 'active' | 'pending' | 'suspended' | 'deactivated';
  onboardingComplete: boolean;
  onboardingStep?: string;
  
  // Profile metadata
  displayName?: string;
  phone?: string;
  profilePhotoUrl?: string;
  backgroundCheckStatus?: 'pending' | 'approved' | 'rejected' | 'expired';
  backgroundCheckDate?: string;
  
  createdAt?: string;
  updatedAt?: string;
}

export interface FleetInfo {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface DriverPermissions {
  canAccessEquipment: boolean;
  canAccessFuelCard: boolean;
  canAccessReimbursements: boolean;
  canAccessWeeklyCheckin: boolean;
  canAccessTaxCenter: boolean;
  canAccessInsurance: boolean;
  canAccessVehicleManagement: boolean;
}

export interface DriverContext {
  profile: DriverProfile | null;
  mode: DriverMode;
  isFleetDriver: boolean;
  isIndependentDriver: boolean;
  fleet: FleetInfo | null;
  permissions: DriverPermissions;
}

export type RidesharePlatform = 'uber' | 'lyft' | 'bolt' | 'indrive' | 'doordash' | 'grubhub' | 'instacart' | 'other';

export interface DriverPlatformConnection {
  id: string;
  driverProfileId: string;
  platform: RidesharePlatform;
  externalDriverId?: string;
  connectionStatus: 'pending' | 'connected' | 'disconnected' | 'error' | 'revoked';
  connectedAt?: string;
  lastSyncAt?: string;
  syncError?: string;
  platformMetadata?: Record<string, unknown>;
}

export interface DriverVehicle {
  id: string;
  driverProfileId: string;
  make: string;
  model: string;
  year: number;
  color?: string;
  licensePlate: string;
  vin?: string;
  ownershipType: 'owned' | 'rented' | 'financed' | 'leased';
  leaseEndDate?: string;
  registrationState?: string;
  registrationExpiry?: string;
  insurancePolicyNumber?: string;
  insuranceExpiry?: string;
  isPrimary: boolean;
  status: 'active' | 'inactive' | 'maintenance' | 'decommissioned';
  uberApproved?: boolean;
  lyftApproved?: boolean;
  boltApproved?: boolean;
  vehiclePhotoUrl?: string;
  notes?: string;
}
