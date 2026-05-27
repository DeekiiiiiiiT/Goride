import { useCallback, useEffect, useState } from 'react';
import type { AppPermissionPolicyRow, AppPermissionSurface } from '@roam/types';
import { fetchAppPermissionPolicy } from '@/services/permissionPolicyEdge';

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; permissions: AppPermissionPolicyRow[] }>();

export function usePermissionPolicy(surface: AppPermissionSurface) {
  const [permissions, setPermissions] = useState<AppPermissionPolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const hit = cache.get(surface);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      setPermissions(hit.permissions);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchAppPermissionPolicy(surface);
      cache.set(surface, { at: Date.now(), permissions: next });
      setPermissions(next);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load permission policy');
    } finally {
      setLoading(false);
    }
  }, [surface]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { permissions, loading, error, refresh };
}
