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
}
