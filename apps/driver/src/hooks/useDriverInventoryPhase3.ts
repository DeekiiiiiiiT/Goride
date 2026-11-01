import { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '@roam/api-client';
import { getPlatformFlagsHeaders } from '../utils/authHeaders';

/** Driver app — gate car kit on fleet_inventory_phase3_kits (R3-08 / R5-16). */
export function useDriverInventoryPhase3Enabled(): boolean {
  const raw = import.meta.env.VITE_FLEET_INVENTORY_PHASE3_KITS;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;

  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await getPlatformFlagsHeaders();
        const r = await fetch(`${API_ENDPOINTS.fleetCore}/platform-feature-flags`, { headers });
        if (!r.ok) return;
        const body = await r.json();
        if (cancelled) return;
        const modules = (body?.enabledModules ?? {}) as Record<string, boolean>;
        setEnabled(modules.fleet_inventory_phase3_kits === true);
      } catch {
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
