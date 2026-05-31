import { useEffect, useState } from 'react';
import { api } from '../services/api';

export type DocStatus = 'valid' | 'warning' | 'error';

export function getDocStatus(dateStr?: string): { status: DocStatus; text: string } {
  if (!dateStr) return { status: 'error', text: 'Missing' };
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (days < 0) return { status: 'error', text: `Expired ${Math.abs(days)} days ago` };
  if (days < 30) return { status: 'warning', text: `Expires in ${days} days` };

  return {
    status: 'valid',
    text: `Expires ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
  };
}

type DriverLike = { id?: string; driverId?: string; vehicle?: string } | null;
type UserLike = { id?: string } | null;

export function useDriverProfileExtras(driverRecord: DriverLike, user: UserLike) {
  const [vehicle, setVehicle] = useState<Record<string, unknown> | null>(null);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchVehicleAndMetrics = async () => {
      if (!user?.id && !driverRecord?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const vehicles = await api.getVehicles();
        const myVehicle = vehicles.find(
          (v: Record<string, unknown>) =>
            v.assignedDriverId === driverRecord?.id ||
            v.assignedDriverId === user?.id ||
            (driverRecord?.vehicle &&
              (v.id === driverRecord.vehicle || v.licensePlate === driverRecord.vehicle)),
        );

        const allMetrics = await api.getDriverMetrics();
        const myMetrics = allMetrics.find(
          (m: Record<string, unknown>) =>
            m.driverId === user?.id ||
            (driverRecord?.id && m.driverId === driverRecord.id) ||
            (driverRecord?.driverId && m.driverId === driverRecord.driverId),
        );

        if (!cancelled) {
          setVehicle(myVehicle ?? null);
          setMetrics(myMetrics ?? null);
        }
      } catch (e) {
        console.error('Error fetching profile data', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchVehicleAndMetrics();
    return () => {
      cancelled = true;
    };
  }, [user?.id, driverRecord?.id, driverRecord?.vehicle, driverRecord?.driverId]);

  return { vehicle, metrics, loading };
}
