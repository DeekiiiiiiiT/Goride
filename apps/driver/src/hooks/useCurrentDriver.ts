import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { getCanonicalDriverName } from '@roam/types/driverIdentity';
import { supabase } from '../utils/supabase/client';

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

export function useCurrentDriver() {
  const { user } = useAuth();
  const [driverRecord, setDriverRecord] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const resolveDriver = async () => {
      try {
        setLoading(true);
        // Drivers list must not kill identity resolution — vehicle SSOT can still heal us.
        const [drivers, profileRes] = await Promise.all([
          api.getDrivers().catch((err) => {
            console.warn('[DriverSync] getDrivers failed — will resolve via vehicles', err);
            return [] as any[];
          }),
          supabase.from('driver_profiles').select('fleet_id, mode').eq('user_id', user.id).maybeSingle(),
        ]);

        // 1. Auth ID = Driver ID
        let match = drivers.find((d: any) => d.id === user.id);

        // 1b. Explicit user_id link on fleet.drivers
        if (!match) {
          match = drivers.find(
            (d: any) => d.userId === user.id || d.user_id === user.id,
          );
        }

        // 2. Email
        if (!match && user.email) {
          match = drivers.find(
            (d: any) => d.email?.toLowerCase() === user.email?.toLowerCase(),
          );
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
          console.log(
            `[DriverSync] Resolved Identity: ${user.email} -> ${canonicalName} (${match.id})`,
          );
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
        // Previously a failed getDrivers() left fleet drivers with no vehicle forever, so
        // weekly check-in threw "No vehicle assigned" even when custody was in_custody.
        if (!match.assignedVehicleId || !match.assignedVehiclePlate) {
          try {
            const vehicles = await api.getVehicles();
            let assignedVehicle = findAssignedVehicle(vehicles, match, user.id);

            // Fallback: match by currentDriverName when ids diverge
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

        // Last resort: eligibility knows the in-custody vehicle after hand-over even when
        // GET /vehicles is 403 (JWT missing organizationId). Covers new fleet test drivers.
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
              console.log(
                `[DriverSync] Vehicle from check-in eligibility: ${eligibility.vehicleId}`,
              );
            }
          } catch (err) {
            console.warn('[DriverSync] Eligibility vehicle heal failed', err);
          }
        }

        let record = match;
        const fleetId = profileRes.data?.fleet_id as string | undefined;
        if (fleetId && !(record as any).organizationId) {
          record = { ...record, organizationId: fleetId };
        }

        setDriverRecord(record);
      } catch (e) {
        console.error('Failed to resolve driver identity', e);
        setDriverRecord({ id: user.id });
      } finally {
        setLoading(false);
      }
    };

    void resolveDriver();
  }, [user?.id, user?.email, user?.user_metadata?.name]);

  return { driverRecord, loading };
}
