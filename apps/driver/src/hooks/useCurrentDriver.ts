import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { supabase } from '../utils/supabase/client';

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
            const [drivers, profileRes] = await Promise.all([
                api.getDrivers(),
                supabase.from('driver_profiles').select('fleet_id, mode').eq('user_id', user.id).maybeSingle(),
            ]);
            
            // 1. Try to find match by ID (Auth ID = Driver ID)
            let match = drivers.find((d: any) => d.id === user.id);
            
            // 2. If not found, try to match by Email
            if (!match && user.email) {
                match = drivers.find((d: any) => d.email?.toLowerCase() === user.email?.toLowerCase());
            }

            // 3. If still not found, try to match by Name (Case insensitive)
            if (!match && user.user_metadata?.name) {
                const userName = user.user_metadata.name.trim().toLowerCase();
                if (userName) {
                    // A. Exact Name Match
                    match = drivers.find((d: any) => {
                        const dName = (d.driverName || d.name || '').trim().toLowerCase();
                        return dName === userName;
                    });

                    // B. Partial Name Match (Fallback) - "Kenny" matches "Kenny Smith"
                    if (!match) {
                        match = drivers.find((d: any) => {
                            const dName = (d.driverName || d.name || '').trim().toLowerCase();
                            // Only match if one name is at least 3 chars to avoid "Ed" matching "Eddie" too aggressively
                            if (dName.length < 3 || userName.length < 3) return false;
                            return dName.includes(userName) || userName.includes(dName);
                        });
                    }
                }
            }

            if (match) {
                console.log(`[DriverSync] Resolved Identity: ${user.email} -> ${match.driverName || match.name} (${match.id})`);
                match.name = match.driverName || match.name;
                
                // Enhanced Vehicle Resolution: If driver record doesn't have assignedVehicleId, try to find it in vehicles list
                if (!match.assignedVehicleId) {
                    try {
                        const vehicles = await api.getVehicles();
                        const assignedVehicle = vehicles.find((v: any) => 
                            v.currentDriverId === match.id || 
                            v.currentDriverId === match.driverId
                        );
                        if (assignedVehicle) {
                            match.assignedVehicleId = assignedVehicle.id;
                            match.assignedVehiclePlate = assignedVehicle.plateNumber || assignedVehicle.licensePlate || 'Unknown Plate';
                            match.assignedVehicleName = assignedVehicle.vehicleName || `${assignedVehicle.make || ''} ${assignedVehicle.model || ''}`.trim();
                            // Also map 'vehicle' property just in case legacy code uses it
                            match.vehicle = assignedVehicle.id; 
                        }
                    } catch (err) {
                        console.warn("[DriverSync] Failed to check vehicles for assignment", err);
                    }
                }
            } else {
                console.warn(`[DriverSync] Could not link '${user.email}' to any driver record.`);
                // Fallback: resolve via fleet vehicle assignment name (e.g. currentDriverName on vehicle)
                try {
                    const vehicles = await api.getVehicles();
                    const userName = (user.user_metadata?.name || user.email?.split('@')[0] || '').trim().toLowerCase();
                    if (userName.length >= 3) {
                        const assignedVehicle = vehicles.find((v: any) => {
                            const assignedName = (v.currentDriverName || '').trim().toLowerCase();
                            if (!assignedName) return false;
                            return (
                                assignedName === userName ||
                                assignedName.includes(userName) ||
                                userName.includes(assignedName)
                            );
                        });
                        if (assignedVehicle?.currentDriverId) {
                            match = drivers.find(
                                (d: any) =>
                                    d.id === assignedVehicle.currentDriverId ||
                                    d.driverId === assignedVehicle.currentDriverId
                            );
                            if (match) {
                                console.log(
                                    `[DriverSync] Resolved via vehicle assignment: ${assignedVehicle.currentDriverName} (${match.id})`
                                );
                                match.name = match.driverName || match.name;
                                match.assignedVehicleId = assignedVehicle.id;
                                match.assignedVehiclePlate =
                                    assignedVehicle.plateNumber || assignedVehicle.licensePlate || 'Unknown Plate';
                                match.assignedVehicleName =
                                    assignedVehicle.vehicleName ||
                                    `${assignedVehicle.make || ''} ${assignedVehicle.model || ''}`.trim();
                                match.vehicle = assignedVehicle.id;
                            }
                        }
                    }
                } catch (err) {
                    console.warn("[DriverSync] Vehicle assignment name fallback failed", err);
                }
            }

            let record = match || { id: user.id, email: user.email, name: user.user_metadata?.name };
            const fleetId = profileRes.data?.fleet_id as string | undefined;
            if (fleetId && !(record as any).organizationId) {
                record = { ...record, organizationId: fleetId };
            }

            setDriverRecord(record);
        } catch (e) {
            console.error("Failed to resolve driver identity", e);
            // Fallback
            setDriverRecord({ id: user.id });
        } finally {
            setLoading(false);
        }
    };

    resolveDriver();
  }, [user?.id, user?.email, user?.user_metadata?.name]);

  return { driverRecord, loading };
}
