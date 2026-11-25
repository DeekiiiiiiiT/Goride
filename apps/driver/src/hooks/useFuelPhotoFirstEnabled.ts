import { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '@roam/api-client';
import { getPlatformFlagsHeaders } from '../utils/authHeaders';

const CACHE_KEY = 'roam:driver:flag:fuelPhotoFirstEnabled';

/**
 * Fuel log, photos first (docs/fuel-log-offline-first-audit.md, S8): the new fuel screens.
 * Off until go-live; on = every company at once. VITE_FUEL_PHOTO_FIRST=1 turns it on locally.
 * The last answer is kept on the phone, so the switch still works with no signal.
 */
export function useFuelPhotoFirstEnabled(): boolean {
  const raw = import.meta.env.VITE_FUEL_PHOTO_FIRST;
  const forced = raw === '1' || raw === 'true' ? true : raw === '0' || raw === 'false' ? false : null;

  const [enabled, setEnabled] = useState<boolean>(() => {
    if (forced != null) return forced;
    try {
      return localStorage.getItem(CACHE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (forced != null) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = await getPlatformFlagsHeaders();
        const r = await fetch(`${API_ENDPOINTS.fleetCore}/platform-feature-flags`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) return;
        const body = await r.json();
        if (cancelled) return;
        const on = (body?.enabledModules ?? {}).fuelPhotoFirstEnabled === true;
        setEnabled(on);
        try {
          localStorage.setItem(CACHE_KEY, on ? '1' : '0');
        } catch {
          /* ignore */
        }
      } catch {
        /* keep the last known answer */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forced]);

  return enabled;
}
