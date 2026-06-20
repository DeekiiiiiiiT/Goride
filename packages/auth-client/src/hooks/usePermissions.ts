import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PermissionKey } from '../platformPermissions';
import type { UserPermissionContext } from '../roleHierarchy';
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabaseDriverApp as defaultSupabase } from '../supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

const EMPTY_CONTEXT: UserPermissionContext = {
  userId: '',
  permissions: [],
  roleLevel: 0,
  isPlatformUser: false,
  roleNames: [],
};

export type UsePermissionsOptions = {
  supabase?: SupabaseClient;
  enabled?: boolean;
};

export function usePermissions(options: UsePermissionsOptions = {}) {
  const supabase = options.supabase ?? defaultSupabase;
  const enabled = options.enabled ?? true;
  const [context, setContext] = useState<UserPermissionContext>(EMPTY_CONTEXT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setContext(EMPTY_CONTEXT);
        return;
      }

      const res = await fetch(`${API_ENDPOINTS.identity}/permissions`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: publicAnonKey,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load permissions (${res.status})`);
      }

      const data = await res.json() as {
        userId: string;
        permissions: PermissionKey[];
        roleLevel: number;
        isPlatformUser: boolean;
        roles: string[];
      };

      setContext({
        userId: data.userId,
        permissions: data.permissions ?? [],
        roleLevel: data.roleLevel ?? 0,
        isPlatformUser: data.isPlatformUser ?? false,
        roleNames: data.roles ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load permissions');
      setContext(EMPTY_CONTEXT);
    } finally {
      setLoading(false);
    }
  }, [enabled, supabase]);

  useEffect(() => {
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => subscription.unsubscribe();
  }, [refresh, supabase]);

  const permissionSet = useMemo(
    () => new Set(context.permissions),
    [context.permissions],
  );

  const hasPermission = useCallback(
    (key: PermissionKey | PermissionKey[]) => {
      const keys = Array.isArray(key) ? key : [key];
      return keys.some((k) => permissionSet.has(k));
    },
    [permissionSet],
  );

  const hasAllPermissions = useCallback(
    (keys: PermissionKey[]) => keys.every((k) => permissionSet.has(k)),
    [permissionSet],
  );

  return {
    ...context,
    loading,
    error,
    refresh,
    hasPermission,
    hasAllPermissions,
    permissions: context.permissions,
  };
}
