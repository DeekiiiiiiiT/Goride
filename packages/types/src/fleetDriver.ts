/**
 * Fleet driver roster (KV `driver:` / `fleet.drivers`) — distinct from public.driver_profiles.
 */
export interface FleetDriver {
  id: string;
  organizationId?: string;
  name?: string;
  driverName?: string;
  email?: string;
  phone?: string;
  status?: string;
  assignedVehicleId?: string;
  assignedVehiclePlate?: string;
  assignedVehicleName?: string;
  uberDriverId?: string;
  inDriveDriverId?: string;
  licenseFrontUrl?: string;
  licenseBackUrl?: string;
  proofOfAddressUrl?: string;
  proofOfAddressType?: string;
  fuelScenarioId?: string;
  acceptanceRate?: number;
  cancellationRate?: number;
  completionRate?: number;
  ratingLast500?: number;
  totalEarnings?: number;
  productLine?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}
