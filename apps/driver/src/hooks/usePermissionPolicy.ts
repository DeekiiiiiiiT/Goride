import { useCallback, useEffect, useState } from 'react';
import type { AppPermissionPolicyRow } from '@roam/types';
import { fetchAppPermissionPolicy } from '../services/permissionPolicyEdge';

const CACHE_MS = 60_000;
let cached: { at: number; permissions: AppPermissionPolicyRow[] } | null = null;

export function useDriverPermissionPolicy() {
  const [permissions, setPermissions] = useState<AppPermissionPolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setPermissions(cached.permissions);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchAppPermissionPolicy('driver');
      cached = { at: Date.now(), permissions: next };
      setPermissions(next);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load permission policy');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { permissions, loading, error, refresh };
}
