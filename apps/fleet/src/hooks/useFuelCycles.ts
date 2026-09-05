import { useEffect, useMemo, useRef, useState } from 'react';
import { FuelEntry, FuelCycle } from '../types/fuel';
import { calculateFuelCycles } from '../utils/fuelCycleEngine';
import { hydrateFuelCyclesFromEntries } from '../utils/slimFuelCycles';
import { api } from '../services/api';
import { Vehicle } from '../types/vehicle';

export type UseFuelCyclesOptions = {
  weekStart?: string;
  weekEnd?: string;
  /**
   * Force the in-browser engine instead of the server snapshot.
   * Also globally forced by VITE_FUEL_CYCLE_LEGACY_CLIENT === '1'.
   */
  legacyClient?: boolean;
  /**
   * When false, skip the server snapshot (client engine only).
   * Use to avoid N /cycles requests on the Transactions tab.
   */
  enabled?: boolean;
};

/** Keep only cycles that overlap the selected week (after tank math runs). */
function filterCyclesByWeek(all: FuelCycle[], opts: UseFuelCyclesOptions): FuelCycle[] {
  if (!opts.weekStart && !opts.weekEnd) return all;
  return all.filter((c) => {
    const start = String(c.startDate || '').split('T')[0];
    const end = String(c.endDate || '').split('T')[0];
    if (opts.weekEnd && start && start > opts.weekEnd) return false;
    if (opts.weekStart && end && end < opts.weekStart) return false;
    return true;
  });
}

/**
 * Sync client-engine helper — Full Tanks cycles from loaded entries.
 * This is the legacy path and the offline fallback for the hook.
 */
export function buildClientFuelCycles(
  entries: FuelEntry[],
  vehicles: Vehicle[] = [],
  opts: UseFuelCyclesOptions = {},
): FuelCycle[] {
  if (!entries?.length) return [];
  const all = calculateFuelCycles(entries, vehicles);
  return filterCyclesByWeek(all, opts);
}

/** True when the client engine is globally forced via env flag. */
function legacyClientForced(): boolean {
  try {
    return import.meta.env.VITE_FUEL_CYCLE_LEGACY_CLIENT === '1';
  } catch {
    return false;
  }
}

/**
 * Full Tanks cycles for the selected week.
 *
 * Default (server spine): one batched GET /fuel/cycles for all vehicles in range,
 * hydrates transactions from loaded entries, and clips to the week.
 * Falls back to the in-browser engine when the server fetch fails or when the
 * legacy flag is set (VITE_FUEL_CYCLE_LEGACY_CLIENT=1 or opts.legacyClient).
 */
export function useFuelCycles(
  entries: FuelEntry[],
  vehicles: Vehicle[] = [],
  opts: UseFuelCyclesOptions = {},
): FuelCycle[] {
  const legacy = opts.legacyClient === true || legacyClientForced();
  const enabled = opts.enabled !== false;

  // Client engine result — initial paint + guaranteed offline fallback.
  const clientCycles = useMemo(
    () => buildClientFuelCycles(entries, vehicles, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, vehicles, opts.weekStart, opts.weekEnd],
  );

  const [serverCycles, setServerCycles] = useState<FuelCycle[] | null>(null);

  // Stable dependency: the set of vehicles we must ask the server about.
  const vehicleIdsKey = useMemo(
    () =>
      Array.from(
        new Set((entries || []).map((e) => e.vehicleId).filter((v): v is string => !!v)),
      )
        .sort()
        .join(','),
    [entries],
  );

  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    if (!enabled || legacy || !vehicleIdsKey) {
      setServerCycles(null);
      return;
    }
    let cancelled = false;
    const vehicleIds = vehicleIdsKey.split(',').filter(Boolean);

    (async () => {
      try {
        let slim: Awaited<ReturnType<typeof api.getFuelCycles>>['cycles'] = [];
        try {
          // Prefer one round-trip (needs server vehicleIds support).
          const result = await api.getFuelCycles({
            vehicleIds,
            weekStart: opts.weekStart,
            weekEnd: opts.weekEnd,
          });
          slim = result?.cycles ? result.cycles : [];
        } catch (batchErr) {
          // Older edge builds only accept vehicleId — fall back to parallel GETs.
          console.warn('[useFuelCycles] batched /cycles failed, trying per-vehicle', batchErr);
          const results = await Promise.all(
            vehicleIds.map((vehicleId) =>
              api.getFuelCycles({
                vehicleId,
                weekStart: opts.weekStart,
                weekEnd: opts.weekEnd,
              }),
            ),
          );
          slim = results.flatMap((r) => (r?.cycles ? r.cycles : []));
        }
        const hydrated = hydrateFuelCyclesFromEntries(slim, entriesRef.current);
        const filtered = filterCyclesByWeek(hydrated, opts);
        if (!cancelled) setServerCycles(filtered);
      } catch (err) {
        // Silent fall back to the client engine — Full Tanks must never blank out.
        console.warn('[useFuelCycles] server snapshot failed, using client engine', err);
        if (!cancelled) setServerCycles(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, legacy, vehicleIdsKey, opts.weekStart, opts.weekEnd]);

  return !legacy && enabled && serverCycles ? serverCycles : clientCycles;
}
