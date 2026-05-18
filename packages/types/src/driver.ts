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

export type DriverAccountStatus = 'active' | 'pending' | 'suspended' | 'deactivated';

export type DriverLiveStatus = 'online' | 'offline' | 'on_trip';

export interface DriverDirectoryRow {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  status: DriverAccountStatus;
  live_status: DriverLiveStatus;
  mode: string;
  fleet_id: string | null;
  onboarding_complete: boolean;
  background_check_status: string | null;
  total_trips: number;
  completed_trips: number;
  cancelled_trips: number;
  offers_sent: number;
  offers_accepted: number;
  offers_declined: number;
  acceptance_rate_pct: number | null;
  completion_rate_pct: number | null;
  lifetime_earnings_minor: number;
  last_ride_at: string | null;
  last_online_at: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
}

export interface DriverDirectoryStats {
  total_trips: number;
  completed_trips: number;
  cancelled_trips: number;
  offers_sent: number;
  offers_accepted: number;
  offers_declined: number;
  acceptance_rate_pct: number | null;
  completion_rate_pct: number | null;
  lifetime_earnings_minor: number;
  last_ride_at: string | null;
  last_online_at: string | null;
}

export interface DriverAdminPermissions {
  can_write: boolean;
}

export interface DriverDetailDto {
  user_id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  status: DriverAccountStatus;
  live_status: DriverLiveStatus;
  mode: string;
  fleet_id: string | null;
  onboarding_complete: boolean;
  onboarding_step: string | null;
  background_check_status: string | null;
  background_check_date: string | null;
  insurance_expiry: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  location: {
    user_id: string;
    lat: number;
    lng: number;
    available_for_rides: boolean;
    updated_at: string;
  } | null;
  stats: DriverDirectoryStats;
  recent_trips: Array<Record<string, unknown>>;
  recent_offers: Array<Record<string, unknown>>;
  vehicles: Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    license_plate: string;
    is_primary: boolean;
    status: string;
  }>;
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
