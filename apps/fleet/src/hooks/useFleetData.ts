import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Vehicle } from '../types/vehicle';

/** Legacy equipment list — removed with R3-17; vehicles only. */
export function useFleetExpenses() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const vehicleData = await api.getVehicles();
      setVehicles(vehicleData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load fleet data';
      console.error('Failed to fetch fleet data', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return {
    equipment: [] as const,
    vehicles,
    loading,
    error,
    refresh: fetchData,
  };
}
