import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useDriver } from '../contexts/DriverContext';
import { api } from '../services/api';
import { getCanonicalDriverName } from '@roam/types/driverIdentity';

function applyVehicleToMatch(match: Record<string, any>, assignedVehicle: Record<string, any>) {
  match.assignedVehicleId = assignedVehicle.id;
  match.assignedVehiclePlate =
    assignedVehicle.plateNumber || assignedVehicle.licensePlate || 'Unknown Plate';
  match.assignedVehicleName =
    assignedVehicle.vehicleName ||
    `${assignedVehicle.make || ''} ${assignedVehicle.model || ''}`.trim();
  match.vehicle = assignedVehicle.id;
}

/**
 * Prefer an already-known vehicle id; otherwise find the vehicle whose
 * currentDriverId matches any of the driver's known ids (auth / fleet / alias).
 */
function findAssignedVehicle(
  vehicles: Array<Record<string, any>>,
  match: Record<string, any>,
  userId?: string,
) {
  if (match.assignedVehicleId) {
    const byId = vehicles.find((v) => String(v.id) === String(match.assignedVehicleId));
    if (byId) return byId;
  }
  const driverIds = [userId, match.id, match.driverId, match.userId]
    .filter(Boolean)
    .map(String);
  return vehicles.find(
    (v) => v.currentDriverId && driverIds.some((id) => String(v.currentDriverId) === id),
  );
}

export const CURRENT_DRIVER_QUERY_KEY = ['driver-roster-resolve'] as const;

async function resolveCurrentDriver(
  user: { id: string; email?: string | null; user_metadata?: { name?: string } },
  fleetId?: string,
): Promise<Record<string, any>> {
  // Drivers list must not kill identity resolution — vehicle SSOT can still heal us.
  const drivers = await api.getDrivers().catch((err) => {
    console.warn('[DriverSync] getDrivers failed — will resolve via vehicles', err);
    return [] as any[];
  });

  // 1. Auth ID = Driver ID
  let match = drivers.find((d: any) => d.id === user.id);

  // 1b. Explicit user_id link on fleet.drivers
  if (!match) {
    match = drivers.find((d: any) => d.userId === user.id || d.user_id === user.id);
  }

  // 2. Email
  if (!match && user.email) {
    match = drivers.find((d: any) => d.email?.toLowerCase() === user.email?.toLowerCase());
  }

  // 3. Name (exact then partial)
  if (!match && user.user_metadata?.name) {
    const userName = user.user_metadata.name.trim().toLowerCase();
    if (userName) {
      match = drivers.find((d: any) => {
        const dName = (d.driverName || d.name || '').trim().toLowerCase();
        return dName === userName;
      });

      if (!match) {
        match = drivers.find((d: any) => {
          const dName = (d.driverName || d.name || '').trim().toLowerCase();
          if (dName.length < 3 || userName.length < 3) return false;
          return dName.includes(userName) || userName.includes(dName);
        });
      }
    }
  }

  if (match) {
    const canonicalName = getCanonicalDriverName(match);
    console.log(`[DriverSync] Resolved Identity: ${user.email} -> ${canonicalName} (${match.id})`);
    match.name = canonicalName;
    match.driverName = canonicalName;
  } else {
    console.warn(
      `[DriverSync] Could not link '${user.email}' to any driver record — stubbing with auth id.`,
    );
    match = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name,
    };
  }

  // Always heal vehicle assignment from vehicles SSOT (currentDriverId / assignedVehicleId).
  if (!match.assignedVehicleId || !match.assignedVehiclePlate) {
    try {
      const vehicles = await api.getVehicles();
      let assignedVehicle = findAssignedVehicle(vehicles, match, user.id);

      if (!assignedVehicle) {
        const userName = (
          match.name ||
          match.driverName ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          ''
        )
          .trim()
          .toLowerCase();
        if (userName.length >= 3) {
          assignedVehicle = vehicles.find((v: any) => {
            const assignedName = (v.currentDriverName || '').trim().toLowerCase();
            if (!assignedName) return false;
            return (
              assignedName === userName ||
              assignedName.includes(userName) ||
              userName.includes(assignedName)
            );
          });
        }
      }

      if (assignedVehicle) {
        applyVehicleToMatch(match, assignedVehicle);
        console.log(
          `[DriverSync] Vehicle assignment: ${match.assignedVehiclePlate} (${match.assignedVehicleId})`,
        );
      }
    } catch (err) {
      console.warn('[DriverSync] Failed to check vehicles for assignment', err);
    }
  }

  if (!match.assignedVehicleId) {
    try {
      const eligibility = await api.getCheckInEligibility(String(match.id || user.id));
      if (eligibility?.vehicleId) {
        match.assignedVehicleId = eligibility.vehicleId;
        match.vehicle = eligibility.vehicleId;
        if (eligibility.vehicleLabel) {
          match.assignedVehiclePlate = eligibility.vehicleLabel;
          match.assignedVehicleName = eligibility.vehicleLabel;
        }
        console.log(`[DriverSync] Vehicle from check-in eligibility: ${eligibility.vehicleId}`);
      }
    } catch (err) {
      console.warn('[DriverSync] Eligibility vehicle heal failed', err);
    }
  }

  let record = match;
  if (fleetId && !(record as any).organizationId) {
    record = { ...record, organizationId: fleetId };
  }
  return record;
}

/** Shared roster resolve — one network trip for all consumers on the home tree. */
export function useCurrentDriver() {
  const { user } = useAuth();
  const { profile } = useDriver();
  const fleetId = profile?.fleetId;

  const query = useQuery({
    queryKey: [...CURRENT_DRIVER_QUERY_KEY, user?.id, fleetId ?? null],
    queryFn: () => resolveCurrentDriver(user!, fleetId),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  return {
    driverRecord: query.data ?? (user ? { id: user.id } : null),
    loading: query.isLoading || query.isFetching,
  };
}
