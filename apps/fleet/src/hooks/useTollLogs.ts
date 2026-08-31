import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Vehicle } from '../types/vehicle';
import { TollPlaza } from '../types/toll';
import { TollLogEntry } from '../types/tollLog';
import { enrichTollLogEntries } from '@roam/toll-core';

interface DriverRecord {
  id: string;
  name?: string;
  driverId?: string;
  [key: string]: any;
}

/**
 * Fleet useTollLogs — fetches /toll-logs then enriches via shared @roam/toll-core.
 */
export function useTollLogs() {
  const [logs, setLogs] = useState<TollLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [plazas, setPlazas] = useState<TollPlaza[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tollResponse, allVehicles, allDrivers, allPlazas] = await Promise.all([
        api.getTollLogs(),
        api.getVehicles(),
        api.getDrivers(),
        api.getTollPlazas().catch(() => [] as TollPlaza[]),
      ]);

      setVehicles(allVehicles);
      setDrivers(allDrivers);
      setPlazas(allPlazas);

      const enriched = enrichTollLogEntries({
        transactions: (tollResponse?.data || []) as any[],
        vehicles: allVehicles || [],
        drivers: allDrivers || [],
        plazas: (allPlazas || []) as any[],
      }) as TollLogEntry[];

      setLogs(enriched);
      console.log(
        `[useTollLogs] Loaded ${enriched.length} toll transactions via /toll-logs (server total: ${tollResponse?.total || '?'})`,
      );
    } catch (err) {
      console.error('[useTollLogs] Failed to fetch toll logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    logs,
    loading,
    vehicles,
    drivers,
    plazas,
    refresh: fetchData,
  };
}
