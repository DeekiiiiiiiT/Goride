import { useEffect, useMemo, useState } from 'react';
import { FuelEntry, FuelCycle } from '../types/fuel';
import { calculateFuelCycles } from '../utils/fuelCycleEngine';
import { Vehicle } from '../types/vehicle';
import { api } from '../services/api';

export type UseFuelCyclesOptions = {
  weekStart?: string;
  weekEnd?: string;
  /** Force client-side engine (VITE_FUEL_CYCLE_LEGACY_CLIENT=1 or explicit) */
  legacyClient?: boolean;
};

/**
 * Reads server cycle snapshots when available; falls back to local engine for legacy rows.
 */
export function useFuelCycles(
  entries: FuelEntry[],
  vehicles: Vehicle[] = [],
  opts: UseFuelCyclesOptions = {},
): FuelCycle[] {
  const legacyEnv = import.meta.env.VITE_FUEL_CYCLE_LEGACY_CLIENT === '1';
  const useLegacy = opts.legacyClient ?? legacyEnv;

  const clientCycles = useMemo(() => {
    if (!entries?.length) return [];
    return calculateFuelCycles(entries, vehicles);
  }, [entries, vehicles]);

  const vehicleIds = useMemo(
    () => [...new Set(entries.map((e) => e.vehicleId).filter(Boolean))] as string[],
    [entries],
  );

  const [serverCycles, setServerCycles] = useState<FuelCycle[] | null>(null);

  useEffect(() => {
    if (useLegacy || vehicleIds.length === 0) {
      setServerCycles(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const batches = await Promise.all(
          vehicleIds.map((vid) =>
            api.getFuelCycles({
              vehicleId: vid,
              weekStart: opts.weekStart,
              weekEnd: opts.weekEnd,
            }),
          ),
        );
        if (cancelled) return;
        const merged = batches.flatMap((b) => b.cycles || []);
        setServerCycles(merged.length ? merged : null);
      } catch {
        if (!cancelled) setServerCycles(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vehicleIds.join(','), opts.weekStart, opts.weekEnd, useLegacy]);

  return serverCycles ?? clientCycles;
}
